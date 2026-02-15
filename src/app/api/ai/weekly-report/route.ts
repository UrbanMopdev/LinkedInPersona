import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";

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

  const { posts, metrics, weekStart, weekEnd } = await req.json();

  const { data: profile } = await supabase
    .from("profiles")
    .select("voice_guide, voice_fingerprint")
    .eq("id", user.id)
    .single();

  const voiceGuide = profile?.voice_fingerprint || profile?.voice_guide || "";

  const postSummaries = (posts || [])
    .map(
      (p: { title?: string; content?: string; pillar?: string }, i: number) =>
        `${i + 1}. "${p.title || p.content?.slice(0, 80) || "Untitled"}" (Pillar: ${p.pillar || "N/A"})`
    )
    .join("\n");

  const systemPrompt = [
    "You are a LinkedIn content performance analyst.",
    voiceGuide
      ? `\nThe user has this voice/style:\n"""\n${voiceGuide}\n"""`
      : "",
    "\nProvide a concise weekly report with:",
    "1. Performance summary (metrics overview)",
    "2. Top performing content and why",
    "3. Content pillar analysis",
    "4. 3-5 actionable recommendations for next week",
    "5. Suggested topics/angles for upcoming posts",
    "\nKeep it practical and data-driven. Use markdown formatting.",
  ].join("");

  try {
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      system: systemPrompt,
      prompt: `Generate a weekly LinkedIn content report for the week of ${weekStart} to ${weekEnd}.

Posts published this week:
${postSummaries || "No posts published this week."}

Metrics:
- Total Impressions: ${metrics.totalImpressions}
- Total Likes: ${metrics.totalLikes}
- Total Comments: ${metrics.totalComments}
- Total Shares: ${metrics.totalShares}`,
    });

    return Response.json({ summary: text });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Report generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
