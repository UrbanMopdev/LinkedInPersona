import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { shouldExcludeMeeting, redactNames } from "@/lib/readai/client";
import { processMeeting, getUserPillars } from "@/lib/readai/extract";
import { updateThemes } from "@/lib/readai/cluster";

/* ------------------------------------------------------------------ */
/*  POST /api/readai/webhook                                           */
/*  Receives meeting data from Read.ai webhooks.                       */
/*  Authenticated via ?token=<webhook_secret> query parameter.         */
/*                                                                     */
/*  Read.ai sends a POST when a meeting ends with:                     */
/*    session_id, trigger, title, start_time, end_time, participants,  */
/*    owner, summary, action_items, key_questions, topics,             */
/*    report_url, chapter_summaries, transcript                        */
/* ------------------------------------------------------------------ */

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role config");
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  // Authenticate via token query parameter
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { error: "Missing token parameter" },
      { status: 401 }
    );
  }

  const supabase = getAdminClient();

  // Look up the user by webhook secret
  const { data: state, error: lookupErr } = await supabase
    .from("readai_sync_state")
    .select("*")
    .eq("webhook_secret", token)
    .eq("is_connected", true)
    .maybeSingle();

  if (lookupErr || !state) {
    return NextResponse.json(
      { error: "Invalid or expired webhook token" },
      { status: 401 }
    );
  }

  const userId = state.user_id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  try {
    const result = await ingestWebhookMeeting(supabase, userId, state, body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    // Log but don't expose internal errors
    console.error(`Webhook error for user ${userId}:`, message);

    await supabase
      .from("readai_sync_state")
      .update({
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Ingest a single meeting from webhook payload                       */
/* ------------------------------------------------------------------ */

async function ingestWebhookMeeting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, unknown>
) {
  // Map Read.ai webhook fields to our schema
  const meetingId = (payload.session_id || payload.id || payload.meeting_id) as string;
  const title = (payload.title || "Untitled Meeting") as string;
  const startTime = (payload.start_time || payload.startTime) as string | undefined;
  const endTime = (payload.end_time || payload.endTime) as string | undefined;
  const rawParticipants = (payload.participants || []) as Array<{
    name: string;
    email?: string;
    role?: string;
  }>;
  const rawSummary = (payload.summary || "") as string;
  const rawTranscript = (payload.transcript || "") as string;
  const keyPoints = (payload.key_questions || payload.key_points || payload.topics || []) as unknown[];
  const rawActionItems = (payload.action_items || []) as unknown[];
  const reportUrl = (payload.report_url || payload.source_url || "") as string;

  // Calculate duration
  let durationMinutes: number | null = null;
  if (startTime && endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  }

  if (!meetingId) {
    return { skipped: true, reason: "No meeting ID in payload" };
  }

  // Check meeting title filters
  if (
    shouldExcludeMeeting(
      title,
      state.exclude_meeting_patterns || [],
      state.include_keywords || [],
      state.exclude_keywords || []
    )
  ) {
    return { skipped: true, reason: "Meeting excluded by filter", title };
  }

  // Check if already imported
  const { data: existing } = await supabase
    .from("meetings")
    .select("id")
    .eq("user_id", userId)
    .eq("external_meeting_id", meetingId)
    .maybeSingle();

  if (existing) {
    return { skipped: true, reason: "Meeting already imported", meetingId };
  }

  // Apply privacy controls
  let summary: string | null = rawSummary || null;
  let transcript: string | null = rawTranscript || null;
  let processedKeyPoints: unknown[] = keyPoints;
  let processedActionItems: unknown[] = rawActionItems;

  if (state.redact_participant_names && rawParticipants.length > 0) {
    if (summary) summary = redactNames(summary, rawParticipants);
    if (transcript) transcript = redactNames(transcript, rawParticipants);
    processedKeyPoints = processedKeyPoints.map((kp: unknown) =>
      typeof kp === "string" ? redactNames(kp, rawParticipants) : kp
    );
    processedActionItems = processedActionItems.map((ai: unknown) => {
      if (typeof ai === "object" && ai !== null && "text" in ai) {
        const item = ai as { text: string; assignee?: string; due_date?: string };
        return {
          ...item,
          text: redactNames(item.text, rawParticipants),
          assignee: item.assignee
            ? redactNames(item.assignee, rawParticipants)
            : undefined,
        };
      }
      return ai;
    });
  }

  const privacyLevel =
    state.privacy_level === "minimal"
      ? "minimal"
      : state.redact_participant_names
        ? "redacted"
        : "standard";

  // Store meeting
  const { error: insertErr } = await supabase.from("meetings").insert({
    user_id: userId,
    provider: "read_ai",
    external_meeting_id: meetingId,
    title,
    start_time: startTime || null,
    end_time: endTime || null,
    duration_minutes: durationMinutes,
    participants:
      privacyLevel === "minimal"
        ? JSON.stringify([])
        : JSON.stringify(
            state.redact_participant_names
              ? rawParticipants.map((p: { name: string; role?: string }, i: number) => ({
                  name: `Participant ${i + 1}`,
                  role: p.role,
                }))
              : rawParticipants
          ),
    summary,
    transcript: privacyLevel === "minimal" ? null : transcript,
    key_points: JSON.stringify(processedKeyPoints),
    action_items: JSON.stringify(processedActionItems),
    sentiment: (payload.sentiment as string) || null,
    source_url: reportUrl || null,
    privacy_level: privacyLevel,
    raw_data: JSON.stringify({}),
    processed: false,
  });

  if (insertErr) {
    throw new Error(`Failed to store meeting: ${insertErr.message}`);
  }

  // Update sync state counters
  await supabase
    .from("readai_sync_state")
    .update({
      last_sync_at: new Date().toISOString(),
      meetings_imported: (state.meetings_imported || 0) + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  // Auto-process: extract artifacts and update themes
  let artifactsCreated = 0;
  try {
    // Get the newly inserted meeting
    const { data: newMeeting } = await supabase
      .from("meetings")
      .select("id")
      .eq("user_id", userId)
      .eq("external_meeting_id", meetingId)
      .single();

    if (newMeeting) {
      const pillars = await getUserPillars(supabase, userId);
      const result = await processMeeting(supabase, userId, newMeeting.id, pillars);
      artifactsCreated = result.artifactsCreated;

      // Update artifact count
      await supabase
        .from("readai_sync_state")
        .update({
          artifacts_extracted: (state.artifacts_extracted || 0) + artifactsCreated,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      // Update themes if artifacts were created
      if (artifactsCreated > 0) {
        await updateThemes(supabase, userId);
      }
    }
  } catch (err) {
    // Processing failure shouldn't fail the webhook — the meeting is stored
    console.error(`Auto-process failed for meeting ${meetingId}:`, err);
  }

  return {
    success: true,
    meetingId,
    title,
    artifactsCreated,
  };
}
