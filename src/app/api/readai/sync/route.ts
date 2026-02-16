import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  fetchReadAiMeetings,
  fetchReadAiMeetingDetail,
  shouldExcludeMeeting,
  redactNames,
} from "@/lib/readai/client";
import { processMeeting, getUserPillars } from "@/lib/readai/extract";
import { updateThemes } from "@/lib/readai/cluster";

/* ------------------------------------------------------------------ */
/*  POST /api/readai/sync                                              */
/*  Incremental sync: fetch new meetings since last sync               */
/*  Also callable via Vercel Cron (x-cron-secret header)               */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  // Check for cron auth
  const cronSecret = process.env.CRON_SECRET;
  const cronHeader = req.headers.get("x-cron-secret");

  if (cronHeader && cronSecret && cronHeader === cronSecret) {
    // Cron-triggered: sync all connected users
    return await handleCronSyncAll();
  }

  // User-triggered
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncUserMeetings(supabase, user.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Sync a single user's meetings                                      */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncUserMeetings(supabase: any, userId: string) {
  const { data: state } = await supabase
    .from("readai_sync_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!state?.is_connected) {
    return { error: "Read.ai is not connected", synced: 0 };
  }

  // Determine start date for incremental sync
  const sinceDate = state.last_sync_at
    ? new Date(state.last_sync_at).toISOString().split("T")[0]
    : state.date_range_start || undefined;

  // Fetch recent meetings
  let meetings;
  try {
    const response = await fetchReadAiMeetings(state.api_key, {
      startDate: sinceDate,
      limit: 50,
    });
    meetings = response.meetings;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "API fetch failed";
    await supabase
      .from("readai_sync_state")
      .update({ last_error: errMsg, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    throw err;
  }

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

    // Check if already exists
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

  // Process newly imported meetings
  const pillars = await getUserPillars(supabase, userId);
  const { data: unprocessed } = await supabase
    .from("meetings")
    .select("id")
    .eq("user_id", userId)
    .eq("processed", false)
    .limit(10);

  let totalArtifacts = 0;
  for (const meeting of unprocessed || []) {
    try {
      const result = await processMeeting(supabase, userId, meeting.id, pillars);
      totalArtifacts += result.artifactsCreated;
    } catch (err) {
      console.error(`Failed to process meeting ${meeting.id}:`, err);
    }
  }

  // Update themes if new artifacts were created
  let themeResult = { themesCreated: 0, themesUpdated: 0 };
  if (totalArtifacts > 0) {
    themeResult = await updateThemes(supabase, userId);
  }

  // Update sync state
  await supabase
    .from("readai_sync_state")
    .update({
      last_sync_at: new Date().toISOString(),
      meetings_imported: (state.meetings_imported || 0) + imported,
      artifacts_extracted: (state.artifacts_extracted || 0) + totalArtifacts,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return {
    imported,
    filtered,
    artifacts: totalArtifacts,
    themes: themeResult,
  };
}

/* ------------------------------------------------------------------ */
/*  Cron: sync all connected users                                     */
/* ------------------------------------------------------------------ */

async function handleCronSyncAll() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Missing Supabase service role config" },
      { status: 500 }
    );
  }

  const adminClient = createAdminClient(supabaseUrl, serviceKey);

  // Get all connected users
  const { data: connectedUsers } = await adminClient
    .from("readai_sync_state")
    .select("user_id")
    .eq("is_connected", true);

  if (!connectedUsers || connectedUsers.length === 0) {
    return NextResponse.json({ synced: 0, message: "No connected users" });
  }

  const results: Array<{ userId: string; result: unknown }> = [];

  for (const { user_id } of connectedUsers) {
    try {
      const result = await syncUserMeetings(adminClient, user_id);
      results.push({ userId: user_id, result });
    } catch (err) {
      results.push({
        userId: user_id,
        result: { error: err instanceof Error ? err.message : "Failed" },
      });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
