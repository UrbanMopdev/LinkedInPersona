import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  acquireSyncLock,
  releaseSyncLock,
  fullSync,
  incrementalNotionToApp,
  incrementalAppToNotion,
  logSyncEvent,
  resolveConflict,
} from "@/lib/notion/sync-engine";

/* ------------------------------------------------------------------ */
/*  POST /api/notion/sync                                              */
/*  Runs sync: full (initial), incremental, or conflict resolution     */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow cron calls with CRON_SECRET header (no user session)
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron =
    cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!user && !isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, post_id, resolution, merged_content, user_id: cronUserId } = body;

  try {
    if (isCron && action === "cron_sync_all") {
      return await handleCronSyncAll(supabase);
    }

    const userId = user?.id || cronUserId;
    if (!userId) {
      return NextResponse.json({ error: "No user" }, { status: 400 });
    }

    // Get sync state
    const { data: syncState } = await supabase
      .from("notion_sync_state")
      .select("*")
      .eq("user_id", userId)
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

    switch (action) {
      case "full_sync":
        return await handleFullSync(supabase, userId, syncState);
      case "incremental":
        return await handleIncremental(supabase, userId, syncState);
      case "resolve_conflict":
        return await handleResolveConflict(
          supabase,
          syncState,
          post_id,
          resolution,
          merged_content
        );
      default:
        return NextResponse.json(
          { error: "Unknown action. Use full_sync, incremental, or resolve_conflict." },
          { status: 400 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Full sync                                                          */
/* ------------------------------------------------------------------ */

async function handleFullSync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  syncState: any
) {
  const locked = await acquireSyncLock(supabase, userId);
  if (!locked) {
    return NextResponse.json(
      { error: "Sync already in progress" },
      { status: 409 }
    );
  }

  const startedAt = new Date().toISOString();
  try {
    const result = await fullSync(supabase, syncState);

    await logSyncEvent(
      supabase,
      userId,
      "full_sync",
      "notion_to_app",
      result,
      startedAt,
      result.errors.length > 0 ? result.errors.join("; ") : undefined
    );

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : "Full sync failed";
    await logSyncEvent(
      supabase,
      userId,
      "error",
      "notion_to_app",
      {},
      startedAt,
      message
    );
    throw err;
  } finally {
    await releaseSyncLock(supabase, userId);
  }
}

/* ------------------------------------------------------------------ */
/*  Incremental sync (both directions)                                 */
/* ------------------------------------------------------------------ */

async function handleIncremental(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  syncState: any
) {
  const locked = await acquireSyncLock(supabase, userId);
  if (!locked) {
    return NextResponse.json(
      { error: "Sync already in progress" },
      { status: 409 }
    );
  }

  const startedAt = new Date().toISOString();
  try {
    // Notion → App
    const n2aResult = await incrementalNotionToApp(supabase, syncState);
    await logSyncEvent(
      supabase,
      userId,
      "incremental_notion_to_app",
      "notion_to_app",
      n2aResult,
      startedAt,
      n2aResult.errors.length > 0 ? n2aResult.errors.join("; ") : undefined
    );

    // App → Notion
    const a2nResult = await incrementalAppToNotion(supabase, syncState);
    await logSyncEvent(
      supabase,
      userId,
      "incremental_app_to_notion",
      "app_to_notion",
      a2nResult,
      startedAt,
      a2nResult.errors.length > 0 ? a2nResult.errors.join("; ") : undefined
    );

    return NextResponse.json({
      success: true,
      notionToApp: n2aResult,
      appToNotion: a2nResult,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : "Incremental sync failed";
    await logSyncEvent(
      supabase,
      userId,
      "error",
      "both",
      {},
      startedAt,
      message
    );
    throw err;
  } finally {
    await releaseSyncLock(supabase, userId);
  }
}

/* ------------------------------------------------------------------ */
/*  Resolve conflict                                                   */
/* ------------------------------------------------------------------ */

async function handleResolveConflict(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  syncState: any,
  postId: string,
  resolution: "keep_notion" | "keep_app" | "merge",
  mergedContent?: string
) {
  if (!postId || !resolution) {
    return NextResponse.json(
      { error: "post_id and resolution are required" },
      { status: 400 }
    );
  }

  await resolveConflict(supabase, syncState, postId, resolution, mergedContent);
  return NextResponse.json({ resolved: true });
}

/* ------------------------------------------------------------------ */
/*  Cron: sync all connected users                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCronSyncAll(supabase: any) {
  // Get all connected users with a database selected
  const { data: allStates } = await supabase
    .from("notion_sync_state")
    .select("*")
    .eq("is_connected", true)
    .not("notion_database_id", "is", null);

  if (!allStates || allStates.length === 0) {
    return NextResponse.json({ message: "No users to sync", synced: 0 });
  }

  const results = [];
  for (const syncState of allStates) {
    const locked = await acquireSyncLock(supabase, syncState.user_id);
    if (!locked) {
      results.push({ userId: syncState.user_id, skipped: "lock held" });
      continue;
    }

    const startedAt = new Date().toISOString();
    try {
      const n2a = await incrementalNotionToApp(supabase, syncState);
      const a2n = await incrementalAppToNotion(supabase, syncState);
      results.push({
        userId: syncState.user_id,
        notionToApp: n2a,
        appToNotion: a2n,
      });

      await logSyncEvent(
        supabase,
        syncState.user_id,
        "incremental_notion_to_app",
        "both",
        {
          pagesProcessed:
            n2a.pagesProcessed + a2n.pagesProcessed,
          pagesCreated: n2a.pagesCreated + a2n.pagesCreated,
          pagesUpdated: n2a.pagesUpdated + a2n.pagesUpdated,
          conflictsFound: n2a.conflictsFound,
        },
        startedAt
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : String(err);
      results.push({ userId: syncState.user_id, error: msg });

      await supabase
        .from("notion_sync_state")
        .update({ last_error: msg, updated_at: new Date().toISOString() })
        .eq("id", syncState.id);
    } finally {
      await releaseSyncLock(supabase, syncState.user_id);
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
