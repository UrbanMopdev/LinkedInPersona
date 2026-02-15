import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/embeddings";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { content, postedAt, linkedinUrl } = await req.json();
  if (!content || typeof content !== "string") {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  try {
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(content);
    } catch {
      // If Voyage AI is not configured, store without embedding
    }

    const { data, error } = await supabase
      .from("linkedin_posts_archive")
      .insert({
        user_id: user.id,
        content,
        posted_at: postedAt || null,
        linkedin_url: linkedinUrl || null,
        embedding: embedding ? JSON.stringify(embedding) : null,
      })
      .select("id, content, posted_at, linkedin_url, created_at")
      .single();

    if (error) throw error;
    return Response.json({ post: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to archive post";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const { data, error } = await supabase
    .from("linkedin_posts_archive")
    .select("id, content, posted_at, linkedin_url, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ posts: data });
}
