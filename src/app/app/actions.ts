"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/* ------------------------------------------------------------------ */
/*  Auth helper                                                        */
/* ------------------------------------------------------------------ */

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/* ------------------------------------------------------------------ */
/*  Ideas CRUD (dedicated page)                                        */
/* ------------------------------------------------------------------ */

export async function getIdeasAll() {
  const { supabase, user } = await getUser();
  const { data, error } = await supabase
    .from("ideas")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateIdeaStatus(id: string, status: string) {
  const { supabase, user } = await getUser();
  const { error } = await supabase
    .from("ideas")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  revalidatePath("/app/ideas");
}

export async function convertIdeaToPost(ideaId: string) {
  const { supabase, user } = await getUser();

  const { data: idea, error: ideaErr } = await supabase
    .from("ideas")
    .select("*")
    .eq("id", ideaId)
    .eq("user_id", user.id)
    .single();
  if (ideaErr || !idea) throw new Error("Idea not found");

  const content = idea.body || idea.title;
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      title: idea.title,
      content,
      idea_id: ideaId,
      status: "draft",
    })
    .select()
    .single();
  if (postErr) throw postErr;

  await supabase.from("post_versions").insert({
    post_id: post.id,
    user_id: user.id,
    content,
    version_number: 1,
  });

  await supabase
    .from("ideas")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", ideaId)
    .eq("user_id", user.id);

  revalidatePath("/app/ideas");
  revalidatePath("/app/write");
  return post;
}

/* ------------------------------------------------------------------ */
/*  Post planning fields                                               */
/* ------------------------------------------------------------------ */

export async function updatePostFields(
  postId: string,
  fields: {
    title?: string;
    status?: string;
    scheduled_at?: string | null;
    pillar?: string | null;
    platform?: string | null;
    post_type?: string | null;
    target_icp?: string | null;
    tags?: string[];
    notes?: string | null;
    linkedin_url?: string | null;
  }
) {
  const { supabase, user } = await getUser();

  const { data: existing } = await supabase
    .from("posts")
    .select("notion_page_id")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  const payload: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };

  if (fields.status === "scheduled" && fields.scheduled_at) {
    payload.scheduled_at = fields.scheduled_at;
  }
  if (fields.status === "published" && !fields.scheduled_at) {
    payload.published_at = new Date().toISOString();
  }

  if (existing?.notion_page_id) {
    payload.sync_status = "pending";
  }

  const { error } = await supabase
    .from("posts")
    .update(payload)
    .eq("id", postId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/app/write");
  revalidatePath("/app/posts");
  revalidatePath("/app/calendar");
}

/* ------------------------------------------------------------------ */
/*  Calendar: reschedule post                                          */
/* ------------------------------------------------------------------ */

export async function reschedulePost(
  postId: string,
  newDate: string
) {
  const { supabase, user } = await getUser();

  const { data: existing } = await supabase
    .from("posts")
    .select("notion_page_id")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  const payload: Record<string, unknown> = {
    scheduled_at: newDate,
    status: "scheduled",
    updated_at: new Date().toISOString(),
  };
  if (existing?.notion_page_id) {
    payload.sync_status = "pending";
  }

  const { error } = await supabase
    .from("posts")
    .update(payload)
    .eq("id", postId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/app/calendar");
  revalidatePath("/app/posts");
}

export async function getCalendarPosts() {
  const { supabase, user } = await getUser();
  const { data, error } = await supabase
    .from("posts")
    .select("id, title, content, status, scheduled_at, published_at, pillar, platform, post_type, target_icp, tags, notes, linkedin_url, notion_page_id")
    .eq("user_id", user.id)
    .in("status", ["scheduled", "published", "draft"])
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------------ */
/*  Analytics CRUD                                                     */
/* ------------------------------------------------------------------ */

export async function upsertAnalytics(
  postId: string,
  metrics: { impressions: number; likes: number; comments: number }
) {
  const { supabase, user } = await getUser();

  // Check if analytics row already exists for this post
  const { data: existing } = await supabase
    .from("post_analytics")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("post_analytics")
      .update({
        impressions: metrics.impressions,
        likes: metrics.likes,
        comments: metrics.comments,
        fetched_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("post_analytics").insert({
      post_id: postId,
      user_id: user.id,
      impressions: metrics.impressions,
      likes: metrics.likes,
      comments: metrics.comments,
    });
    if (error) throw error;
  }

  // If post has notion_page_id, mark as pending to sync metrics
  const { data: post } = await supabase
    .from("posts")
    .select("notion_page_id")
    .eq("id", postId)
    .eq("user_id", user.id)
    .single();

  if (post?.notion_page_id) {
    await supabase
      .from("posts")
      .update({ sync_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", postId);
  }

  revalidatePath("/app/posts");
}

export async function getPostAnalytics(postId: string) {
  const { supabase, user } = await getUser();
  const { data, error } = await supabase
    .from("post_analytics")
    .select("*")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------------ */
/*  Weekly Reports                                                     */
/* ------------------------------------------------------------------ */

export async function getWeeklyReports() {
  const { supabase, user } = await getUser();
  const { data, error } = await supabase
    .from("weekly_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("week_start", { ascending: false })
    .limit(12);
  if (error) throw error;
  return data;
}

export async function generateWeeklyReport(weekStart: string, weekEnd: string) {
  const { supabase, user } = await getUser();

  // Get published posts in this week
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, content, published_at, pillar")
    .eq("user_id", user.id)
    .eq("status", "published")
    .gte("published_at", weekStart)
    .lte("published_at", weekEnd + "T23:59:59Z");

  // Get analytics for those posts
  let totalImpressions = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;

  if (posts && posts.length > 0) {
    const postIds = posts.map((p) => p.id);
    const { data: analytics } = await supabase
      .from("post_analytics")
      .select("impressions, likes, comments, shares")
      .eq("user_id", user.id)
      .in("post_id", postIds);

    if (analytics) {
      for (const a of analytics) {
        totalImpressions += a.impressions || 0;
        totalLikes += a.likes || 0;
        totalComments += a.comments || 0;
        totalShares += a.shares || 0;
      }
    }
  }

  // Generate AI summary
  let summary = `Week of ${weekStart}: ${posts?.length || 0} posts published.`;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/ai/weekly-report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts: posts || [],
          metrics: { totalImpressions, totalLikes, totalComments, totalShares },
          weekStart,
          weekEnd,
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      summary = data.summary;
    }
  } catch {
    // Use basic summary if AI fails
  }

  // Upsert the report
  const { data: existing } = await supabase
    .from("weekly_reports")
    .select("id")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("weekly_reports")
      .update({
        week_end: weekEnd,
        total_impressions: totalImpressions,
        total_likes: totalLikes,
        total_comments: totalComments,
        total_shares: totalShares,
        posts_published: posts?.length || 0,
        summary,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("weekly_reports").insert({
      user_id: user.id,
      week_start: weekStart,
      week_end: weekEnd,
      total_impressions: totalImpressions,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_shares: totalShares,
      posts_published: posts?.length || 0,
      summary,
    });
    if (error) throw error;
  }

  revalidatePath("/app/reports");
  return { postsPublished: posts?.length || 0, totalImpressions, totalLikes, totalComments };
}
