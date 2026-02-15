import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured. Add it to your .env.local file." },
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

  const { topic } = await req.json();
  if (!topic || typeof topic !== "string") {
    return Response.json({ error: "topic is required" }, { status: 400 });
  }

  // Fetch voice guide
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_guide")
    .eq("id", user.id)
    .single();

  const voiceGuide = profile?.voice_guide || "";

  const systemPrompt = [
    "You are a LinkedIn content strategist.",
    "Generate exactly 5 unique LinkedIn post ideas.",
    voiceGuide
      ? `\nThe user has the following voice/style guide — match this voice in every idea:\n"""\n${voiceGuide}\n"""`
      : "",
    "\nReturn ONLY a JSON array of objects, each with \"title\" (catchy headline, <80 chars) and \"body\" (1-2 sentence description). No markdown fences, no extra text.",
  ].join("");

  try {
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      system: systemPrompt,
      prompt: `Generate 5 LinkedIn post ideas about: ${topic}`,
    });

    // Parse the JSON from the response
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const ideas = JSON.parse(cleaned);

    return Response.json({ ideas });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "AI generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
