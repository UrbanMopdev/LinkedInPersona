import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding, generateQueryEmbedding } from "@/lib/embeddings";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, conversationId } = await req.json();
  if (!message || typeof message !== "string") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  try {
    // 1. Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const title = message.slice(0, 80) + (message.length > 80 ? "…" : "");
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title })
        .select("id")
        .single();
      if (convError) throw convError;
      convId = conv.id;
    }

    // 2. Save user message
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: "user",
      content: message,
    });
    if (msgError) throw msgError;

    // 3. Generate query embedding
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await generateQueryEmbedding(message);
    } catch {
      // If Voyage AI is not configured, skip vector search
    }

    // 4. Retrieve relevant context
    let memoryContext: { content: string; category: string | null }[] = [];
    let archiveContext: { content: string; posted_at: string | null }[] = [];

    if (queryEmbedding) {
      // Top 5 relevant user_memory rows
      const { data: memories } = await supabase.rpc("match_user_memory", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_user_id: user.id,
        match_count: 5,
      });
      if (memories) memoryContext = memories;

      // Top 5 similar linkedin_posts_archive posts
      const { data: posts } = await supabase.rpc("match_linkedin_posts", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_user_id: user.id,
        match_count: 5,
      });
      if (posts) archiveContext = posts;
    }

    // 5. Retrieve last 10 conversation messages
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(10);

    const history = (recentMessages || []).reverse();

    // 6. Fetch voice guide
    const { data: profile } = await supabase
      .from("profiles")
      .select("voice_guide")
      .eq("id", user.id)
      .single();

    // 7. Construct context bundle
    const contextParts: string[] = [
      "You are a helpful LinkedIn content strategist and writing assistant.",
      "You help the user brainstorm ideas, draft posts, refine their voice, and improve their LinkedIn presence.",
    ];

    if (profile?.voice_guide) {
      contextParts.push(
        `\nThe user has this voice/style guide:\n"""\n${profile.voice_guide}\n"""`,
      );
    }

    if (memoryContext.length > 0) {
      contextParts.push(
        "\nRelevant user context/memories:\n" +
          memoryContext
            .map(
              (m, i) =>
                `${i + 1}. ${m.content}${m.category ? ` [${m.category}]` : ""}`,
            )
            .join("\n"),
      );
    }

    if (archiveContext.length > 0) {
      contextParts.push(
        "\nRelevant past LinkedIn posts by this user:\n" +
          archiveContext
            .map(
              (p, i) =>
                `${i + 1}. ${p.content.slice(0, 300)}${p.content.length > 300 ? "…" : ""}`,
            )
            .join("\n\n"),
      );
    }

    const systemPrompt = contextParts.join("\n");

    // Build messages array for the LLM
    const llmMessages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // 8. Call Claude
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      system: systemPrompt,
      messages: llmMessages,
    });

    // 9. Save assistant response
    const { error: assistantMsgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: convId,
        user_id: user.id,
        role: "assistant",
        content: text,
      });
    if (assistantMsgError) throw assistantMsgError;

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", convId);

    return Response.json({
      response: text,
      conversationId: convId,
    });
  } catch (e: unknown) {
    const message2 = e instanceof Error ? e.message : "Chat failed";
    return Response.json({ error: message2 }, { status: 500 });
  }
}
