"use client";

import { useState, useEffect, useCallback } from "react";
import {
  saveIdea,
  getIdeas,
  deleteIdea,
  createPost,
  updatePostContent,
  getPosts,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Sparkles,
  Save,
  Trash2,
  PenLine,
  Lightbulb,
  FileEdit,
  RefreshCw,
  Plus,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Idea {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  updated_at: string;
  ideas: { title: string } | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WriteClient() {
  /* ---- ideas tab state ---- */
  const [topic, setTopic] = useState("");
  const [generatedIdeas, setGeneratedIdeas] = useState<
    { title: string; body: string }[]
  >([]);
  const [savedIdeas, setSavedIdeas] = useState<Idea[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ideaError, setIdeaError] = useState("");
  const [ideasLoading, setIdeasLoading] = useState(true);

  /* ---- drafts tab state ---- */
  const [selectedIdeaId, setSelectedIdeaId] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteInstructions, setRewriteInstructions] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftSuccess, setDraftSuccess] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);

  /* ---- active tab ---- */
  const [activeTab, setActiveTab] = useState("ideas");

  /* ================================================================ */
  /*  Data loading                                                     */
  /* ================================================================ */

  const loadIdeas = useCallback(async () => {
    try {
      const data = await getIdeas();
      setSavedIdeas(data as Idea[]);
    } catch {
      /* ignore */
    } finally {
      setIdeasLoading(false);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      const data = await getPosts();
      setPosts(data as Post[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadIdeas();
    loadPosts();
  }, [loadIdeas, loadPosts]);

  /* ================================================================ */
  /*  Ideas tab handlers                                               */
  /* ================================================================ */

  async function handleGenerateIdeas() {
    if (!topic.trim()) return;
    setIdeaError("");
    setIsGenerating(true);
    setGeneratedIdeas([]);
    try {
      const res = await fetch("/api/ai/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setGeneratedIdeas(data.ideas);
    } catch (e: unknown) {
      setIdeaError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveIdea(title: string, body: string) {
    try {
      await saveIdea(title, body);
      await loadIdeas();
      setGeneratedIdeas((prev) => prev.filter((i) => i.title !== title));
    } catch (e: unknown) {
      setIdeaError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handleDeleteIdea(id: string) {
    try {
      await deleteIdea(id);
      await loadIdeas();
    } catch (e: unknown) {
      setIdeaError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function handleBuildDraftFromIdea(idea: Idea) {
    setSelectedIdeaId(idea.id);
    setEditingPostId(null);
    setEditingIdeaId(idea.id);
    setDraftContent("");
    setDraftSuccess("");
    setDraftError("");
    setActiveTab("drafts");
  }

  /* ================================================================ */
  /*  Drafts tab handlers                                              */
  /* ================================================================ */

  async function handleBuildDraft() {
    const idea = savedIdeas.find((i) => i.id === selectedIdeaId);
    if (!idea) {
      setDraftError("Select an idea first");
      return;
    }
    setDraftError("");
    setDraftSuccess("");
    setIsBuilding(true);
    try {
      const res = await fetch("/api/ai/build-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaTitle: idea.title, ideaBody: idea.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft generation failed");
      setDraftContent(data.content);
      setEditingIdeaId(idea.id);
    } catch (e: unknown) {
      setDraftError(
        e instanceof Error ? e.message : "Draft generation failed"
      );
    } finally {
      setIsBuilding(false);
    }
  }

  async function handleRewrite() {
    if (!draftContent.trim()) {
      setDraftError("Write or generate a draft first");
      return;
    }
    if (!rewriteInstructions.trim()) {
      setDraftError("Enter rewrite instructions");
      return;
    }
    setDraftError("");
    setDraftSuccess("");
    setIsRewriting(true);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: draftContent,
          instructions: rewriteInstructions.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rewrite failed");
      setDraftContent(data.content);
      setRewriteInstructions("");
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setIsRewriting(false);
    }
  }

  async function handleSaveDraft() {
    if (!draftContent.trim()) {
      setDraftError("Draft is empty");
      return;
    }
    setDraftError("");
    setDraftSuccess("");
    try {
      if (editingPostId) {
        const { version } = await updatePostContent(
          editingPostId,
          draftContent.trim()
        );
        setDraftSuccess(`Saved as version ${version}`);
      } else {
        const post = await createPost(
          draftContent.trim(),
          editingIdeaId || undefined
        );
        setEditingPostId(post.id);
        setDraftSuccess("Draft saved");
      }
      await loadPosts();
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "Save failed");
    }
  }

  function handleEditPost(post: Post) {
    setEditingPostId(post.id);
    setEditingIdeaId(post.idea_id);
    setSelectedIdeaId(post.idea_id || "");
    setDraftContent(post.content);
    setDraftError("");
    setDraftSuccess("");
    setActiveTab("drafts");
  }

  function handleNewDraft() {
    setEditingPostId(null);
    setEditingIdeaId(null);
    setSelectedIdeaId("");
    setDraftContent("");
    setDraftError("");
    setDraftSuccess("");
    setRewriteInstructions("");
  }

  /* ================================================================ */
  /*  Character count helper                                           */
  /* ================================================================ */

  const charCount = draftContent.length;
  const charColor =
    charCount > 1300
      ? "text-destructive"
      : charCount > 1100
        ? "text-amber-600"
        : "text-muted-foreground";

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  const draftPosts = posts.filter((p) => p.status === "draft");

  return (
    <div className="mx-auto max-w-container px-6 py-8">
      <PageHeader
        title="Write"
        description="Generate ideas, build drafts, and polish your LinkedIn posts."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="ideas" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Ideas
          </TabsTrigger>
          <TabsTrigger value="drafts" className="gap-2">
            <FileEdit className="h-4 w-4" />
            Draft Builder
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/*  IDEAS TAB                                                    */}
        {/* ============================================================ */}
        <TabsContent value="ideas">
          {ideaError && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {ideaError}
            </div>
          )}

          {/* Generate input */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Input
                  className="flex-1"
                  placeholder="Enter a topic (e.g. AI in recruiting, leadership lessons)..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGenerateIdeas()}
                />
                <Button
                  onClick={handleGenerateIdeas}
                  disabled={isGenerating || !topic.trim()}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isGenerating ? "Generating..." : "Generate"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Generated ideas */}
          {isGenerating && (
            <div className="space-y-3 mb-8">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {generatedIdeas.length > 0 && (
            <div className="mb-8">
              <h3 className="text-h3 mb-4">Generated Ideas</h3>
              <div className="space-y-3">
                {generatedIdeas.map((idea, i) => (
                  <Card key={i} className="animate-fade-in">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm mb-1">
                            {idea.title}
                          </h4>
                          <p className="text-body-sm text-muted-foreground">
                            {idea.body}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleSaveIdea(idea.title, idea.body)}
                        >
                          <Save className="h-3.5 w-3.5 mr-1.5" />
                          Save
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Saved ideas */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-h3">
              Saved Ideas
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({savedIdeas.length})
              </span>
            </h3>
          </div>

          {ideasLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : savedIdeas.length === 0 ? (
            <EmptyState
              icon={Lightbulb}
              title="No ideas yet"
              description="Generate some ideas above or they'll appear here when you save them."
            />
          ) : (
            <div className="space-y-3">
              {savedIdeas.map((idea) => (
                <Card key={idea.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm">
                            {idea.title}
                          </h4>
                          <Badge
                            variant={
                              idea.status === "published"
                                ? "success"
                                : "secondary"
                            }
                          >
                            {idea.status}
                          </Badge>
                        </div>
                        {idea.body && (
                          <p className="text-body-sm text-muted-foreground">
                            {idea.body}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleBuildDraftFromIdea(idea)}
                        >
                          <PenLine className="h-3.5 w-3.5 mr-1.5" />
                          Draft
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteIdea(idea.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/*  DRAFTS TAB                                                   */}
        {/* ============================================================ */}
        <TabsContent value="drafts">
          {draftError && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {draftError}
            </div>
          )}
          {draftSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 mb-6">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {draftSuccess}
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-h3">
              {editingPostId ? "Editing Post" : "New Draft"}
            </h3>
            {(editingPostId || draftContent) && (
              <Button variant="outline" size="sm" onClick={handleNewDraft}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Draft
              </Button>
            )}
          </div>

          {/* Idea selector */}
          <div className="flex gap-3 mb-6">
            <Select value={selectedIdeaId} onValueChange={setSelectedIdeaId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a saved idea..." />
              </SelectTrigger>
              <SelectContent>
                {savedIdeas.map((idea) => (
                  <SelectItem key={idea.id} value={idea.id}>
                    {idea.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleBuildDraft}
              disabled={isBuilding || !selectedIdeaId}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isBuilding ? "Building..." : "Build Draft"}
            </Button>
          </div>

          {/* Editor */}
          {isBuilding ? (
            <Skeleton className="h-[240px] w-full mb-4" />
          ) : (
            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">
                Draft Content
              </label>
              <Textarea
                className="min-h-[240px]"
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="Write your LinkedIn post here, or generate one from an idea above..."
              />
              <div className={`text-right text-xs mt-1.5 ${charColor}`}>
                {charCount} / 1,300 characters
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mb-8">
            <Button onClick={handleSaveDraft} disabled={!draftContent.trim()}>
              <Save className="h-4 w-4 mr-2" />
              {editingPostId ? "Save New Version" : "Save Draft"}
            </Button>
          </div>

          {/* Rewrite tool */}
          <Card className="bg-muted/50 mb-8">
            <CardContent className="pt-6">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Rewrite Tool
              </h4>
              <div className="flex gap-3">
                <Input
                  className="flex-1"
                  placeholder="Rewrite instructions (e.g. make it more casual, add a CTA)..."
                  value={rewriteInstructions}
                  onChange={(e) => setRewriteInstructions(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRewrite()}
                />
                <Button
                  variant="outline"
                  onClick={handleRewrite}
                  disabled={
                    isRewriting ||
                    !draftContent.trim() ||
                    !rewriteInstructions.trim()
                  }
                >
                  {isRewriting ? "Rewriting..." : "Rewrite"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Existing drafts */}
          <h3 className="text-h3 mb-4">Existing Drafts</h3>
          {draftPosts.length === 0 ? (
            <EmptyState
              icon={FileEdit}
              title="No drafts yet"
              description="Build a draft from an idea above, or write one from scratch."
            />
          ) : (
            <div className="space-y-3">
              {draftPosts.map((post) => (
                <Card
                  key={post.id}
                  className={
                    editingPostId === post.id
                      ? "border-primary/40 shadow-sm"
                      : ""
                  }
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {post.ideas?.title && (
                          <p className="text-xs text-muted-foreground mb-1">
                            From idea: {post.ideas.title}
                          </p>
                        )}
                        <p className="text-sm text-foreground line-clamp-2">
                          {post.content.slice(0, 150)}
                          {post.content.length > 150 ? "..." : ""}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Updated{" "}
                          {new Date(post.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditPost(post)}
                      >
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
