import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/embeddings";
import {
  normalizeLinkedInUrl,
  fetchLinkedInHtml,
  parseLinkedInHtml,
  cleanText,
  type LinkedInExperience,
} from "@/lib/linkedin-parser";

/* ------------------------------------------------------------------ */
/*  POST /api/linkedin/import                                          */
/* ------------------------------------------------------------------ */

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

  const body = await req.json();
  const { input, pastedPosts } = body as {
    input?: string;
    pastedPosts?: string[];
  };

  if (!input && (!pastedPosts || pastedPosts.length === 0)) {
    return Response.json(
      { error: "Provide a LinkedIn handle/URL or pasted posts." },
      { status: 400 },
    );
  }

  try {
    let headline: string | null = null;
    let about: string | null = null;
    let experience: LinkedInExperience[] = [];
    let postTexts: string[] = [];
    let canonicalUrl: string | null = null;

    /* ============================================================ */
    /*  Strategy A: Fetch & parse public profile                     */
    /* ============================================================ */
    if (input) {
      canonicalUrl = normalizeLinkedInUrl(input);

      let html: string | null = null;
      try {
        html = await fetchLinkedInHtml(canonicalUrl);
      } catch {
        // Fetch failed — will still work if user provided pastedPosts
      }

      if (html) {
        const parsed = parseLinkedInHtml(html);
        headline = parsed.headline;
        about = parsed.about;
        experience = parsed.experience;
        postTexts = parsed.posts;
      }
    }

    /* ============================================================ */
    /*  Strategy B: Merge in pasted posts (fallback or supplement)   */
    /* ============================================================ */
    if (pastedPosts && pastedPosts.length > 0) {
      const cleaned = pastedPosts
        .map((p) => cleanText(p))
        .filter((p) => p.length > 20);
      // Deduplicate against already-parsed posts
      const existingSet = new Set(postTexts);
      for (const p of cleaned) {
        if (!existingSet.has(p)) {
          postTexts.push(p);
        }
      }
    }

    /* ============================================================ */
    /*  Upsert profile fields                                        */
    /* ============================================================ */
    const profileUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      linkedin_last_imported_at: new Date().toISOString(),
    };
    if (canonicalUrl) profileUpdate.linkedin_profile_url = canonicalUrl;
    if (headline) profileUpdate.linkedin_headline = headline;
    if (about) profileUpdate.linkedin_about = about;
    if (experience.length > 0)
      profileUpdate.linkedin_experience = experience;

    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id);
    if (profileError) throw profileError;

    /* ============================================================ */
    /*  Archive posts + generate embeddings                          */
    /* ============================================================ */
    let archivedCount = 0;
    for (const postText of postTexts) {
      // Upsert by content match to avoid duplicates
      const { data: existing } = await supabase
        .from("linkedin_posts_archive")
        .select("id")
        .eq("user_id", user.id)
        .eq("content", postText)
        .limit(1)
        .maybeSingle();

      let embedding: number[] | null = null;
      try {
        embedding = await generateEmbedding(postText);
      } catch {
        // Continue without embedding
      }

      if (existing) {
        await supabase
          .from("linkedin_posts_archive")
          .update({
            embedding: embedding ? JSON.stringify(embedding) : null,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("linkedin_posts_archive").insert({
          user_id: user.id,
          content: postText,
          embedding: embedding ? JSON.stringify(embedding) : null,
        });
        archivedCount++;
      }
    }

    /* ============================================================ */
    /*  Generate positioning_summary + voice_fingerprint via AI      */
    /* ============================================================ */
    let positioningSummary: string | null = null;
    let voiceFingerprint: string | null = null;

    const contentForAnalysis = buildAnalysisContent(
      headline,
      about,
      experience,
      postTexts,
    );

    if (contentForAnalysis.length > 50) {
      // --- Positioning summary ---
      try {
        const { text: pSummary } = await generateText({
          model: anthropic("claude-sonnet-4-5-20250929"),
          system:
            "You are a LinkedIn positioning expert. " +
            "Analyse the user's profile data and posts to produce a concise positioning summary (3-5 sentences). " +
            "Describe their professional niche, key themes, target audience, and unique angle. " +
            "Return ONLY the summary text — no labels, no markdown.",
          prompt: contentForAnalysis,
        });
        positioningSummary = pSummary.trim();
      } catch {
        // Non-critical
      }

      // --- Voice fingerprint ---
      try {
        const { text: vFingerprint } = await generateText({
          model: anthropic("claude-sonnet-4-5-20250929"),
          system:
            "You are a writing-style analyst. " +
            "Analyse the user's LinkedIn posts and profile to extract a voice fingerprint — a concise style guide " +
            "that captures their tone, vocabulary level, sentence structure, use of hooks, formatting patterns, emoji usage, " +
            "and any signature phrases. This will be used as a system prompt to replicate their voice. " +
            "Write it as direct instructions to an AI ghostwriter (e.g. 'Use short punchy sentences. Open with a bold claim. " +
            "Avoid jargon. End with a question to the reader.'). " +
            "Keep it under 400 words. Return ONLY the voice fingerprint — no labels, no markdown fences.",
          prompt: contentForAnalysis,
        });
        voiceFingerprint = vFingerprint.trim();
      } catch {
        // Non-critical
      }
    }

    // Update profile with AI-generated fields
    if (positioningSummary || voiceFingerprint) {
      const aiUpdate: Record<string, unknown> = {};
      if (positioningSummary)
        aiUpdate.positioning_summary = positioningSummary;
      if (voiceFingerprint) {
        aiUpdate.voice_fingerprint = voiceFingerprint;
        // Also update voice_guide so existing endpoints pick it up
        aiUpdate.voice_guide = voiceFingerprint;
      }
      await supabase.from("profiles").update(aiUpdate).eq("id", user.id);
    }

    /* ============================================================ */
    /*  Store key insights as user_memory with embeddings            */
    /* ============================================================ */
    const memoryChunks: { content: string; category: string }[] = [];
    if (positioningSummary) {
      memoryChunks.push({
        content: `Positioning summary: ${positioningSummary}`,
        category: "linkedin_import",
      });
    }
    if (voiceFingerprint) {
      memoryChunks.push({
        content: `Voice fingerprint: ${voiceFingerprint}`,
        category: "linkedin_import",
      });
    }
    if (headline) {
      memoryChunks.push({
        content: `LinkedIn headline: ${headline}`,
        category: "linkedin_import",
      });
    }
    if (about) {
      memoryChunks.push({
        content: `LinkedIn about: ${about}`,
        category: "linkedin_import",
      });
    }

    for (const chunk of memoryChunks) {
      let embedding: number[] | null = null;
      try {
        embedding = await generateEmbedding(chunk.content);
      } catch {
        // Continue without embedding
      }
      await supabase.from("user_memory").insert({
        user_id: user.id,
        content: chunk.content,
        category: chunk.category,
        embedding: embedding ? JSON.stringify(embedding) : null,
      });
    }

    /* ============================================================ */
    /*  Return preview payload                                       */
    /* ============================================================ */
    return Response.json({
      success: true,
      preview: {
        profileUrl: canonicalUrl,
        headline,
        about: about ? about.slice(0, 500) + (about.length > 500 ? "..." : "") : null,
        experienceCount: experience.length,
        experience: experience.slice(0, 5),
        postsFound: postTexts.length,
        postsArchived: archivedCount,
        postsAlreadyExisted: postTexts.length - archivedCount,
        positioningSummary,
        voiceFingerprint: voiceFingerprint
          ? voiceFingerprint.slice(0, 500) +
            (voiceFingerprint.length > 500 ? "..." : "")
          : null,
        memoryChunksStored: memoryChunks.length,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Import failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildAnalysisContent(
  headline: string | null,
  about: string | null,
  experience: LinkedInExperience[],
  posts: string[],
): string {
  const parts: string[] = [];

  if (headline) parts.push(`Headline: ${headline}`);
  if (about) parts.push(`About:\n${about}`);

  if (experience.length > 0) {
    parts.push(
      "Experience:\n" +
        experience
          .map(
            (e) =>
              `- ${e.title} at ${e.company}${e.duration ? ` (${e.duration})` : ""}${e.description ? `\n  ${e.description}` : ""}`,
          )
          .join("\n"),
    );
  }

  if (posts.length > 0) {
    // Include up to 15 posts for analysis
    const sample = posts.slice(0, 15);
    parts.push(
      "Recent LinkedIn posts:\n" +
        sample.map((p, i) => `--- Post ${i + 1} ---\n${p}`).join("\n\n"),
    );
  }

  return parts.join("\n\n");
}
