"use client";

import { useState, useEffect, useCallback } from "react";
import { getIdeasAll, updateIdeaStatus, convertIdeaToPost } from "../actions";
import { saveIdea, deleteIdea } from "../write/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Sparkles,
  Save,
  Trash2,
  PenLine,
  Lightbulb,
  Star,
  Archive,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

interface Idea {
  id: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function IdeasClient() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState("");
  const [generatedIdeas, setGeneratedIdeas] = useState<{ title: string; body: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const loadIdeas = useCallback(async () => {
    try {
      const data = await getIdeasAll();
      setIdeas(data as Idea[]);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  async function handleGenerate() {
    if (!topic.trim()) return;
    setError("");
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
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave(title: string, body: string) {
    try {
      await saveIdea(title, body);
      setGeneratedIdeas((prev) => prev.filter((i) => i.title !== title));
      setSuccess("Idea saved!");
      setTimeout(() => setSuccess(""), 2000);
      await loadIdeas();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteIdea(id);
      await loadIdeas();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleShortlist(id: string) {
    try {
      await updateIdeaStatus(id, "ready");
      setSuccess("Idea shortlisted!");
      setTimeout(() => setSuccess(""), 2000);
      await loadIdeas();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function handleArchive(id: string) {
    try {
      await updateIdeaStatus(id, "archived");
      await loadIdeas();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function handleConvertToPost(id: string) {
    try {
      await convertIdeaToPost(id);
      setSuccess("Idea converted to draft! Head to Write to build it out.");
      setTimeout(() => setSuccess(""), 3000);
      await loadIdeas();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Conversion failed");
    }
  }

  const draftIdeas = ideas.filter((i) => i.status === "draft");
  const readyIdeas = ideas.filter((i) => i.status === "ready");
  const archivedIdeas = ideas.filter((i) => i.status === "archived");

  const filteredIdeas =
    activeTab === "shortlisted"
      ? readyIdeas
      : activeTab === "archived"
        ? archivedIdeas
        : draftIdeas;

  return (
    <div className="mx-auto max-w-container px-6 py-8">
      <PageHeader
        title="Ideas"
        description="Brainstorm, save, and shortlist ideas for your LinkedIn posts."
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 mb-6">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Generate section */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Ideas
          </h3>
          <div className="flex gap-3">
            <Input
              className="flex-1"
              placeholder="Enter a topic (e.g. AI in recruiting, leadership lessons)..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            />
            <Button onClick={handleGenerate} disabled={isGenerating || !topic.trim()}>
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
                      <h4 className="font-semibold text-sm mb-1">{idea.title}</h4>
                      <p className="text-body-sm text-muted-foreground">{idea.body}</p>
                    </div>
                    <Button size="sm" onClick={() => handleSave(idea.title, idea.body)}>
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

      {/* Saved ideas with tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="all" className="gap-2">
              <Lightbulb className="h-4 w-4" />
              All ({draftIdeas.length})
            </TabsTrigger>
            <TabsTrigger value="shortlisted" className="gap-2">
              <Star className="h-4 w-4" />
              Shortlisted ({readyIdeas.length})
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-2">
              <Archive className="h-4 w-4" />
              Archived ({archivedIdeas.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={activeTab}>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredIdeas.length === 0 ? (
            <EmptyState
              icon={Lightbulb}
              title={
                activeTab === "shortlisted"
                  ? "No shortlisted ideas"
                  : activeTab === "archived"
                    ? "No archived ideas"
                    : "No ideas yet"
              }
              description={
                activeTab === "shortlisted"
                  ? "Star your best ideas to shortlist them for drafting."
                  : activeTab === "archived"
                    ? "Archived ideas will appear here."
                    : "Generate some ideas above or they'll appear here when saved."
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredIdeas.map((idea) => (
                <Card key={idea.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm">{idea.title}</h4>
                          <Badge
                            variant={
                              idea.status === "ready"
                                ? "success"
                                : idea.status === "published"
                                  ? "success"
                                  : "secondary"
                            }
                          >
                            {idea.status}
                          </Badge>
                        </div>
                        {idea.body && (
                          <p className="text-body-sm text-muted-foreground">{idea.body}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(idea.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {idea.status === "draft" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleShortlist(idea.id)}
                            title="Shortlist"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(idea.status === "draft" || idea.status === "ready") && (
                          <Button
                            size="sm"
                            onClick={() => handleConvertToPost(idea.id)}
                            title="Convert to draft post"
                          >
                            <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                            Draft
                          </Button>
                        )}
                        {idea.status !== "archived" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleArchive(idea.id)}
                            title="Archive"
                            className="text-muted-foreground"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(idea.id)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete"
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
      </Tabs>
    </div>
  );
}
