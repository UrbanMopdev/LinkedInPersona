/**
 * Extract structured artifacts from meeting data using AI,
 * generate embeddings, and store them.
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { generateEmbedding } from "@/lib/embeddings";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExtractedArtifact {
  type:
    | "decision"
    | "insight"
    | "story_moment"
    | "metric"
    | "tension_tradeoff"
    | "quote"
    | "action_item"
    | "lesson"
    | "framework";
  content: string;
  context: string;
  theme?: string;
  pillar?: string;
  confidence: number;
}

const EXTRACTION_PROMPT = `You are a content intelligence analyst. Given meeting data (title, summary, transcript, key points, action items), extract structured artifacts that could fuel LinkedIn content creation.

For each meeting, extract 5–30 items from these categories:
- **decision**: A concrete decision made during the meeting
- **insight**: A non-obvious observation, pattern, or realization
- **story_moment**: A compelling anecdote, turning point, or human moment worth retelling
- **metric**: A specific number, stat, or quantified result mentioned
- **tension_tradeoff**: A tradeoff discussed, tension navigated, or competing priorities
- **quote**: A notable or quotable statement from a participant
- **action_item**: A clear next step or commitment
- **lesson**: A takeaway lesson or principle that emerged
- **framework**: A mental model, process, or framework discussed

For each artifact:
1. Write the "content" as a clean, self-contained statement (not a fragment)
2. Write brief "context" explaining when/why this came up in the meeting
3. Suggest a "theme" (2-4 word topic cluster, e.g. "AI adoption challenges")
4. If applicable, suggest a "pillar" from the user's content pillars, or leave blank
5. Rate your "confidence" from 0.5 to 1.0 for how useful this is for LinkedIn content

Return ONLY a JSON array of objects with keys: type, content, context, theme, pillar, confidence.
No markdown fences, no extra text.`;

/**
 * Extract artifacts from a single meeting using AI.
 */
export async function extractArtifacts(
  meeting: {
    title: string;
    summary?: string | null;
    transcript?: string | null;
    key_points?: unknown[];
    action_items?: unknown[];
  },
  pillars: string[]
): Promise<ExtractedArtifact[]> {
  const meetingContent = [
    `Meeting Title: ${meeting.title}`,
    meeting.summary ? `Summary: ${meeting.summary}` : "",
    meeting.key_points && meeting.key_points.length > 0
      ? `Key Points:\n${meeting.key_points.map((kp) => `- ${typeof kp === "string" ? kp : JSON.stringify(kp)}`).join("\n")}`
      : "",
    meeting.action_items && meeting.action_items.length > 0
      ? `Action Items:\n${meeting.action_items.map((ai) => `- ${typeof ai === "string" ? ai : JSON.stringify(ai)}`).join("\n")}`
      : "",
    meeting.transcript
      ? `Transcript (excerpt):\n${meeting.transcript.slice(0, 8000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const pillarContext =
    pillars.length > 0
      ? `\n\nThe user's existing content pillars are: ${pillars.join(", ")}. Map artifacts to these when relevant, or suggest new pillar names if the content doesn't fit.`
      : "";

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    system: EXTRACTION_PROMPT + pillarContext,
    prompt: meetingContent,
  });

  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  const artifacts: ExtractedArtifact[] = JSON.parse(cleaned);

  return artifacts.filter(
    (a) =>
      a.type &&
      a.content &&
      typeof a.content === "string" &&
      a.content.length > 10
  );
}

/**
 * Process a meeting: extract artifacts, generate embeddings, store everything.
 */
export async function processMeeting(
  supabase: SupabaseClient,
  userId: string,
  meetingId: string,
  pillars: string[]
): Promise<{ artifactsCreated: number }> {
  // Fetch the meeting
  const { data: meeting, error: meetingErr } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .eq("user_id", userId)
    .single();

  if (meetingErr || !meeting) {
    throw new Error("Meeting not found");
  }

  // Extract artifacts via AI
  const artifacts = await extractArtifacts(
    {
      title: meeting.title,
      summary: meeting.summary,
      transcript: meeting.transcript,
      key_points: meeting.key_points || [],
      action_items: meeting.action_items || [],
    },
    pillars
  );

  // Generate embeddings and store artifacts
  let created = 0;
  for (const artifact of artifacts) {
    try {
      const embeddingText = `${artifact.type}: ${artifact.content}. Context: ${artifact.context || ""}`;
      let embedding: number[] | null = null;
      try {
        embedding = await generateEmbedding(embeddingText);
      } catch {
        // If embedding fails, store without it
      }

      const { error: insertErr } = await supabase
        .from("meeting_artifacts")
        .insert({
          user_id: userId,
          meeting_id: meetingId,
          type: artifact.type,
          content: artifact.content,
          context: artifact.context || null,
          theme: artifact.theme || null,
          pillar: artifact.pillar || null,
          confidence: artifact.confidence || 0.8,
          embedding: embedding ? JSON.stringify(embedding) : null,
        });

      if (!insertErr) created++;
    } catch {
      // Skip individual artifact failures
    }
  }

  // Mark meeting as processed
  await supabase
    .from("meetings")
    .update({ processed: true, updated_at: new Date().toISOString() })
    .eq("id", meetingId)
    .eq("user_id", userId);

  return { artifactsCreated: created };
}

/**
 * Get user's content pillars from their existing posts.
 */
export async function getUserPillars(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("posts")
    .select("pillar")
    .eq("user_id", userId)
    .not("pillar", "is", null)
    .not("pillar", "eq", "");

  if (!data) return [];

  const pillars = [...new Set(data.map((p) => p.pillar).filter(Boolean))];
  return pillars as string[];
}
