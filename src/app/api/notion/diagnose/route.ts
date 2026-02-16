import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNotionClient, notionRequest } from "@/lib/notion/client";
import { buildNotionProperties } from "@/lib/notion/property-map";

/* ------------------------------------------------------------------ */
/*  GET /api/notion/diagnose                                           */
/*  Step-by-step diagnostic for Notion sync pipeline                   */
/* ------------------------------------------------------------------ */

interface Step {
  step: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export async function GET() {
  const steps: Step[] = [];

  // Step 1: Auth
  let supabase;
  let userId: string;
  try {
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      steps.push({ step: "auth", status: "fail", detail: "Not authenticated — are you logged in?" });
      return NextResponse.json({ steps });
    }
    userId = user.id;
    steps.push({ step: "auth", status: "pass", detail: `Authenticated as ${user.email}` });
  } catch (err) {
    steps.push({ step: "auth", status: "fail", detail: `Auth error: ${errMsg(err)}` });
    return NextResponse.json({ steps });
  }

  // Step 2: Sync state exists
  let syncState;
  try {
    const { data, error } = await supabase
      .from("notion_sync_state")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      steps.push({ step: "sync_state", status: "fail", detail: `DB error: ${error.message}` });
      return NextResponse.json({ steps });
    }
    if (!data) {
      steps.push({ step: "sync_state", status: "fail", detail: "No notion_sync_state row found — Notion not connected" });
      return NextResponse.json({ steps });
    }
    syncState = data;
    steps.push({
      step: "sync_state",
      status: "pass",
      detail: `Found sync state`,
      data: {
        is_connected: data.is_connected,
        auto_create_in_notion: data.auto_create_in_notion,
        has_token: !!data.notion_access_token,
        has_database_id: !!data.notion_database_id,
        database_id: data.notion_database_id ? `...${data.notion_database_id.slice(-8)}` : null,
        property_map_keys: data.property_map ? Object.keys(data.property_map) : [],
        last_error: data.last_error,
      },
    });
  } catch (err) {
    steps.push({ step: "sync_state", status: "fail", detail: errMsg(err) });
    return NextResponse.json({ steps });
  }

  // Step 3: Check is_connected
  if (!syncState.is_connected) {
    steps.push({ step: "is_connected", status: "fail", detail: "is_connected is false — toggle Notion on in settings" });
    return NextResponse.json({ steps });
  }
  steps.push({ step: "is_connected", status: "pass", detail: "Notion is marked as connected" });

  // Step 4: Check token
  if (!syncState.notion_access_token) {
    steps.push({ step: "token", status: "fail", detail: "No notion_access_token stored — re-connect Notion via OAuth" });
    return NextResponse.json({ steps });
  }
  steps.push({ step: "token", status: "pass", detail: `Token present (${syncState.notion_access_token.length} chars)` });

  // Step 5: Check database_id
  if (!syncState.notion_database_id) {
    steps.push({ step: "database_id", status: "fail", detail: "No notion_database_id — select a database in settings" });
    return NextResponse.json({ steps });
  }
  steps.push({ step: "database_id", status: "pass", detail: `Database ID: ...${syncState.notion_database_id.slice(-8)}` });

  // Step 6: Can we create a Notion client and talk to the API?
  let notion;
  try {
    notion = createNotionClient(syncState.notion_access_token);
    const me = await notionRequest(() => notion!.users.me({}));
    steps.push({
      step: "notion_api",
      status: "pass",
      detail: `Connected to Notion as ${(me as { name?: string }).name || "unknown"}`,
    });
  } catch (err) {
    steps.push({ step: "notion_api", status: "fail", detail: `Notion API error: ${errMsg(err)}` });
    return NextResponse.json({ steps });
  }

  // Step 7: Can we query the database?
  try {
    const db = await notionRequest(() =>
      notion!.databases.retrieve({ database_id: syncState.notion_database_id })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = Object.keys((db as any).properties || {});
    steps.push({
      step: "database_access",
      status: "pass",
      detail: `Database accessible — ${props.length} properties found`,
      data: { properties: props },
    });
  } catch (err) {
    steps.push({
      step: "database_access",
      status: "fail",
      detail: `Cannot access database: ${errMsg(err)}. The integration may not have been shared with this database.`,
    });
    return NextResponse.json({ steps });
  }

  // Step 8: Check property map
  const map = syncState.property_map || {};
  if (!map.title) {
    steps.push({ step: "property_map", status: "fail", detail: "property_map has no 'title' key — cannot create pages" });
    return NextResponse.json({ steps });
  }
  steps.push({
    step: "property_map",
    status: "pass",
    detail: `Property map has ${Object.keys(map).length} mappings`,
    data: map,
  });

  // Step 9: Find a pending post and try to build its properties
  const { data: pendingPost } = await supabase
    .from("posts")
    .select("*")
    .eq("user_id", userId)
    .eq("sync_status", "pending")
    .limit(1)
    .maybeSingle();

  if (!pendingPost) {
    // Also check for any post to do a dry-run
    const { data: anyPost } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!anyPost) {
      steps.push({ step: "test_post", status: "skip", detail: "No posts found at all — create a post first" });
      return NextResponse.json({ steps });
    }

    steps.push({
      step: "test_post",
      status: "skip",
      detail: `No pending posts. Latest post '${anyPost.title || anyPost.content?.slice(0, 40)}' has sync_status='${anyPost.sync_status || "null"}'`,
      data: {
        id: anyPost.id,
        sync_status: anyPost.sync_status,
        notion_page_id: anyPost.notion_page_id,
        title: anyPost.title,
      },
    });
  } else {
    steps.push({
      step: "test_post",
      status: "pass",
      detail: `Found pending post: '${pendingPost.title || pendingPost.content?.slice(0, 40)}'`,
      data: {
        id: pendingPost.id,
        notion_page_id: pendingPost.notion_page_id,
        sync_status: pendingPost.sync_status,
      },
    });

    // Step 10: Try building properties
    try {
      const title =
        pendingPost.title ||
        pendingPost.content?.split("\n")[0]?.slice(0, 100) ||
        "Untitled";
      const properties = buildNotionProperties(pendingPost, title, map);
      steps.push({
        step: "build_properties",
        status: "pass",
        detail: `Built ${Object.keys(properties).length} Notion properties`,
        data: { property_names: Object.keys(properties) },
      });
    } catch (err) {
      steps.push({
        step: "build_properties",
        status: "fail",
        detail: `Failed to build properties: ${errMsg(err)}`,
      });
    }

    // Step 11: Try the actual push (create or update)
    if (pendingPost.notion_page_id) {
      // Update path
      try {
        const title =
          pendingPost.title ||
          pendingPost.content?.split("\n")[0]?.slice(0, 100) ||
          "Untitled";
        const properties = buildNotionProperties(pendingPost, title, map);

        await notionRequest(() =>
          notion!.pages.update({
            page_id: pendingPost.notion_page_id,
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
          .eq("id", pendingPost.id);

        steps.push({
          step: "push_test",
          status: "pass",
          detail: `Successfully UPDATED Notion page ${pendingPost.notion_page_id}`,
        });
      } catch (err) {
        steps.push({
          step: "push_test",
          status: "fail",
          detail: `Failed to update Notion page: ${errMsg(err)}`,
        });
      }
    } else if (syncState.auto_create_in_notion) {
      // Create path
      try {
        const title =
          pendingPost.title ||
          pendingPost.content?.split("\n")[0]?.slice(0, 100) ||
          "Untitled";
        const properties = buildNotionProperties(pendingPost, title, map);

        const newPage = await notionRequest(() =>
          notion!.pages.create({
            parent: { database_id: syncState.notion_database_id },
            properties,
          })
        );

        await supabase
          .from("posts")
          .update({
            notion_page_id: newPage.id,
            sync_status: "synced",
            source_of_truth: "hybrid",
            notion_last_synced_at: new Date().toISOString(),
            notion_last_seen_edit_time: (
              newPage as { last_edited_time: string }
            ).last_edited_time,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pendingPost.id);

        steps.push({
          step: "push_test",
          status: "pass",
          detail: `Successfully CREATED Notion page ${newPage.id}`,
        });
      } catch (err) {
        steps.push({
          step: "push_test",
          status: "fail",
          detail: `Failed to create Notion page: ${errMsg(err)}`,
        });
      }
    } else {
      steps.push({
        step: "push_test",
        status: "skip",
        detail: "Post has no notion_page_id and auto_create_in_notion is off — nothing to push",
      });
    }
  }

  const allPassed = steps.every((s) => s.status !== "fail");
  return NextResponse.json({ ok: allPassed, steps });
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
