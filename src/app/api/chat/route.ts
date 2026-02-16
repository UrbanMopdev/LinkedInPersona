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
    let meetingArtifactContext: {
      id: string;
      type: string;
      content: string;
      context: string | null;
      theme: string | null;
      pillar: string | null;
      meeting_title: string | null;
    }[] = [];

    if (queryEmbedding) {
      // Top 5 relevant user_memory rows
      const { data: memories } = await supabase.rpc("match_user_memory", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_user_id: user.id,
        match_count: 5,
      });
      if (memories) memoryContext = memories;

      // Top 5 similar linkedin_posts_archive posts
      const { data: archivePosts } = await supabase.rpc(
        "match_linkedin_posts",
        {
          query_embedding: JSON.stringify(queryEmbedding),
          match_user_id: user.id,
          match_count: 5,
        },
      );
      if (archivePosts) archiveContext = archivePosts;

      // Top 5 relevant meeting artifacts
      const { data: meetingArtifacts } = await supabase.rpc(
        "match_meeting_artifacts",
        {
          query_embedding: JSON.stringify(queryEmbedding),
          match_user_id: user.id,
          match_count: 5,
        },
      );
      if (meetingArtifacts) meetingArtifactContext = meetingArtifacts;
    }

    // 4b. Fetch ALL posts from the database for full context
    const { data: allPosts } = await supabase
      .from("posts")
      .select(
        "title, content, status, pillar, platform, post_type, target_icp, tags, notes, published_at, scheduled_at",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    // 5. Retrieve last 10 conversation messages
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(10);

    const history = (recentMessages || []).reverse();

    // 6. Fetch voice guide + voice fingerprint
    const { data: profile } = await supabase
      .from("profiles")
      .select("voice_guide, voice_fingerprint, positioning_summary")
      .eq("id", user.id)
      .single();

    // 7. Construct context bundle
    const contextParts: string[] = [
      "You are a helpful LinkedIn content strategist and writing assistant.",
      "You help the user brainstorm ideas, draft posts, refine their voice, and improve their LinkedIn presence.",
      "",
      "IMPORTANT: When the user asks you to create, draft, or curate a post, you MUST format it using the following block so they can save it directly to their calendar:",
      '```post',
      'TITLE: [Post title]',
      'PILLAR: [Content pillar, e.g. Real Decisions Real Trade-offs]',
      'PLATFORM: LinkedIn',
      'POST_TYPE: [e.g. Short insight, Commentary, Story, Listicle]',
      'TARGET_ICP: [Target audience]',
      'TAGS: [comma-separated tags]',
      'STATUS: draft',
      'NOTES: [Any signal notes or context]',
      '---',
      '[The actual post content here]',
      '```',
      "",
      "Always fill in ALL the attributes above based on context from the user's existing posts, voice, and positioning. Only produce ONE post at a time. Make the post content ready to use — hooks, body, CTA, everything.",
    ];

    // Prefer voice_fingerprint (AI-generated from import) over manual voice_guide
    const voiceInstructions =
      profile?.voice_fingerprint || profile?.voice_guide;
    if (voiceInstructions) {
      contextParts.push(
        `\nThe user has this voice/style guide — always match this voice:\n"""\n${voiceInstructions}\n"""`,
      );
    }

    if (profile?.positioning_summary) {
      contextParts.push(
        `\nThe user's professional positioning:\n"""\n${profile.positioning_summary}\n"""`,
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

    if (meetingArtifactContext.length > 0) {
      contextParts.push(
        "\nRelevant insights from the user's meetings (use these as grounded source material):\n" +
          meetingArtifactContext
            .map(
              (a, i) =>
                `${i + 1}. [${a.type}] ${a.content}${a.context ? ` (Context: ${a.context})` : ""}${a.meeting_title ? ` — from meeting: "${a.meeting_title}"` : ""}${a.theme ? ` [theme: ${a.theme}]` : ""}${a.pillar ? ` [pillar: ${a.pillar}]` : ""}`,
            )
            .join("\n"),
      );
      contextParts.push(
        "\nWhen using meeting artifacts as source material, mention the source naturally (e.g., 'In a recent conversation about X...' or 'A decision we made about Y...'). This grounds the content in real experience.",
      );
    }

    // Include all posts from the user's content calendar for full context
    if (allPosts && allPosts.length > 0) {
      const postSummaries = allPosts.map((p, i) => {
        const parts = [`${i + 1}.`];
        if (p.title) parts.push(`"${p.title}"`);
        if (p.pillar) parts.push(`[${p.pillar}]`);
        if (p.status) parts.push(`(${p.status})`);
        if (p.post_type) parts.push(`type:${p.post_type}`);
        if (p.target_icp) parts.push(`icp:${p.target_icp}`);
        if (p.tags && p.tags.length > 0)
          parts.push(`tags:${p.tags.join(",")}`);
        parts.push(
          `content:"${p.content.slice(0, 200)}${p.content.length > 200 ? "…" : ""}"`,
        );
        return parts.join(" ");
      });

      contextParts.push(
        `\nThe user's content calendar has ${allPosts.length} posts. Here is a summary of their existing posts (use this to understand their tone, voice, topics, and style):\n` +
          postSummaries.join("\n"),
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
    const { data: assistantMsg, error: assistantMsgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: convId,
        user_id: user.id,
        role: "assistant",
        content: text,
      })
      .select("id")
      .single();
    if (assistantMsgError) throw assistantMsgError;

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", convId);

    return Response.json({
      response: text,
      conversationId: convId,
      messageId: assistantMsg.id,
      sourceArtifacts: meetingArtifactContext.length > 0
        ? meetingArtifactContext.map((a) => ({
            id: a.id,
            type: a.type,
            content: a.content,
            meeting_title: a.meeting_title,
            theme: a.theme,
            pillar: a.pillar,
          }))
        : undefined,
    });
  } catch (e: unknown) {
    const message2 = e instanceof Error ? e.message : "Chat failed";
    return Response.json({ error: message2 }, { status: 500 });
  }
}
