import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { processMeeting, getUserPillars } from "@/lib/readai/extract";
import { updateThemes } from "@/lib/readai/cluster";

/* ------------------------------------------------------------------ */
/*  POST /api/readai/sync                                              */
/*  Process any unprocessed meetings (webhook delivers raw data,       */
/*  this route handles batch artifact extraction if auto-process       */
/*  failed or was skipped).                                            */
/*  Also callable via Vercel Cron (x-cron-secret header).              */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  // Check for cron auth
  const cronSecret = process.env.CRON_SECRET;
  const cronHeader = req.headers.get("x-cron-secret");

  if (cronHeader && cronSecret && cronHeader === cronSecret) {
    // Cron-triggered: process unprocessed meetings for all users
    return await handleCronProcessAll();
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
    const result = await processUserMeetings(supabase, user.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Process a single user's unprocessed meetings                       */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processUserMeetings(supabase: any, userId: string) {
  const { data: state } = await supabase
    .from("readai_sync_state")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!state?.is_connected) {
    return { error: "Read.ai is not connected", processed: 0 };
  }

  // Process unprocessed meetings
  const pillars = await getUserPillars(supabase, userId);
  const { data: unprocessed } = await supabase
    .from("meetings")
    .select("id")
    .eq("user_id", userId)
    .eq("processed", false)
    .limit(10);

  let totalArtifacts = 0;
  let processed = 0;

  for (const meeting of unprocessed || []) {
    try {
      const result = await processMeeting(supabase, userId, meeting.id, pillars);
      totalArtifacts += result.artifactsCreated;
      processed++;
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
      artifacts_extracted: (state.artifacts_extracted || 0) + totalArtifacts,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return {
    processed,
    artifacts: totalArtifacts,
    themes: themeResult,
  };
}

/* ------------------------------------------------------------------ */
/*  Cron: process unprocessed meetings for all connected users         */
/* ------------------------------------------------------------------ */

async function handleCronProcessAll() {
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
      const result = await processUserMeetings(adminClient, user_id);
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
