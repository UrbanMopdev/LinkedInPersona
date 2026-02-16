import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchAllReadAiMeetings,
  fetchReadAiMeetingDetail,
  shouldExcludeMeeting,
  redactNames,
} from "@/lib/readai/client";
import { processMeeting, getUserPillars } from "@/lib/readai/extract";
import { updateThemes } from "@/lib/readai/cluster";

/* ------------------------------------------------------------------ */
/*  POST /api/readai/import                                            */
/*  Initial import: pull meetings, store, extract artifacts, cluster   */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action } = body;

  try {
    switch (action) {
      case "import_meetings":
        return await handleImportMeetings(supabase, user.id);
      case "process_meetings":
        return await handleProcessMeetings(supabase, user.id);
      case "cluster_themes":
        return await handleClusterThemes(supabase, user.id);
      case "full_pipeline":
        return await handleFullPipeline(supabase, user.id);
      default:
        return NextResponse.json(
          { error: "Unknown action. Use: import_meetings, process_meetings, cluster_themes, full_pipeline" },
          { status: 400 }
        );
    }
  } catch (err) {
    // Update last_error
    await supabase
      .from("readai_sync_state")
      .update({
        last_error: err instanceof Error ? err.message : "Import failed",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Step 1: Import meetings from Read.ai                               */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleImportMeetings(supabase: any, userId: string) {
  // Get sync state
  const { data: state } = await supabase
    .from("readai_sync_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!state?.is_connected) {
    return NextResponse.json(
      { error: "Read.ai is not connected" },
      { status: 400 }
    );
  }

  // Fetch meetings from API
  const meetings = await fetchAllReadAiMeetings(state.api_key, {
    startDate: state.date_range_start || undefined,
    endDate: state.date_range_end || undefined,
  });

  let imported = 0;
  let skipped = 0;
  let filtered = 0;

  for (const meeting of meetings) {
    // Check filters
    if (
      shouldExcludeMeeting(
        meeting.title,
        state.exclude_meeting_patterns || [],
        state.include_keywords || [],
        state.exclude_keywords || []
      )
    ) {
      filtered++;
      continue;
    }

    // Check if already imported
    const { data: existing } = await supabase
      .from("meetings")
      .select("id")
      .eq("user_id", userId)
      .eq("external_meeting_id", meeting.id)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    // Fetch full details (transcript etc.)
    let detail = meeting;
    try {
      detail = await fetchReadAiMeetingDetail(state.api_key, meeting.id);
    } catch {
      // Use the list data if detail fetch fails
    }

    // Apply privacy controls
    const participants = detail.participants || [];
    let summary = detail.summary || null;
    let transcript = detail.transcript || null;
    let keyPoints: unknown[] = detail.key_points || [];
    let actionItems: unknown[] = detail.action_items || [];

    if (state.redact_participant_names && participants.length > 0) {
      if (summary) summary = redactNames(summary, participants);
      if (transcript) transcript = redactNames(transcript, participants);
      keyPoints = keyPoints.map((kp: unknown) =>
        typeof kp === "string"
          ? redactNames(kp, participants)
          : kp
      );
      actionItems = actionItems.map(
        (ai: unknown) => {
          if (typeof ai === "object" && ai !== null && "text" in ai) {
            const item = ai as { text: string; assignee?: string; due_date?: string };
            return {
              ...item,
              text: redactNames(item.text, participants),
              assignee: item.assignee
                ? redactNames(item.assignee, participants)
                : undefined,
            };
          }
          return ai;
        }
      );
    }

    // Store meeting
    const privacyLevel =
      state.privacy_level === "minimal" ? "minimal" : state.redact_participant_names ? "redacted" : "standard";

    const { error: insertErr } = await supabase.from("meetings").insert({
      user_id: userId,
      provider: "read_ai",
      external_meeting_id: meeting.id,
      title: detail.title,
      start_time: detail.start_time || null,
      end_time: detail.end_time || null,
      duration_minutes: detail.duration_minutes || null,
      participants:
        privacyLevel === "minimal"
          ? JSON.stringify([])
          : JSON.stringify(
              state.redact_participant_names
                ? participants.map((p, i) => ({
                    name: `Participant ${i + 1}`,
                    role: p.role,
                  }))
                : participants
            ),
      summary,
      transcript: privacyLevel === "minimal" ? null : transcript,
      key_points: JSON.stringify(keyPoints),
      action_items: JSON.stringify(actionItems),
      sentiment: detail.sentiment || null,
      source_url: detail.source_url || null,
      privacy_level: privacyLevel,
      raw_data: JSON.stringify({}),
      processed: false,
    });

    if (!insertErr) imported++;
  }

  // Update sync state
  await supabase
    .from("readai_sync_state")
    .update({
      last_import_at: new Date().toISOString(),
      meetings_imported: (state.meetings_imported || 0) + imported,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return NextResponse.json({
    imported,
    skipped,
    filtered,
    total: meetings.length,
  });
}

/* ------------------------------------------------------------------ */
/*  Step 2: Process unprocessed meetings (extract artifacts)           */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleProcessMeetings(supabase: any, userId: string) {
  const pillars = await getUserPillars(supabase, userId);

  // Get unprocessed meetings
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id")
    .eq("user_id", userId)
    .eq("processed", false)
    .order("start_time", { ascending: true })
    .limit(10); // Process 10 at a time to avoid timeout

  if (!meetings || meetings.length === 0) {
    return NextResponse.json({
      processed: 0,
      totalArtifacts: 0,
      message: "No unprocessed meetings",
    });
  }

  let totalArtifacts = 0;
  let processed = 0;

  for (const meeting of meetings) {
    try {
      const result = await processMeeting(
        supabase,
        userId,
        meeting.id,
        pillars
      );
      totalArtifacts += result.artifactsCreated;
      processed++;
    } catch (err) {
      console.error(`Failed to process meeting ${meeting.id}:`, err);
    }
  }

  // Update sync state counts
  const { data: state } = await supabase
    .from("readai_sync_state")
    .select("artifacts_extracted")
    .eq("user_id", userId)
    .single();

  await supabase
    .from("readai_sync_state")
    .update({
      artifacts_extracted: (state?.artifacts_extracted || 0) + totalArtifacts,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return NextResponse.json({ processed, totalArtifacts });
}

/* ------------------------------------------------------------------ */
/*  Step 3: Cluster themes                                             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleClusterThemes(supabase: any, userId: string) {
  const result = await updateThemes(supabase, userId);
  return NextResponse.json(result);
}

/* ------------------------------------------------------------------ */
/*  Full pipeline: import → process → cluster                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFullPipeline(supabase: any, userId: string) {
  // Step 1: Import
  const { data: state } = await supabase
    .from("readai_sync_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!state?.is_connected) {
    return NextResponse.json(
      { error: "Read.ai is not connected" },
      { status: 400 }
    );
  }

  const meetings = await fetchAllReadAiMeetings(state.api_key, {
    startDate: state.date_range_start || undefined,
    endDate: state.date_range_end || undefined,
  });

  let imported = 0;
  let filtered = 0;

  for (const meeting of meetings) {
    if (
      shouldExcludeMeeting(
        meeting.title,
        state.exclude_meeting_patterns || [],
        state.include_keywords || [],
        state.exclude_keywords || []
      )
    ) {
      filtered++;
      continue;
    }

    const { data: existing } = await supabase
      .from("meetings")
      .select("id")
      .eq("user_id", userId)
      .eq("external_meeting_id", meeting.id)
      .maybeSingle();

    if (existing) continue;

    let detail = meeting;
    try {
      detail = await fetchReadAiMeetingDetail(state.api_key, meeting.id);
    } catch {
      // use list data
    }

    const participants = detail.participants || [];
    let summary = detail.summary || null;
    let transcript = detail.transcript || null;

    if (state.redact_participant_names && participants.length > 0) {
      if (summary) summary = redactNames(summary, participants);
      if (transcript) transcript = redactNames(transcript, participants);
    }

    const privacyLevel =
      state.privacy_level === "minimal" ? "minimal" : state.redact_participant_names ? "redacted" : "standard";

    const { error: insertErr } = await supabase.from("meetings").insert({
      user_id: userId,
      provider: "read_ai",
      external_meeting_id: meeting.id,
      title: detail.title,
      start_time: detail.start_time || null,
      end_time: detail.end_time || null,
      duration_minutes: detail.duration_minutes || null,
      participants: JSON.stringify(
        privacyLevel === "minimal"
          ? []
          : state.redact_participant_names
            ? participants.map((p, i) => ({
                name: `Participant ${i + 1}`,
                role: p.role,
              }))
            : participants
      ),
      summary,
      transcript: privacyLevel === "minimal" ? null : transcript,
      key_points: JSON.stringify(detail.key_points || []),
      action_items: JSON.stringify(detail.action_items || []),
      sentiment: detail.sentiment || null,
      source_url: detail.source_url || null,
      privacy_level: privacyLevel,
      raw_data: JSON.stringify({}),
      processed: false,
    });

    if (!insertErr) imported++;
  }

  // Step 2: Process all unprocessed
  const pillars = await getUserPillars(supabase, userId);
  const { data: unprocessed } = await supabase
    .from("meetings")
    .select("id")
    .eq("user_id", userId)
    .eq("processed", false);

  let totalArtifacts = 0;
  let processedCount = 0;

  for (const meeting of unprocessed || []) {
    try {
      const result = await processMeeting(supabase, userId, meeting.id, pillars);
      totalArtifacts += result.artifactsCreated;
      processedCount++;
    } catch (err) {
      console.error(`Failed to process meeting ${meeting.id}:`, err);
    }
  }

  // Step 3: Cluster themes
  const themeResult = await updateThemes(supabase, userId);

  // Update sync state
  await supabase
    .from("readai_sync_state")
    .update({
      last_import_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      meetings_imported: (state.meetings_imported || 0) + imported,
      artifacts_extracted: (state.artifacts_extracted || 0) + totalArtifacts,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return NextResponse.json({
    import: { imported, filtered, total: meetings.length },
    processing: { processed: processedCount, artifacts: totalArtifacts },
    themes: themeResult,
  });
}
