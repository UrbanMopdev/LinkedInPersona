import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json(
      { error: "Content is required" },
      { status: 400 },
    );
  }

  try {
    // Check if Notion auto-create is on
    const { data: notionState } = await supabase
      .from("notion_sync_state")
      .select("auto_create_in_notion, is_connected")
      .eq("user_id", user.id)
      .maybeSingle();

    const shouldMarkPending =
      notionState?.is_connected && notionState?.auto_create_in_notion;

    // Create the post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
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
        ...(shouldMarkPending ? { sync_status: "pending" } : {}),
      })
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

    return NextResponse.json({ success: true, postId: post.id });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
