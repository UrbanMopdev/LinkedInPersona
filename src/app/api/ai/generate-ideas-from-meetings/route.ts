import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";

/* ------------------------------------------------------------------ */
/*  POST /api/ai/generate-ideas-from-meetings                         */
/*  Generate content ideas grounded in meeting artifacts               */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { theme, pillar, artifactType } = body;

  // Fetch relevant artifacts
  let query = supabase
    .from("meeting_artifacts")
    .select("id, type, content, context, theme, pillar, meetings(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (theme) query = query.eq("theme", theme);
  if (pillar) query = query.eq("pillar", pillar);
  if (artifactType) query = query.eq("type", artifactType);

  const { data: artifacts } = await query;

  if (!artifacts || artifacts.length === 0) {
    return Response.json(
      { error: "No matching artifacts found. Import and process meetings first." },
      { status: 400 }
    );
  }

  // Fetch voice guide
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_guide, voice_fingerprint")
    .eq("id", user.id)
    .single();

  const voiceGuide = profile?.voice_fingerprint || profile?.voice_guide || "";

  const artifactText = artifacts
    .map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any, i: number) =>
        `[${i}] (${a.type}) ${a.content}${a.context ? ` — Context: ${a.context}` : ""}${a.meetings?.title ? ` [from: ${a.meetings.title}]` : ""}`
    )
    .join("\n");

  const systemPrompt = [
    "You are a LinkedIn content strategist generating post ideas from meeting artifacts.",
    "Each idea MUST reference 1-3 specific artifacts by their index [0], [1], etc.",
    "Ideas should be specific, actionable, and grounded in real conversations — not generic.",
    voiceGuide
      ? `\nThe user has this voice/style:\n"""\n${voiceGuide}\n"""`
      : "",
    '\nReturn ONLY a JSON array of objects with: "title" (catchy headline <80 chars), "body" (1-2 sentence description), "artifact_indices" (array of numbers referencing source artifacts). No markdown fences.',
  ].join("");

  try {
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      system: systemPrompt,
      prompt: `Here are ${artifacts.length} meeting artifacts:\n\n${artifactText}\n\nGenerate 5 LinkedIn post ideas grounded in these artifacts.`,
    });

    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const ideas = JSON.parse(cleaned);

    // Enrich ideas with artifact references
    const enrichedIdeas = ideas.map(
      (idea: {
        title: string;
        body: string;
        artifact_indices: number[];
      }) => ({
        title: idea.title,
        body: idea.body,
        source_artifacts: (idea.artifact_indices || [])
          .filter((i: number) => i >= 0 && i < artifacts.length)
          .map((i: number) => ({
            id: artifacts[i].id,
            type: artifacts[i].type,
            content: artifacts[i].content,
          })),
      })
    );

    return Response.json({ ideas: enrichedIdeas });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "AI generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
