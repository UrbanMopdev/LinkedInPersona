"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/* ------------------------------------------------------------------ */
/*  Ideas CRUD                                                         */
/* ------------------------------------------------------------------ */

export async function getIdeas() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("ideas")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function saveIdea(title: string, body: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("ideas")
    .insert({ user_id: user.id, title, body, status: "draft" })
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/app/write");
  return data;
}

export async function deleteIdea(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("ideas")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/app/write");
}

/* ------------------------------------------------------------------ */
/*  Posts CRUD                                                         */
/* ------------------------------------------------------------------ */

export async function createPost(content: string, ideaId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check if Notion is connected with auto-create to mark for sync
  const { data: notionState } = await supabase
    .from("notion_sync_state")
    .select("auto_create_in_notion, is_connected")
    .eq("user_id", user.id)
    .maybeSingle();

  const shouldMarkPending =
    notionState?.is_connected && notionState?.auto_create_in_notion;

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      content,
      idea_id: ideaId || null,
      status: "draft",
      ...(shouldMarkPending ? { sync_status: "pending" } : {}),
    })
    .select()
    .single();

  if (postError) throw postError;

  const { error: versionError } = await supabase
    .from("post_versions")
    .insert({
      post_id: post.id,
      user_id: user.id,
      content,
      version_number: 1,
    });

  if (versionError) throw versionError;

  revalidatePath("/app/write");
  return post;
}

export async function updatePostContent(postId: string, content: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: versions } = await supabase
    .from("post_versions")
    .select("version_number")
    .eq("post_id", postId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = (versions?.[0]?.version_number || 0) + 1;

  // Check if this post is linked to Notion — if so, mark as pending
  const { data: existingPost } = await supabase
    .from("posts")
    .select("notion_page_id")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  // Check if Notion auto-create is on (for posts not yet linked)
  const { data: notionState } = await supabase
    .from("notion_sync_state")
    .select("auto_create_in_notion, is_connected")
    .eq("user_id", user.id)
    .maybeSingle();

  const shouldMarkPending =
    existingPost?.notion_page_id ||
    (notionState?.is_connected && notionState?.auto_create_in_notion);

  const updatePayload: Record<string, unknown> = {
    content,
    updated_at: new Date().toISOString(),
  };
  if (shouldMarkPending) {
    updatePayload.sync_status = "pending";
  }

  const { error: postError } = await supabase
    .from("posts")
    .update(updatePayload)
    .eq("id", postId)
    .eq("user_id", user.id);

  if (postError) throw postError;

  const { error: versionError } = await supabase
    .from("post_versions")
    .insert({
      post_id: postId,
      user_id: user.id,
      content,
      version_number: nextVersion,
    });

  if (versionError) throw versionError;

  revalidatePath("/app/write");
  return { version: nextVersion };
}

export async function getPosts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("posts")
    .select("*, ideas(title)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getPostVersions(postId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("post_versions")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return data;
}

export async function deletePost(postId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Delete versions first
  await supabase
    .from("post_versions")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", user.id);

  // Delete analytics
  await supabase
    .from("post_analytics")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", user.id);

  // Delete the post
  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/app/write");
  revalidatePath("/app/calendar");
  revalidatePath("/app/posts");
}

export async function markAsPosted(postId: string, linkedinUrl?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check if linked to Notion
  const { data: existingPost } = await supabase
    .from("posts")
    .select("notion_page_id, idea_id")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  // Check if Notion auto-create is on (for posts not yet linked)
  const { data: notionState } = await supabase
    .from("notion_sync_state")
    .select("auto_create_in_notion, is_connected")
    .eq("user_id", user.id)
    .maybeSingle();

  const shouldMarkPending =
    existingPost?.notion_page_id ||
    (notionState?.is_connected && notionState?.auto_create_in_notion);

  const updatePayload: Record<string, unknown> = {
    status: "published",
    published_at: new Date().toISOString(),
    linkedin_url: linkedinUrl || null,
    updated_at: new Date().toISOString(),
  };
  if (shouldMarkPending) {
    updatePayload.sync_status = "pending";
  }

  const { error } = await supabase
    .from("posts")
    .update(updatePayload)
    .eq("id", postId)
    .eq("user_id", user.id);

  if (error) throw error;

  // Also mark linked idea as published
  if (existingPost?.idea_id) {
    await supabase
      .from("ideas")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", existingPost.idea_id)
      .eq("user_id", user.id);
  }

  revalidatePath("/app/write");
}
