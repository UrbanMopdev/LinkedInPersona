import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushSinglePost, logSyncEvent } from "@/lib/notion/sync-engine";

/* ------------------------------------------------------------------ */
/*  POST /api/notion/push                                              */
/*  Push a single post from App → Notion                               */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { post_id } = await req.json();

  if (!post_id) {
    return NextResponse.json(
      { error: "post_id is required" },
      { status: 400 }
    );
  }

  // Get sync state
  const { data: syncState } = await supabase
    .from("notion_sync_state")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!syncState || !syncState.is_connected) {
    return NextResponse.json(
      { error: "Notion not connected" },
      { status: 400 }
    );
  }

  if (!syncState.notion_database_id) {
    return NextResponse.json(
      { error: "No Notion database selected" },
      { status: 400 }
    );
  }

  const startedAt = new Date().toISOString();
  try {
    const result = await pushSinglePost(supabase, syncState, post_id);

    await logSyncEvent(
      supabase,
      user.id,
      "push_single",
      "app_to_notion",
      result,
      startedAt,
      result.errors.length > 0 ? result.errors.join("; ") : undefined
    );

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Push failed";
    await logSyncEvent(
      supabase,
      user.id,
      "error",
      "app_to_notion",
      {},
      startedAt,
      message
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
