import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured. Add it to your .env.local file." },
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

  const { ideaTitle, ideaBody } = await req.json();
  if (!ideaTitle || typeof ideaTitle !== "string") {
    return Response.json({ error: "ideaTitle is required" }, { status: 400 });
  }

  // Fetch voice guide
  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_guide")
    .eq("id", user.id)
    .single();

  const voiceGuide = profile?.voice_guide || "";

  const systemPrompt = [
    "You are an expert LinkedIn ghostwriter.",
    "Write a compelling LinkedIn post based on the given idea.",
    "The post should be engaging, professional, and optimised for LinkedIn's algorithm.",
    "Use short paragraphs, line breaks for readability, and a strong hook in the first line.",
    "Keep it under 1300 characters.",
    voiceGuide
      ? `\nThe user has the following voice/style guide — match this voice exactly:\n"""\n${voiceGuide}\n"""`
      : "",
    "\nReturn ONLY the post text. No explanations, no titles, no markdown.",
  ].join("");

  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      prompt: `Write a LinkedIn post based on this idea:\nTitle: ${ideaTitle}\n${ideaBody ? `Description: ${ideaBody}` : ""}`,
    });

    return Response.json({ content: text.trim() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "AI generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
