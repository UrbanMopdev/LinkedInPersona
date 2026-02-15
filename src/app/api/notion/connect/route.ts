import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNotionClient, notionRequest } from "@/lib/notion/client";
import { DEFAULT_PROPERTY_MAP } from "@/lib/notion/property-map";
import { logSyncEvent } from "@/lib/notion/sync-engine";

/* ------------------------------------------------------------------ */
/*  POST /api/notion/connect                                           */
/*  Connect, disconnect, select database, update property map          */
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
      case "select_database":
        return await handleSelectDatabase(supabase, user.id, body);
      case "update_property_map":
        return await handleUpdatePropertyMap(supabase, user.id, body);
      case "update_settings":
        return await handleUpdateSettings(supabase, user.id, body);
      case "list_databases":
        return await handleListDatabases(supabase, user.id);
      case "get_state":
        return await handleGetState(supabase, user.id);
      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: search for databases via Notion API                        */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDatabases(results: any[]): Array<{ id: string; title: string }> {
  return results
    .filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.object === "database" || r.object === "data_source"
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((db: any) => ({
      id: db.id as string,
      title: Array.isArray(db.title)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? db.title.map((t: any) => t.plain_text).join("")
        : "Untitled",
    }));
}

/* ------------------------------------------------------------------ */
/*  Connect: validate token, store it, list available databases        */
/* ------------------------------------------------------------------ */

async function handleConnect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  body: { access_token: string }
) {
  const { access_token } = body;
  if (!access_token) {
    return NextResponse.json(
      { error: "access_token is required" },
      { status: 400 }
    );
  }

  // Validate the token by calling Notion API
  const notion = createNotionClient(access_token);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let botUser: any;
  try {
    botUser = await notionRequest(() => notion.users.me({}));
  } catch {
    return NextResponse.json(
      { error: "Invalid Notion token. Could not authenticate." },
      { status: 400 }
    );
  }

  // Search for databases the integration can access
  // SDK v5 uses "data_source" instead of "database"
  const searchResult = await notionRequest(() =>
    notion.search({
      filter: { property: "object", value: "data_source" },
      page_size: 50,
    })
  );

  const databases = extractDatabases(searchResult.results);

  // Upsert sync state
  const { error: upsertError } = await supabase
    .from("notion_sync_state")
    .upsert(
      {
        user_id: userId,
        notion_access_token: access_token,
        notion_bot_id: botUser?.bot?.owner?.user?.id || null,
        notion_workspace_name: botUser?.name || "Workspace",
        is_connected: true,
        property_map: DEFAULT_PROPERTY_MAP,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertError) throw upsertError;

  await logSyncEvent(
    supabase,
    userId,
    "connect",
    null,
    {},
    new Date().toISOString()
  );

  return NextResponse.json({
    connected: true,
    workspace: botUser?.name,
    databases,
  });
}

/* ------------------------------------------------------------------ */
/*  Disconnect: clear Notion state                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDisconnect(supabase: any, userId: string) {
  await supabase.from("notion_sync_state").delete().eq("user_id", userId);

  // Clear Notion references from posts but keep the posts
  await supabase
    .from("posts")
    .update({
      notion_page_id: null,
      notion_last_synced_at: null,
      notion_last_seen_edit_time: null,
      sync_status: "synced",
      source_of_truth: "app",
    })
    .eq("user_id", userId);

  await logSyncEvent(
    supabase,
    userId,
    "disconnect",
    null,
    {},
    new Date().toISOString()
  );

  return NextResponse.json({ disconnected: true });
}

/* ------------------------------------------------------------------ */
/*  Select database: validate and store the chosen database ID         */
/* ------------------------------------------------------------------ */

async function handleSelectDatabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  body: { database_id: string }
) {
  const { database_id } = body;
  if (!database_id) {
    return NextResponse.json(
      { error: "database_id is required" },
      { status: 400 }
    );
  }

  // Get stored token
  const { data: state } = await supabase
    .from("notion_sync_state")
    .select("notion_access_token")
    .eq("user_id", userId)
    .single();

  if (!state) {
    return NextResponse.json(
      { error: "Not connected to Notion" },
      { status: 400 }
    );
  }

  // Validate access to this data source (SDK v5: databases → dataSources)
  const notion = createNotionClient(state.notion_access_token);
  try {
    const db = await notionRequest(() =>
      notion.dataSources.retrieve({ data_source_id: database_id })
    );

    // Extract property names for mapping hints
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbAny = db as any;
    const properties = dbAny.properties
      ? Object.entries(dbAny.properties).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ([name, prop]: [string, any]) => ({
            name,
            type: prop.type as string,
          })
        )
      : [];

    await supabase
      .from("notion_sync_state")
      .update({
        notion_database_id: database_id,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return NextResponse.json({ selected: true, properties });
  } catch {
    return NextResponse.json(
      { error: "Cannot access this database. Check integration permissions." },
      { status: 400 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Update property map                                                */
/* ------------------------------------------------------------------ */

async function handleUpdatePropertyMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  body: { property_map: Record<string, string> }
) {
  const { property_map } = body;
  if (!property_map || typeof property_map !== "object") {
    return NextResponse.json(
      { error: "property_map is required" },
      { status: 400 }
    );
  }

  await supabase
    .from("notion_sync_state")
    .update({ property_map, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return NextResponse.json({ updated: true });
}

/* ------------------------------------------------------------------ */
/*  Update settings (auto_create_in_notion, etc.)                      */
/* ------------------------------------------------------------------ */

async function handleUpdateSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  body: { auto_create_in_notion?: boolean }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = { updated_at: new Date().toISOString() };
  if (typeof body.auto_create_in_notion === "boolean") {
    updates.auto_create_in_notion = body.auto_create_in_notion;
  }

  await supabase
    .from("notion_sync_state")
    .update(updates)
    .eq("user_id", userId);

  return NextResponse.json({ updated: true });
}

/* ------------------------------------------------------------------ */
/*  List databases                                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListDatabases(supabase: any, userId: string) {
  const { data: state } = await supabase
    .from("notion_sync_state")
    .select("notion_access_token")
    .eq("user_id", userId)
    .single();

  if (!state) {
    return NextResponse.json(
      { error: "Not connected to Notion" },
      { status: 400 }
    );
  }

  const notion = createNotionClient(state.notion_access_token);
  const searchResult = await notionRequest(() =>
    notion.search({
      filter: { property: "object", value: "data_source" },
      page_size: 50,
    })
  );

  const databases = extractDatabases(searchResult.results);

  return NextResponse.json({ databases });
}

/* ------------------------------------------------------------------ */
/*  Get current sync state (safe — no token exposed)                   */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetState(supabase: any, userId: string) {
  const { data: state } = await supabase
    .from("notion_sync_state")
    .select(
      "id, notion_database_id, notion_workspace_name, property_map, auto_create_in_notion, last_full_sync_at, last_incremental_sync_at, last_error, is_connected, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  // Also get recent sync events
  const { data: recentEvents } = await supabase
    .from("sync_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Get conflict count
  const { count: conflictCount } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("sync_status", "conflict");

  return NextResponse.json({
    state: state || null,
    recentEvents: recentEvents || [],
    conflictCount: conflictCount || 0,
  });
}
