/**
 * Theme clustering for meeting artifacts.
 * Groups artifacts into 8-20 themes and maps them to content pillars.
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { SupabaseClient } from "@supabase/supabase-js";

interface ArtifactForClustering {
  id: string;
  type: string;
  content: string;
  theme: string | null;
  pillar: string | null;
}

interface ClusteredTheme {
  name: string;
  description: string;
  pillar: string | null;
  confidence: number;
  artifact_ids: string[];
}

/**
 * Cluster artifacts into themes using AI.
 */
export async function clusterArtifactsIntoThemes(
  artifacts: ArtifactForClustering[],
  existingPillars: string[],
  existingThemes: Array<{ name: string; pillar: string | null }>
): Promise<ClusteredTheme[]> {
  if (artifacts.length === 0) return [];

  const artifactSummaries = artifacts
    .map(
      (a, i) =>
        `[${i}] (${a.type}) ${a.content}${a.theme ? ` [theme hint: ${a.theme}]` : ""}`
    )
    .join("\n");

  const existingContext = [
    existingPillars.length > 0
      ? `Existing content pillars: ${existingPillars.join(", ")}`
      : "",
    existingThemes.length > 0
      ? `Existing themes: ${existingThemes.map((t) => `${t.name}${t.pillar ? ` (${t.pillar})` : ""}`).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    system: `You are a content strategist clustering meeting insights into themes for LinkedIn content creation.

Given a list of meeting artifacts (indexed [0], [1], etc.), cluster them into 8-20 themes.

Rules:
- Each theme should be 2-5 words (e.g., "AI Adoption Friction", "Leadership Under Pressure")
- Map themes to existing content pillars when appropriate
- Propose new pillars only if there's a strong cluster that doesn't fit existing ones
- Every artifact should belong to exactly one theme
- Themes should be actionable for LinkedIn content (not generic like "miscellaneous")
- If existing themes are provided, prefer reusing/merging with them over creating duplicates
- Confidence (0.5-1.0) reflects how cohesive and content-worthy the theme is

${existingContext}

Return ONLY a JSON array of objects with keys:
- name (string): theme name
- description (string): 1-sentence description of what this theme covers
- pillar (string|null): content pillar this maps to, or null
- confidence (number): 0.5-1.0
- artifact_indices (number[]): indices of artifacts belonging to this theme

No markdown fences, no extra text.`,
    prompt: artifactSummaries,
  });

  const cleaned = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  const rawThemes: Array<{
    name: string;
    description: string;
    pillar: string | null;
    confidence: number;
    artifact_indices: number[];
  }> = JSON.parse(cleaned);

  return rawThemes.map((t) => ({
    name: t.name,
    description: t.description,
    pillar: t.pillar || null,
    confidence: t.confidence || 0.5,
    artifact_ids: t.artifact_indices
      .filter((i) => i >= 0 && i < artifacts.length)
      .map((i) => artifacts[i].id),
  }));
}

/**
 * Run theme clustering for a user's artifacts and upsert theme records.
 * Does NOT silently overwrite existing themes — updates confidence and counts.
 */
export async function updateThemes(
  supabase: SupabaseClient,
  userId: string
): Promise<{ themesCreated: number; themesUpdated: number }> {
  // Fetch all artifacts
  const { data: artifacts } = await supabase
    .from("meeting_artifacts")
    .select("id, type, content, theme, pillar")
    .eq("user_id", userId);

  if (!artifacts || artifacts.length === 0) {
    return { themesCreated: 0, themesUpdated: 0 };
  }

  // Fetch existing themes and pillars
  const { data: existingThemes } = await supabase
    .from("themes")
    .select("id, name, pillar, artifact_count")
    .eq("user_id", userId);

  const { data: pillarData } = await supabase
    .from("posts")
    .select("pillar")
    .eq("user_id", userId)
    .not("pillar", "is", null)
    .not("pillar", "eq", "");

  const existingPillars = [
    ...new Set((pillarData || []).map((p) => p.pillar).filter(Boolean)),
  ] as string[];

  // Cluster
  const clusteredThemes = await clusterArtifactsIntoThemes(
    artifacts as ArtifactForClustering[],
    existingPillars,
    (existingThemes || []).map((t) => ({
      name: t.name,
      pillar: t.pillar,
    }))
  );

  let created = 0;
  let updated = 0;

  for (const theme of clusteredThemes) {
    // Check if a theme with this name already exists
    const existing = (existingThemes || []).find(
      (t) => t.name.toLowerCase() === theme.name.toLowerCase()
    );

    // Count distinct meetings for this theme's artifacts
    const meetingIds = new Set<string>();
    if (theme.artifact_ids.length > 0) {
      const { data: artifactMeetings } = await supabase
        .from("meeting_artifacts")
        .select("meeting_id")
        .in("id", theme.artifact_ids);
      (artifactMeetings || []).forEach((a) => meetingIds.add(a.meeting_id));
    }

    // Build sample artifacts (first 3)
    const sampleArtifacts = artifacts
      .filter((a) => theme.artifact_ids.includes(a.id))
      .slice(0, 3)
      .map((a) => ({ type: a.type, content: a.content }));

    if (existing) {
      // Update existing theme — merge counts, update confidence
      await supabase
        .from("themes")
        .update({
          description: theme.description,
          pillar: theme.pillar || existing.pillar,
          confidence: Math.max(theme.confidence, 0.5),
          artifact_count: theme.artifact_ids.length,
          meeting_count: meetingIds.size,
          sample_artifacts: sampleArtifacts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      updated++;
    } else {
      // Create new theme
      await supabase.from("themes").insert({
        user_id: userId,
        name: theme.name,
        description: theme.description,
        pillar: theme.pillar,
        confidence: theme.confidence,
        artifact_count: theme.artifact_ids.length,
        meeting_count: meetingIds.size,
        sample_artifacts: sampleArtifacts,
      });
      created++;
    }

    // Update artifact theme references
    if (theme.artifact_ids.length > 0) {
      await supabase
        .from("meeting_artifacts")
        .update({ theme: theme.name, pillar: theme.pillar })
        .in("id", theme.artifact_ids)
        .eq("user_id", userId);
    }
  }

  return { themesCreated: created, themesUpdated: updated };
}
