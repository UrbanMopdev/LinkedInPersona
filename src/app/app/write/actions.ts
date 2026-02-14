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

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      content,
      idea_id: ideaId || null,
      status: "draft",
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

  const { error: postError } = await supabase
    .from("posts")
    .update({ content, updated_at: new Date().toISOString() })
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

export async function markAsPosted(postId: string, linkedinUrl?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("posts")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      linkedin_url: linkedinUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .eq("user_id", user.id);

  if (error) throw error;

  // Also mark linked idea as published
  const { data: post } = await supabase
    .from("posts")
    .select("idea_id")
    .eq("id", postId)
    .single();

  if (post?.idea_id) {
    await supabase
      .from("ideas")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", post.idea_id)
      .eq("user_id", user.id);
  }

  revalidatePath("/app/write");
}
