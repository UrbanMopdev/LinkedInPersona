import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ------------------------------------------------------------------ */
/*  GET /api/notion/conflicts                                          */
/*  Returns posts with sync_status = 'conflict' for the current user   */
/* ------------------------------------------------------------------ */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: conflicts, error } = await supabase
    .from("posts")
    .select(
      "id, content, status, notion_page_id, notion_last_seen_edit_time, updated_at, created_at"
    )
    .eq("user_id", user.id)
    .eq("sync_status", "conflict")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conflicts: conflicts || [] });
}
