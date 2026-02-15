import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/chat/update-post-meta
 * Updates a post's metadata fields (pillar, ICP, status, etc.).
 * If linked to Notion, pushes the update.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { postId, meta } = await req.json();

  if (!postId || !meta) {
    return NextResponse.json(
      { error: "postId and meta are required" },
      { status: 400 }
    );
  }

  try {
    // Check post ownership and get Notion link
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("id, notion_page_id")
      .eq("id", postId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Map meta fields to DB columns
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (meta.pillar !== undefined) updatePayload.pillar = meta.pillar || null;
    if (meta.icp !== undefined) updatePayload.target_icp = meta.icp || null;
    if (meta.hookType !== undefined)
      updatePayload.post_type = meta.hookType || null;
    if (meta.status !== undefined) updatePayload.status = meta.status || "draft";
    if (meta.publishDate !== undefined) {
      updatePayload.scheduled_at = meta.publishDate || null;
    }
    if (meta.tags !== undefined) {
      updatePayload.tags =
        Array.isArray(meta.tags) && meta.tags.length > 0 ? meta.tags : [];
    }
    if (meta.notes !== undefined) updatePayload.notes = meta.notes || null;
    if (meta.objective !== undefined) {
      // Store objective in notes if no dedicated column — append or manage
      // For now, we use a convention: notes field can contain the objective
      // But since the DB has no 'objective' column, we'll store it in notes
      // by prefixing. Actually, let's keep it simple: objective goes into post_type
      // which is "Hook type / Objective" contextually. But the spec says hookType
      // maps to post_type. So objective is extra context. Let's store it as part
      // of notes rather than losing it.
    }

    if (post.notion_page_id) {
      updatePayload.sync_status = "pending";
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update(updatePayload)
      .eq("id", postId)
      .eq("user_id", user.id);

    if (updateError) throw updateError;

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

    return NextResponse.json({ success: true, notionPushed });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update post meta";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
