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

  const { content, instructions } = await req.json();
  if (!content || typeof content !== "string") {
    return Response.json({ error: "content is required" }, { status: 400 });
  }
  if (!instructions || typeof instructions !== "string") {
    return Response.json({ error: "instructions are required" }, { status: 400 });
  }

  // Fetch voice guide + voice fingerprint
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_guide, voice_fingerprint")
    .eq("id", user.id)
    .single();

  const voiceGuide = profile?.voice_fingerprint || profile?.voice_guide || "";

  const systemPrompt = [
    "You are an expert LinkedIn ghostwriter.",
    "Rewrite the given LinkedIn post according to the user's instructions.",
    "Keep it under 1300 characters and optimised for LinkedIn.",
    voiceGuide
      ? `\nThe user has the following voice/style guide — match this voice exactly:\n"""\n${voiceGuide}\n"""`
      : "",
    "\nReturn ONLY the rewritten post text. No explanations, no commentary.",
  ].join("");

  try {
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      system: systemPrompt,
      prompt: `Original post:\n"""\n${content}\n"""\n\nRewrite instructions: ${instructions}`,
    });

    return Response.json({ content: text.trim() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "AI generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
