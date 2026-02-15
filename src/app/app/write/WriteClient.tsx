"use client";

import { useState, useEffect, useCallback } from "react";
import {
  saveIdea,
  getIdeas,
  deleteIdea,
  createPost,
  updatePostContent,
  getPosts,
  getPostVersions,
} from "./actions";
import { updatePostFields } from "../actions";
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
import { Separator } from "@/components/ui/separator";
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
  History,
  CalendarDays,
  Tag,
  StickyNote,
  ChevronDown,
  ChevronUp,
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
  title: string | null;
  content: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  pillar: string | null;
  tags: string[] | null;
  notes: string | null;
  linkedin_url: string | null;
  linkedin_post_id: string | null;
  notion_page_id: string | null;
  created_at: string;
  updated_at: string;
  ideas: { title: string } | null;
}

interface PostVersion {
  id: string;
  content: string;
  version_number: number;
  created_at: string;
}

const POST_TEMPLATES = [
  { label: "Hook + Story + CTA", body: "[Hook: Bold statement or question]\n\n[Story: 2-3 sentences about your experience]\n\n[Key takeaway or insight]\n\n[Call to action: question or prompt]\n\nWhat do you think?" },
  { label: "Listicle", body: "[Topic hook]\n\nHere are [X] things I learned about [topic]:\n\n1. [Point one]\n2. [Point two]\n3. [Point three]\n4. [Point four]\n5. [Point five]\n\nWhich one resonates most with you?" },
  { label: "Contrarian Take", body: "Unpopular opinion:\n\n[Your contrarian take]\n\nHere's why:\n\n[Reason 1]\n[Reason 2]\n[Reason 3]\n\nAgree or disagree?" },
  { label: "Personal Story", body: "[Time reference] ago, I [situation].\n\nEveryone told me [common advice].\n\nInstead, I [what you did differently].\n\nThe result?\n\n[Outcome]\n\n[Lesson learned]" },
];

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

  /* ---- planning fields ---- */
  const [postTitle, setPostTitle] = useState("");
  const [postStatus, setPostStatus] = useState("draft");
  const [postScheduledAt, setPostScheduledAt] = useState("");
  const [postPillar, setPostPillar] = useState("");
  const [postTags, setPostTags] = useState("");
  const [postNotes, setPostNotes] = useState("");
  const [postLinkedinUrl, setPostLinkedinUrl] = useState("");

  /* ---- version history ---- */
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  /* ---- active tab ---- */
  const [activeTab, setActiveTab] = useState("drafts");

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

  useEffect(() => {
    if (editingPostId) {
      getPostVersions(editingPostId).then((v) => setVersions(v as PostVersion[])).catch(() => {});
    } else {
      setVersions([]);
    }
  }, [editingPostId]);

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
      setPostTitle(idea.title);
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "Draft generation failed");
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
        const { version } = await updatePostContent(editingPostId, draftContent.trim());
        setDraftSuccess(`Saved as version ${version}`);
      } else {
        const post = await createPost(draftContent.trim(), editingIdeaId || undefined);
        setEditingPostId(post.id);
        setDraftSuccess("Draft saved");
      }
      await loadPosts();
    } catch (e: unknown) {
      setDraftError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handleSavePlanningFields() {
    if (!editingPostId) return;
    setDraftError("");
    try {
      await updatePostFields(editingPostId, {
        title: postTitle || undefined,
        status: postStatus,
        scheduled_at: postScheduledAt || null,
        pillar: postPillar || null,
        tags: postTags ? postTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        notes: postNotes || null,
        linkedin_url: postLinkedinUrl || null,
      });
      setDraftSuccess("Planning fields saved");
      setTimeout(() => setDraftSuccess(""), 2000);
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
    setPostTitle(post.title || "");
    setPostStatus(post.status);
    setPostScheduledAt(post.scheduled_at ? post.scheduled_at.slice(0, 10) : "");
    setPostPillar(post.pillar || "");
    setPostTags(post.tags?.join(", ") || "");
    setPostNotes(post.notes || "");
    setPostLinkedinUrl(post.linkedin_url || "");
    setDraftError("");
    setDraftSuccess("");
    setActiveTab("drafts");
  }

  function handleNewDraft() {
    setEditingPostId(null);
    setEditingIdeaId(null);
    setSelectedIdeaId("");
    setDraftContent("");
    setPostTitle("");
    setPostStatus("draft");
    setPostScheduledAt("");
    setPostPillar("");
    setPostTags("");
    setPostNotes("");
    setPostLinkedinUrl("");
    setDraftError("");
    setDraftSuccess("");
    setRewriteInstructions("");
    setVersions([]);
  }

  function handleUseTemplate(template: { label: string; body: string }) {
    setDraftContent(template.body);
    setPostTitle(template.label);
  }

  function handleRestoreVersion(v: PostVersion) {
    setDraftContent(v.content);
    setDraftSuccess(`Restored version ${v.version_number}`);
    setTimeout(() => setDraftSuccess(""), 2000);
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
                <Button onClick={handleGenerateIdeas} disabled={isGenerating || !topic.trim()}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isGenerating ? "Generating..." : "Generate"}
                </Button>
              </div>
            </CardContent>
          </Card>

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
                          <h4 className="font-semibold text-sm mb-1">{idea.title}</h4>
                          <p className="text-body-sm text-muted-foreground">{idea.body}</p>
                        </div>
                        <Button size="sm" onClick={() => handleSaveIdea(idea.title, idea.body)}>
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
                          <h4 className="font-semibold text-sm">{idea.title}</h4>
                          <Badge variant={idea.status === "published" ? "success" : "secondary"}>
                            {idea.status}
                          </Badge>
                        </div>
                        {idea.body && (
                          <p className="text-body-sm text-muted-foreground">{idea.body}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" onClick={() => handleBuildDraftFromIdea(idea)}>
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

          <div className="flex items-center justify-between mb-6">
            <h3 className="text-h3">
              {editingPostId ? "Editing Post" : "New Draft"}
            </h3>
            <div className="flex items-center gap-2">
              {(editingPostId || draftContent) && (
                <Button variant="outline" size="sm" onClick={handleNewDraft}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New Draft
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main editor column */}
            <div className="lg:col-span-2">
              {/* Idea selector */}
              <div className="flex gap-3 mb-4">
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
                <Button onClick={handleBuildDraft} disabled={isBuilding || !selectedIdeaId}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isBuilding ? "Building..." : "Build Draft"}
                </Button>
              </div>

              {/* Templates */}
              {!draftContent && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Or start from a template:</p>
                  <div className="flex flex-wrap gap-2">
                    {POST_TEMPLATES.map((t) => (
                      <Button
                        key={t.label}
                        variant="outline"
                        size="sm"
                        onClick={() => handleUseTemplate(t)}
                        className="text-xs"
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Title */}
              <div className="mb-3">
                <Input
                  placeholder="Post title (optional)..."
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="font-semibold"
                />
              </div>

              {/* Editor */}
              {isBuilding ? (
                <Skeleton className="h-[280px] w-full mb-4" />
              ) : (
                <div className="mb-4">
                  <Textarea
                    className="min-h-[280px]"
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
              <div className="flex items-center gap-3 mb-6">
                <Button onClick={handleSaveDraft} disabled={!draftContent.trim()}>
                  <Save className="h-4 w-4 mr-2" />
                  {editingPostId ? "Save New Version" : "Save Draft"}
                </Button>
                {editingPostId && (
                  <Button variant="outline" onClick={handleSavePlanningFields}>
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Save Fields
                  </Button>
                )}
              </div>

              {/* Rewrite tool */}
              <Card className="bg-muted/50 mb-6">
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
                      disabled={isRewriting || !draftContent.trim() || !rewriteInstructions.trim()}
                    >
                      {isRewriting ? "Rewriting..." : "Rewrite"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar: planning fields + version history */}
            <div className="space-y-4">
              {/* Planning fields */}
              <Card>
                <CardContent className="pt-6">
                  <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Planning
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Status</label>
                      <Select value={postStatus} onValueChange={setPostStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="published">Published</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Publish Date</label>
                      <Input
                        type="date"
                        value={postScheduledAt}
                        onChange={(e) => setPostScheduledAt(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Pillar</label>
                      <Input
                        placeholder="e.g. Thought Leadership, Educational..."
                        value={postPillar}
                        onChange={(e) => setPostPillar(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <Tag className="h-3 w-3" /> Tags
                      </label>
                      <Input
                        placeholder="Comma-separated tags..."
                        value={postTags}
                        onChange={(e) => setPostTags(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <StickyNote className="h-3 w-3" /> Notes
                      </label>
                      <Textarea
                        className="min-h-[60px]"
                        placeholder="Internal notes..."
                        value={postNotes}
                        onChange={(e) => setPostNotes(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">LinkedIn URL</label>
                      <Input
                        placeholder="https://linkedin.com/..."
                        value={postLinkedinUrl}
                        onChange={(e) => setPostLinkedinUrl(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Version history */}
              {versions.length > 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <button
                      className="flex items-center justify-between w-full text-sm font-semibold"
                      onClick={() => setShowVersions(!showVersions)}
                    >
                      <span className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Versions ({versions.length})
                      </span>
                      {showVersions ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                    {showVersions && (
                      <div className="mt-3 space-y-2">
                        {versions.map((v) => (
                          <div key={v.id} className="rounded-lg bg-muted/50 border p-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-semibold">v{v.version_number}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {new Date(v.created_at).toLocaleDateString()}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => handleRestoreVersion(v)}
                                >
                                  Restore
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {v.content.slice(0, 100)}...
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <Separator className="my-6" />

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
                  className={editingPostId === post.id ? "border-primary/40 shadow-sm" : ""}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {post.title && (
                          <p className="text-sm font-semibold mb-1">{post.title}</p>
                        )}
                        {post.ideas?.title && !post.title && (
                          <p className="text-xs text-muted-foreground mb-1">
                            From idea: {post.ideas.title}
                          </p>
                        )}
                        <p className="text-sm text-foreground line-clamp-2">
                          {post.content.slice(0, 150)}
                          {post.content.length > 150 ? "..." : ""}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {post.pillar && (
                            <Badge variant="outline" className="text-xs">{post.pillar}</Badge>
                          )}
                          {post.scheduled_at && (
                            <span className="text-xs text-muted-foreground">
                              Scheduled: {new Date(post.scheduled_at).toLocaleDateString()}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Updated {new Date(post.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleEditPost(post)}>
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
