import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/chat/update-post
 * Updates a post's body content and creates a new version.
 * If the post is linked to Notion, pushes the update.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { postId, body } = await req.json();

  if (!postId || typeof body !== "string" || !body.trim()) {
    return NextResponse.json(
      { error: "postId and body are required" },
      { status: 400 }
    );
  }

  try {
    // Get current post to check ownership and Notion link
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("id, notion_page_id")
      .eq("id", postId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Get next version number
    const { data: versions } = await supabase
      .from("post_versions")
      .select("version_number")
      .eq("post_id", postId)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVersion = (versions?.[0]?.version_number || 0) + 1;

    // Update post content
    const updatePayload: Record<string, unknown> = {
      content: body.trim(),
      updated_at: new Date().toISOString(),
    };
    if (post.notion_page_id) {
      updatePayload.sync_status = "pending";
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update(updatePayload)
      .eq("id", postId)
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    // Create new version
    const { error: versionError } = await supabase
      .from("post_versions")
      .insert({
        post_id: postId,
        user_id: user.id,
        content: body.trim(),
        version_number: nextVersion,
      });

    if (versionError) throw versionError;

    // If Notion is linked, trigger push
    let notionPushed = false;
    if (post.notion_page_id) {
      try {
        const origin = req.headers.get("origin") || "";
        await fetch(`${origin}/api/notion/push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.get("cookie") || "",
          },
          body: JSON.stringify({ post_id: postId }),
        });
        notionPushed = true;
      } catch {
        // Notion push is best-effort
      }
    }

    return NextResponse.json({
      success: true,
      version: nextVersion,
      notionPushed,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
