import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushSinglePost } from "@/lib/notion/sync-engine";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    title,
    content,
    pillar,
    platform,
    post_type,
    target_icp,
    tags,
    status,
    notes,
    message_id,
  } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json(
      { error: "Content is required" },
      { status: 400 },
    );
  }

  try {
    // Fetch FULL sync state upfront
    const { data: syncState } = await supabase
      .from("notion_sync_state")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const shouldSync =
      syncState?.is_connected && syncState?.auto_create_in_notion;

    // Create the post
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      title: title || null,
      content,
      status: status || "draft",
      pillar: pillar || null,
      platform: platform || "LinkedIn",
      post_type: post_type || null,
      target_icp: target_icp || null,
      tags: tags && tags.length > 0 ? tags : [],
      notes: notes || null,
    };
    if (message_id) insertPayload.message_id = message_id;
    if (shouldSync) insertPayload.sync_status = "pending";

    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert(insertPayload)
      .select("id")
      .single();

    if (postError) throw postError;

    // Create initial version
    await supabase.from("post_versions").insert({
      post_id: post.id,
      user_id: user.id,
      content,
      version_number: 1,
    });

    // Push to Notion immediately (awaited, same request context)
    if (shouldSync && syncState?.notion_database_id) {
      try {
        await pushSinglePost(supabase, syncState, post.id);
      } catch (pushErr) {
        console.error("[notion-auto-push] chat save-post failed", pushErr);
      }
    }

    return NextResponse.json({ success: true, postId: post.id });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
