import { NextRequest, NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  GET /api/cron/notion-sync                                          */
/*  Called by Vercel Cron — triggers incremental sync for all users     */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  // Verify the request comes from Vercel Cron
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Forward to the sync endpoint with cron auth
  const syncUrl = new URL("/api/notion/sync", req.url);
  const response = await fetch(syncUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify({ action: "cron_sync_all" }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
