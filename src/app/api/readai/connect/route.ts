import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateReadAiKey } from "@/lib/readai/client";

/* ------------------------------------------------------------------ */
/*  POST /api/readai/connect                                           */
/*  Connect, disconnect, get_state, update_settings for Read.ai        */
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
      case "connect":
        return await handleConnect(supabase, user.id, body);
      case "disconnect":
        return await handleDisconnect(supabase, user.id);
      case "get_state":
        return await handleGetState(supabase, user.id);
      case "update_settings":
        return await handleUpdateSettings(supabase, user.id, body);
      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Connect: validate API key and store it                             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleConnect(supabase: any, userId: string, body: {
  api_key: string;
  date_range_start?: string;
  date_range_end?: string;
  include_keywords?: string[];
  exclude_keywords?: string[];
  exclude_meeting_patterns?: string[];
  redact_participant_names?: boolean;
  privacy_level?: string;
}) {
  const { api_key } = body;
  if (!api_key) {
    return NextResponse.json(
      { error: "api_key is required" },
      { status: 400 }
    );
  }

  // Validate the key
  const validation = await validateReadAiKey(api_key);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || "Invalid API key" },
      { status: 400 }
    );
  }

  // Upsert sync state
  const { error: upsertError } = await supabase
    .from("readai_sync_state")
    .upsert(
      {
        user_id: userId,
        api_key,
        is_connected: true,
        date_range_start: body.date_range_start || null,
        date_range_end: body.date_range_end || null,
        include_keywords: body.include_keywords || [],
        exclude_keywords: body.exclude_keywords || [],
        exclude_meeting_patterns: body.exclude_meeting_patterns || [],
        redact_participant_names: body.redact_participant_names || false,
        privacy_level: body.privacy_level || "standard",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertError) throw upsertError;

  return NextResponse.json({ connected: true });
}

/* ------------------------------------------------------------------ */
/*  Disconnect: remove Read.ai state                                   */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDisconnect(supabase: any, userId: string) {
  await supabase.from("readai_sync_state").delete().eq("user_id", userId);

  return NextResponse.json({ disconnected: true });
}

/* ------------------------------------------------------------------ */
/*  Get state: return sync status (no key exposed)                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetState(supabase: any, userId: string) {
  const { data: state } = await supabase
    .from("readai_sync_state")
    .select(
      "id, is_connected, date_range_start, date_range_end, include_keywords, exclude_keywords, exclude_meeting_patterns, redact_participant_names, privacy_level, last_import_at, last_sync_at, last_error, meetings_imported, artifacts_extracted, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  // Counts
  const { count: meetingCount } = await supabase
    .from("meetings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("provider", "read_ai");

  const { count: artifactCount } = await supabase
    .from("meeting_artifacts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { count: themeCount } = await supabase
    .from("themes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { count: unprocessedCount } = await supabase
    .from("meetings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("processed", false);

  return NextResponse.json({
    state: state || null,
    counts: {
      meetings: meetingCount || 0,
      artifacts: artifactCount || 0,
      themes: themeCount || 0,
      unprocessed: unprocessedCount || 0,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Update settings: filters, privacy, scope                           */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpdateSettings(supabase: any, userId: string, body: {
  date_range_start?: string;
  date_range_end?: string;
  include_keywords?: string[];
  exclude_keywords?: string[];
  exclude_meeting_patterns?: string[];
  redact_participant_names?: boolean;
  privacy_level?: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = { updated_at: new Date().toISOString() };

  if (body.date_range_start !== undefined) updates.date_range_start = body.date_range_start || null;
  if (body.date_range_end !== undefined) updates.date_range_end = body.date_range_end || null;
  if (body.include_keywords !== undefined) updates.include_keywords = body.include_keywords;
  if (body.exclude_keywords !== undefined) updates.exclude_keywords = body.exclude_keywords;
  if (body.exclude_meeting_patterns !== undefined) updates.exclude_meeting_patterns = body.exclude_meeting_patterns;
  if (typeof body.redact_participant_names === "boolean") updates.redact_participant_names = body.redact_participant_names;
  if (body.privacy_level) updates.privacy_level = body.privacy_level;

  const { error } = await supabase
    .from("readai_sync_state")
    .update(updates)
    .eq("user_id", userId);

  if (error) throw error;

  return NextResponse.json({ updated: true });
}
