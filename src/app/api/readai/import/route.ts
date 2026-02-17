import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMeeting, getUserPillars } from "@/lib/readai/extract";
import { updateThemes } from "@/lib/readai/cluster";

/* ------------------------------------------------------------------ */
/*  POST /api/readai/import                                            */
/*  Process meetings and cluster themes.                               */
/*  Meeting data now arrives via webhooks, so this route handles       */
/*  processing and clustering only (no more REST API polling).         */
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
      case "process_meetings":
        return await handleProcessMeetings(supabase, user.id);
      case "cluster_themes":
        return await handleClusterThemes(supabase, user.id);
      default:
        return NextResponse.json(
          { error: "Unknown action. Use: process_meetings, cluster_themes" },
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
/*  Process unprocessed meetings (extract artifacts)                   */
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

  // Update themes if new artifacts were created
  let themeResult = { themesCreated: 0, themesUpdated: 0 };
  if (totalArtifacts > 0) {
    themeResult = await updateThemes(supabase, userId);
  }

  return NextResponse.json({ processed, totalArtifacts, themes: themeResult });
}

/* ------------------------------------------------------------------ */
/*  Cluster themes                                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleClusterThemes(supabase: any, userId: string) {
  const result = await updateThemes(supabase, userId);
  return NextResponse.json(result);
}
