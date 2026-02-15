"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getPosts,
  getPostVersions,
  markAsPosted,
} from "../write/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  PenLine,
  Clock,
  RefreshCw,
  AlertTriangle,
  Database,
  Loader2,
} from "lucide-react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Post {
  id: string;
  user_id: string;
  idea_id: string | null;
  content: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  linkedin_post_id: string | null;
  linkedin_url: string | null;
  notion_page_id: string | null;
  sync_status: string | null;
  source_of_truth: string | null;
  notion_last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  ideas: { title: string } | null;
}

interface PostVersion {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  version_number: number;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PostsClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVersions, setExpandedVersions] = useState<string | null>(null);
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [linkedinUrls, setLinkedinUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      const data = await getPosts();
      setPosts(data as Post[]);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  async function handleToggleVersions(postId: string) {
    if (expandedVersions === postId) {
      setExpandedVersions(null);
      setVersions([]);
      return;
    }
    try {
      const data = await getPostVersions(postId);
      setVersions(data as PostVersion[]);
      setExpandedVersions(postId);
    } catch {
      /* ignore */
    }
  }

  async function handleMarkPosted(postId: string) {
    setMessage(null);
    try {
      await markAsPosted(postId, linkedinUrls[postId] || undefined);
      setMessage({ type: "success", text: "Post marked as published" });
      await loadPosts();
    } catch (e: unknown) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Failed",
      });
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "published":
        return "success" as const;
      case "scheduled":
        return "warning" as const;
      default:
        return "secondary" as const;
    }
  };

  const draftPosts = posts.filter((p) => p.status === "draft");
  const publishedPosts = posts.filter((p) => p.status === "published");

  return (
    <div className="mx-auto max-w-container px-6 py-8">
      <PageHeader
        title="Posts"
        description="Manage your drafts and published LinkedIn posts."
      >
        <Link href="/app/write">
          <Button>
            <PenLine className="h-4 w-4 mr-2" />
            New Post
          </Button>
        </Link>
      </PageHeader>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm mb-6 ${
            message.type === "error"
              ? "bg-destructive/10 border border-destructive/20 text-destructive"
              : "bg-emerald-50 border border-emerald-200 text-emerald-800"
          }`}
        >
          {message.type === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No posts yet"
          description="Create a draft in the Write section to get started."
          action={{
            label: "Go to Write",
            onClick: () => (window.location.href = "/app/write"),
          }}
        />
      ) : (
        <div className="space-y-8">
          {/* Drafts section */}
          {draftPosts.length > 0 && (
            <section>
              <h2 className="text-h3 mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                Drafts
                <span className="text-sm font-normal text-muted-foreground">
                  ({draftPosts.length})
                </span>
              </h2>
              <div className="space-y-3">
                {draftPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    statusBadge={statusBadge}
                    expandedVersions={expandedVersions}
                    versions={versions}
                    linkedinUrls={linkedinUrls}
                    onToggleVersions={handleToggleVersions}
                    onLinkedinUrlChange={(id, url) =>
                      setLinkedinUrls((prev) => ({ ...prev, [id]: url }))
                    }
                    onMarkPosted={handleMarkPosted}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Published section */}
          {publishedPosts.length > 0 && (
            <section>
              <h2 className="text-h3 mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Published
                <span className="text-sm font-normal text-muted-foreground">
                  ({publishedPosts.length})
                </span>
              </h2>
              <div className="space-y-3">
                {publishedPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    statusBadge={statusBadge}
                    expandedVersions={expandedVersions}
                    versions={versions}
                    linkedinUrls={linkedinUrls}
                    onToggleVersions={handleToggleVersions}
                    onLinkedinUrlChange={(id, url) =>
                      setLinkedinUrls((prev) => ({ ...prev, [id]: url }))
                    }
                    onMarkPosted={handleMarkPosted}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Post Card subcomponent                                             */
/* ------------------------------------------------------------------ */

function PostCard({
  post,
  statusBadge,
  expandedVersions,
  versions,
  linkedinUrls,
  onToggleVersions,
  onLinkedinUrlChange,
  onMarkPosted,
}: {
  post: Post;
  statusBadge: (status: string) => "success" | "warning" | "secondary";
  expandedVersions: string | null;
  versions: PostVersion[];
  linkedinUrls: Record<string, string>;
  onToggleVersions: (id: string) => void;
  onLinkedinUrlChange: (id: string, url: string) => void;
  onMarkPosted: (id: string) => void;
}) {
  const isExpanded = expandedVersions === post.id;
  const [pushing, setPushing] = useState(false);

  async function handlePushToNotion() {
    setPushing(true);
    try {
      const res = await fetch("/api/notion/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: post.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      window.location.reload();
    } catch {
      // ignore — user can retry
    } finally {
      setPushing(false);
    }
  }

  const syncBadgeVariant = (syncStatus: string | null) => {
    switch (syncStatus) {
      case "conflict":
        return "warning" as const;
      case "error":
        return "destructive" as const;
      case "pending":
        return "secondary" as const;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant={statusBadge(post.status)}>{post.status}</Badge>
              {post.notion_page_id && (
                <Badge variant="outline" className="gap-1">
                  <Database className="h-3 w-3" />
                  Notion
                </Badge>
              )}
              {post.sync_status && syncBadgeVariant(post.sync_status) && (
                <Badge variant={syncBadgeVariant(post.sync_status)!}>
                  {post.sync_status === "conflict" && (
                    <AlertTriangle className="h-3 w-3 mr-1" />
                  )}
                  {post.sync_status}
                </Badge>
              )}
              {post.ideas?.title && (
                <span className="text-xs text-muted-foreground">
                  From: {post.ideas.title}
                </span>
              )}
            </div>
            {post.published_at && (
              <p className="text-xs text-muted-foreground">
                Published {new Date(post.published_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {post.status === "draft" && (
              <Link href="/app/write">
                <Button size="sm" variant="outline">
                  Edit
                </Button>
              </Link>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onToggleVersions(post.id)}
              className="text-muted-foreground"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Content preview */}
        <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3 mb-3">
          {post.content.slice(0, 200)}
          {post.content.length > 200 ? "..." : ""}
        </p>

        {/* LinkedIn URL */}
        {post.linkedin_url && (
          <a
            href={post.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mb-3"
          >
            <ExternalLink className="h-3 w-3" />
            View on LinkedIn
          </a>
        )}

        {/* Mark as posted */}
        {post.status !== "published" && (
          <>
            <Separator className="my-3" />
            <div className="flex gap-3 items-center">
              <Input
                className="flex-1 h-8 text-sm"
                placeholder="LinkedIn post URL (optional)"
                value={linkedinUrls[post.id] || ""}
                onChange={(e) => onLinkedinUrlChange(post.id, e.target.value)}
              />
              <Button size="sm" onClick={() => onMarkPosted(post.id)}>
                Mark as Posted
              </Button>
            </div>
          </>
        )}

        {/* Notion sync info */}
        {post.notion_page_id && post.notion_last_synced_at && (
          <p className="text-xs text-muted-foreground mb-2">
            <Database className="h-3 w-3 inline mr-1" />
            Last synced {new Date(post.notion_last_synced_at).toLocaleString()}
            {post.source_of_truth && post.source_of_truth !== "app" && (
              <span className="ml-2">
                Source: {post.source_of_truth}
              </span>
            )}
          </p>
        )}

        {/* Push to Notion button */}
        {!post.notion_page_id && post.sync_status !== "synced" && (
          <Button
            size="sm"
            variant="outline"
            className="mb-3"
            onClick={handlePushToNotion}
            disabled={pushing}
          >
            {pushing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Push to Notion
          </Button>
        )}

        {/* Version history */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-semibold mb-3">Version History</h4>
            {versions.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">
                No versions found.
              </p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-lg bg-muted/50 border p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">
                        Version {v.version_number}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-body-sm text-muted-foreground whitespace-pre-wrap">
                      {v.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
