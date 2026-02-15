import { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@notionhq/client";
import {
  createNotionClient,
  notionRequest,
  queryAllPages,
  queryPagesSince,
} from "./client";
import {
  extractPostFromNotionPage,
  buildNotionProperties,
  mapNotionStatusToApp,
} from "./property-map";

/* ------------------------------------------------------------------ */
/*  Error helper                                                       */
/* ------------------------------------------------------------------ */

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    // Supabase PostgrestError, Notion APIResponseError, etc.
    const obj = err as { message: string; details?: string; code?: string };
    const parts = [obj.message];
    if (obj.details) parts.push(obj.details);
    if (obj.code) parts.push(`(code: ${obj.code})`);
    return parts.join(" – ");
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SyncState {
  id: string;
  user_id: string;
  notion_access_token: string;
  notion_database_id: string;
  property_map: Record<string, string>;
  auto_create_in_notion: boolean;
  last_full_sync_at: string | null;
  last_incremental_sync_at: string | null;
}

interface SyncResult {
  pagesProcessed: number;
  pagesCreated: number;
  pagesUpdated: number;
  pagesSkipped: number;
  conflictsFound: number;
  errors: string[];
}

/* ------------------------------------------------------------------ */
/*  Sync lock management                                               */
/* ------------------------------------------------------------------ */

export async function acquireSyncLock(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  // Clean up expired locks first
  await supabase
    .from("sync_locks")
    .delete()
    .lt("expires_at", new Date().toISOString());

  // Try to insert a lock
  const { error } = await supabase.from("sync_locks").insert({
    user_id: userId,
    locked_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });

  // If insert fails (unique constraint), lock is already held
  return !error;
}

export async function releaseSyncLock(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase.from("sync_locks").delete().eq("user_id", userId);
}

/* ------------------------------------------------------------------ */
/*  Log sync event                                                     */
/* ------------------------------------------------------------------ */

export async function logSyncEvent(
  supabase: SupabaseClient,
  userId: string,
  eventType: string,
  direction: string | null,
  result: Partial<SyncResult>,
  startedAt: string,
  errorMessage?: string
): Promise<void> {
  await supabase.from("sync_events").insert({
    user_id: userId,
    event_type: eventType,
    direction,
    pages_processed: result.pagesProcessed || 0,
    pages_created: result.pagesCreated || 0,
    pages_updated: result.pagesUpdated || 0,
    pages_skipped: result.pagesSkipped || 0,
    conflicts_found: result.conflictsFound || 0,
    error_message: errorMessage || null,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/*  Full initial sync: Notion → App                                    */
/* ------------------------------------------------------------------ */

export async function fullSync(
  supabase: SupabaseClient,
  syncState: SyncState
): Promise<SyncResult> {
  const result: SyncResult = {
    pagesProcessed: 0,
    pagesCreated: 0,
    pagesUpdated: 0,
    pagesSkipped: 0,
    conflictsFound: 0,
    errors: [],
  };

  const notion = createNotionClient(syncState.notion_access_token);
  const pages = await queryAllPages(notion, {
    database_id: syncState.notion_database_id,
  });

  for (const page of pages) {
    result.pagesProcessed++;
    try {
      await upsertPostFromNotionPage(
        supabase,
        syncState,
        page,
        result,
        true // isFullSync
      );
    } catch (err) {
      const msg = errorToString(err);
      result.errors.push(`Page ${(page as { id: string }).id}: ${msg}`);
    }
  }

  // Update sync timestamps
  const now = new Date().toISOString();
  await supabase
    .from("notion_sync_state")
    .update({
      last_full_sync_at: now,
      last_incremental_sync_at: now,
      last_error: result.errors.length > 0 ? result.errors.join("; ") : null,
      updated_at: now,
    })
    .eq("id", syncState.id);

  return result;
}

/* ------------------------------------------------------------------ */
/*  Incremental sync: Notion → App                                     */
/* ------------------------------------------------------------------ */

export async function incrementalNotionToApp(
  supabase: SupabaseClient,
  syncState: SyncState
): Promise<SyncResult> {
  const result: SyncResult = {
    pagesProcessed: 0,
    pagesCreated: 0,
    pagesUpdated: 0,
    pagesSkipped: 0,
    conflictsFound: 0,
    errors: [],
  };

  const notion = createNotionClient(syncState.notion_access_token);
  const since =
    syncState.last_incremental_sync_at ||
    syncState.last_full_sync_at ||
    new Date(0).toISOString();

  const pages = await queryPagesSince(
    notion,
    syncState.notion_database_id,
    since
  );

  for (const page of pages) {
    result.pagesProcessed++;
    try {
      await upsertPostFromNotionPage(
        supabase,
        syncState,
        page,
        result,
        false
      );
    } catch (err) {
      const msg = errorToString(err);
      result.errors.push(`Page ${(page as { id: string }).id}: ${msg}`);
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from("notion_sync_state")
    .update({
      last_incremental_sync_at: now,
      last_error: result.errors.length > 0 ? result.errors.join("; ") : null,
      updated_at: now,
    })
    .eq("id", syncState.id);

  return result;
}

/* ------------------------------------------------------------------ */
/*  Incremental sync: App → Notion (pending posts)                     */
/* ------------------------------------------------------------------ */

export async function incrementalAppToNotion(
  supabase: SupabaseClient,
  syncState: SyncState
): Promise<SyncResult> {
  const result: SyncResult = {
    pagesProcessed: 0,
    pagesCreated: 0,
    pagesUpdated: 0,
    pagesSkipped: 0,
    conflictsFound: 0,
    errors: [],
  };

  const notion = createNotionClient(syncState.notion_access_token);

  // Find posts with sync_status = 'pending' that need pushing to Notion
  const { data: pendingPosts, error } = await supabase
    .from("posts")
    .select("*")
    .eq("user_id", syncState.user_id)
    .eq("sync_status", "pending");

  if (error || !pendingPosts) return result;

  for (const post of pendingPosts) {
    result.pagesProcessed++;
    try {
      await pushPostToNotion(supabase, notion, syncState, post, result);
    } catch (err) {
      const msg = errorToString(err);
      result.errors.push(`Post ${post.id}: ${msg}`);
      await supabase
        .from("posts")
        .update({ sync_status: "error" })
        .eq("id", post.id);
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Push a single post to Notion                                       */
/* ------------------------------------------------------------------ */

export async function pushSinglePost(
  supabase: SupabaseClient,
  syncState: SyncState,
  postId: string
): Promise<SyncResult> {
  const result: SyncResult = {
    pagesProcessed: 1,
    pagesCreated: 0,
    pagesUpdated: 0,
    pagesSkipped: 0,
    conflictsFound: 0,
    errors: [],
  };

  const notion = createNotionClient(syncState.notion_access_token);

  const { data: post, error } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .eq("user_id", syncState.user_id)
    .single();

  if (error || !post) {
    result.errors.push("Post not found");
    return result;
  }

  try {
    await pushPostToNotion(supabase, notion, syncState, post, result);
  } catch (err) {
    const msg = errorToString(err);
    result.errors.push(msg);
    await supabase
      .from("posts")
      .update({ sync_status: "error" })
      .eq("id", post.id);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Resolve a conflict                                                 */
/* ------------------------------------------------------------------ */

export async function resolveConflict(
  supabase: SupabaseClient,
  syncState: SyncState,
  postId: string,
  resolution: "keep_notion" | "keep_app" | "merge",
  mergedContent?: string
): Promise<void> {
  const notion = createNotionClient(syncState.notion_access_token);

  const { data: post } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .eq("user_id", syncState.user_id)
    .single();

  if (!post) throw new Error("Post not found");

  if (resolution === "keep_notion" && post.notion_page_id) {
    // Fetch current Notion page and overwrite app
    const page = await notionRequest(() =>
      notion.pages.retrieve({ page_id: post.notion_page_id })
    );
    const extracted = extractPostFromNotionPage(page, syncState.property_map);

    await supabase
      .from("posts")
      .update({
        content: extracted.content || post.content,
        status: mapNotionStatusToApp(extracted.status),
        pillar: extracted.pillar,
        tags: extracted.tags,
        notes: extracted.notes,
        linkedin_url: extracted.linkedin_url || post.linkedin_url,
        sync_status: "synced",
        notion_last_synced_at: new Date().toISOString(),
        notion_last_seen_edit_time: extracted.last_edited_time,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
  } else if (resolution === "keep_app" && post.notion_page_id) {
    // Push app version to Notion
    const title = post.content?.split("\n")[0]?.slice(0, 100) || "Untitled";
    const properties = buildNotionProperties(post, title, syncState.property_map);

    await notionRequest(() =>
      notion.pages.update({
        page_id: post.notion_page_id,
        properties,
      })
    );

    await supabase
      .from("posts")
      .update({
        sync_status: "synced",
        notion_last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
  } else if (resolution === "merge") {
    // Use merged content
    const finalContent = mergedContent || post.content;
    const title = finalContent?.split("\n")[0]?.slice(0, 100) || "Untitled";

    await supabase
      .from("posts")
      .update({
        content: finalContent,
        sync_status: "synced",
        notion_last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    // Also push to Notion if page exists
    if (post.notion_page_id) {
      const properties = buildNotionProperties(
        { ...post, content: finalContent },
        title,
        syncState.property_map
      );
      await notionRequest(() =>
        notion.pages.update({
          page_id: post.notion_page_id,
          properties,
        })
      );
    }
  }

  // Log the resolution
  await logSyncEvent(
    supabase,
    syncState.user_id,
    "conflict_resolved",
    "both",
    { pagesProcessed: 1, pagesUpdated: 1 },
    new Date().toISOString()
  );
}

/* ------------------------------------------------------------------ */
/*  Internal: upsert a Notion page into our posts table                */
/* ------------------------------------------------------------------ */

async function upsertPostFromNotionPage(
  supabase: SupabaseClient,
  syncState: SyncState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  result: SyncResult,
  isFullSync: boolean
): Promise<void> {
  const extracted = extractPostFromNotionPage(page, syncState.property_map);
  const now = new Date().toISOString();

  // Check if we already have this post linked
  const { data: existingPost } = await supabase
    .from("posts")
    .select("*")
    .eq("notion_page_id", extracted.notion_page_id)
    .eq("user_id", syncState.user_id)
    .maybeSingle();

  if (existingPost) {
    // Check for conflicts: if both sides changed since last sync
    if (!isFullSync && existingPost.sync_status !== "conflict") {
      const lastSynced = existingPost.notion_last_synced_at;
      const appChanged =
        lastSynced && existingPost.updated_at > lastSynced;
      const notionChanged =
        lastSynced &&
        extracted.last_edited_time > lastSynced;

      if (appChanged && notionChanged) {
        // Conflict detected
        await supabase
          .from("posts")
          .update({
            sync_status: "conflict",
            notion_last_seen_edit_time: extracted.last_edited_time,
          })
          .eq("id", existingPost.id);
        result.conflictsFound++;
        return;
      }

      // If only app changed, skip (will be pushed in app-to-notion pass)
      if (appChanged && !notionChanged) {
        result.pagesSkipped++;
        return;
      }
    }

    // Update from Notion
    await supabase
      .from("posts")
      .update({
        title: extracted.title || existingPost.title,
        content: extracted.content || existingPost.content,
        status: mapNotionStatusToApp(extracted.status),
        published_at:
          extracted.publish_date
            ? new Date(extracted.publish_date).toISOString()
            : existingPost.published_at,
        linkedin_url: extracted.linkedin_url || existingPost.linkedin_url,
        pillar: extracted.pillar,
        tags: extracted.tags,
        notes: extracted.notes,
        sync_status: "synced",
        source_of_truth: existingPost.source_of_truth,
        notion_last_synced_at: now,
        notion_last_seen_edit_time: extracted.last_edited_time,
        updated_at: now,
      })
      .eq("id", existingPost.id);

    // Sync analytics from Notion if available
    if (extracted.impressions !== null || extracted.likes !== null || extracted.comments !== null) {
      const { data: existingAnalytics } = await supabase
        .from("post_analytics")
        .select("id")
        .eq("post_id", existingPost.id)
        .eq("user_id", syncState.user_id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const metricsPayload = {
        impressions: extracted.impressions || 0,
        likes: extracted.likes || 0,
        comments: extracted.comments || 0,
        fetched_at: now,
      };

      if (existingAnalytics) {
        await supabase
          .from("post_analytics")
          .update(metricsPayload)
          .eq("id", existingAnalytics.id);
      } else {
        await supabase.from("post_analytics").insert({
          post_id: existingPost.id,
          user_id: syncState.user_id,
          ...metricsPayload,
        });
      }
    }

    result.pagesUpdated++;
  } else {
    // Create new post from Notion page
    const { error } = await supabase.from("posts").insert({
      user_id: syncState.user_id,
      title: extracted.title,
      content: extracted.content || extracted.title || "",
      status: mapNotionStatusToApp(extracted.status),
      published_at: extracted.publish_date
        ? new Date(extracted.publish_date).toISOString()
        : null,
      linkedin_url: extracted.linkedin_url,
      pillar: extracted.pillar,
      tags: extracted.tags,
      notes: extracted.notes,
      notion_page_id: extracted.notion_page_id,
      sync_status: "synced",
      source_of_truth: "notion",
      notion_last_synced_at: now,
      notion_last_seen_edit_time: extracted.last_edited_time,
    });

    if (error) throw error;
    result.pagesCreated++;
  }
}

/* ------------------------------------------------------------------ */
/*  Internal: push a single post to Notion                             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pushPostToNotion(
  supabase: SupabaseClient,
  notion: Client,
  syncState: SyncState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: any,
  result: SyncResult
): Promise<void> {
  const title = post.title || post.content?.split("\n")[0]?.slice(0, 100) || "Untitled";
  const now = new Date().toISOString();

  if (post.notion_page_id) {
    // Update existing page in Notion — include analytics if available
    const { data: analytics } = await supabase
      .from("post_analytics")
      .select("impressions, likes, comments")
      .eq("post_id", post.id)
      .eq("user_id", syncState.user_id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const postWithAnalytics = analytics
      ? { ...post, impressions: analytics.impressions, likes: analytics.likes, comments_count: analytics.comments }
      : post;

    const properties = buildNotionProperties(
      postWithAnalytics,
      title,
      syncState.property_map
    );

    await notionRequest(() =>
      notion.pages.update({
        page_id: post.notion_page_id,
        properties,
      })
    );

    await supabase
      .from("posts")
      .update({
        sync_status: "synced",
        notion_last_synced_at: now,
        updated_at: now,
      })
      .eq("id", post.id);
    result.pagesUpdated++;
  } else if (syncState.auto_create_in_notion) {
    // Create new page in Notion
    const properties = buildNotionProperties(
      post,
      title,
      syncState.property_map
    );

    const newPage = await notionRequest(() =>
      notion.pages.create({
        parent: { data_source_id: syncState.notion_database_id },
        properties,
      })
    );

    await supabase
      .from("posts")
      .update({
        notion_page_id: newPage.id,
        sync_status: "synced",
        source_of_truth: "hybrid",
        notion_last_synced_at: now,
        notion_last_seen_edit_time: (newPage as { last_edited_time: string })
          .last_edited_time,
        updated_at: now,
      })
      .eq("id", post.id);
    result.pagesCreated++;
  } else {
    result.pagesSkipped++;
  }
}
