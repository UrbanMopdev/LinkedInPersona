"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  FileText,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConflictPost {
  id: string;
  content: string;
  status: string;
  notion_page_id: string;
  notion_last_seen_edit_time: string;
  updated_at: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function NotionConflicts() {
  const [conflicts, setConflicts] = useState<ConflictPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [selectedConflict, setSelectedConflict] =
    useState<ConflictPost | null>(null);
  const [mergedContent, setMergedContent] = useState("");
  const [message, setMessage] = useState("");

  const loadConflicts = useCallback(async () => {
    try {
      // Fetch posts with conflict status via the connect route's get_state
      // For now we'll fetch directly
      const res = await fetch("/api/notion/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_state" }),
      });
      const data = await res.json();

      if (data.conflictCount > 0) {
        // We need to get the actual conflict posts — use a separate fetch
        const postsRes = await fetch("/api/notion/conflicts", {
          method: "GET",
        });
        if (postsRes.ok) {
          const postsData = await postsRes.json();
          setConflicts(postsData.conflicts || []);
        }
      } else {
        setConflicts([]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  async function handleResolve(
    postId: string,
    resolution: "keep_notion" | "keep_app" | "merge"
  ) {
    setResolving(postId);
    setMessage("");
    try {
      const body: Record<string, string> = {
        action: "resolve_conflict",
        post_id: postId,
        resolution,
      };
      if (resolution === "merge") {
        body.merged_content = mergedContent;
      }

      const res = await fetch("/api/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage("Conflict resolved");
      setSelectedConflict(null);
      await loadConflicts();
    } catch (e) {
      setMessage(
        `Error: ${e instanceof Error ? e.message : "Resolution failed"}`
      );
    } finally {
      setResolving(null);
    }
  }

  if (loading) return null;
  if (conflicts.length === 0) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-h3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          Sync Conflicts
          <Badge variant="warning">{conflicts.length}</Badge>
        </CardTitle>
        <CardDescription>
          These posts were edited in both the app and Notion since the last sync.
          Choose which version to keep.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {message && (
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
              message.startsWith("Error")
                ? "bg-destructive/10 border border-destructive/20 text-destructive"
                : "bg-emerald-50 border border-emerald-200 text-emerald-800"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {message}
          </div>
        )}

        {selectedConflict ? (
          /* ---- Detail view ---- */
          <div className="space-y-4">
            <button
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedConflict(null)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to list
            </button>

            <div className="grid md:grid-cols-2 gap-4">
              {/* App version */}
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">App version</Badge>
                  <span className="text-xs text-muted-foreground">
                    Updated{" "}
                    {new Date(selectedConflict.updated_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {selectedConflict.content}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleResolve(selectedConflict.id, "keep_app")
                  }
                  disabled={!!resolving}
                >
                  {resolving === selectedConflict.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Keep App Version
                </Button>
              </div>

              {/* Notion version */}
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Notion version</Badge>
                  <span className="text-xs text-muted-foreground">
                    Edited{" "}
                    {selectedConflict.notion_last_seen_edit_time
                      ? new Date(
                          selectedConflict.notion_last_seen_edit_time
                        ).toLocaleString()
                      : "recently"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground italic">
                  The Notion version will be fetched when you choose to keep it.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleResolve(selectedConflict.id, "keep_notion")
                  }
                  disabled={!!resolving}
                >
                  {resolving === selectedConflict.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Keep Notion Version
                </Button>
              </div>
            </div>

            {/* Merge option */}
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Or merge manually</p>
              <Textarea
                className="min-h-[120px] text-sm"
                placeholder="Paste your merged version here..."
                value={mergedContent}
                onChange={(e) => setMergedContent(e.target.value)}
              />
              <Button
                size="sm"
                onClick={() => handleResolve(selectedConflict.id, "merge")}
                disabled={!mergedContent.trim() || !!resolving}
              >
                {resolving === selectedConflict.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : null}
                Save Merged Version
              </Button>
            </div>
          </div>
        ) : (
          /* ---- List view ---- */
          conflicts.map((post) => (
            <button
              key={post.id}
              className="w-full text-left rounded-lg border p-4 hover:bg-muted/50 transition-colors"
              onClick={() => {
                setSelectedConflict(post);
                setMergedContent(post.content);
              }}
            >
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-2">
                    {post.content.slice(0, 150)}
                    {post.content.length > 150 ? "..." : ""}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>
                      App: {new Date(post.updated_at).toLocaleDateString()}
                    </span>
                    {post.notion_last_seen_edit_time && (
                      <span>
                        Notion:{" "}
                        {new Date(
                          post.notion_last_seen_edit_time
                        ).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
