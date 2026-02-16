"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Lightbulb,
  Search,
  Layers,
  Tag,
  Sparkles,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Theme {
  id: string;
  name: string;
  description: string | null;
  pillar: string | null;
  confidence: number;
  artifact_count: number;
  meeting_count: number;
  sample_artifacts: Array<{ type: string; content: string }>;
}

interface Artifact {
  id: string;
  meeting_id: string;
  type: string;
  content: string;
  context: string | null;
  theme: string | null;
  pillar: string | null;
  confidence: number;
  meeting_title?: string;
  meeting_start_time?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InsightsClient() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("themes");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pillarFilter, setPillarFilter] = useState("all");

  const loadData = useCallback(async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const [{ data: themesData }, { data: artifactsData }] = await Promise.all(
        [
          supabase
            .from("themes")
            .select("*")
            .order("artifact_count", { ascending: false }),
          supabase
            .from("meeting_artifacts")
            .select(
              "id, meeting_id, type, content, context, theme, pillar, confidence, meetings(title, start_time)"
            )
            .order("created_at", { ascending: false })
            .limit(200),
        ]
      );

      setThemes((themesData as Theme[]) || []);

      // Flatten the joined meeting data
      const flatArtifacts = ((artifactsData as unknown[]) || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => ({
          ...a,
          meeting_title: a.meetings?.title || "",
          meeting_start_time: a.meetings?.start_time || "",
          meetings: undefined,
        })
      );
      setArtifacts(flatArtifacts);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived data
  const allTypes = [
    ...new Set(artifacts.map((a) => a.type).filter(Boolean)),
  ];
  const allPillars = [
    ...new Set(
      [...themes.map((t) => t.pillar), ...artifacts.map((a) => a.pillar)]
        .filter(Boolean) as string[]
    ),
  ];

  const filteredArtifacts = artifacts.filter((a) => {
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    if (pillarFilter !== "all" && a.pillar !== pillarFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.content.toLowerCase().includes(q) ||
        (a.theme && a.theme.toLowerCase().includes(q)) ||
        (a.context && a.context.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const filteredThemes = search
    ? themes.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          (t.description &&
            t.description.toLowerCase().includes(search.toLowerCase()))
      )
    : themes;

  const TYPE_COLORS: Record<string, string> = {
    decision: "bg-blue-100 text-blue-800",
    insight: "bg-purple-100 text-purple-800",
    story_moment: "bg-amber-100 text-amber-800",
    metric: "bg-green-100 text-green-800",
    tension_tradeoff: "bg-red-100 text-red-800",
    quote: "bg-indigo-100 text-indigo-800",
    action_item: "bg-cyan-100 text-cyan-800",
    lesson: "bg-orange-100 text-orange-800",
    framework: "bg-pink-100 text-pink-800",
  };

  return (
    <div className="mx-auto max-w-container px-6 py-8">
      <PageHeader
        title="Insights"
        description="Explore themes and artifacts extracted from your meetings."
      />

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search insights..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="themes" className="gap-2">
            <Layers className="h-4 w-4" />
            Themes ({themes.length})
          </TabsTrigger>
          <TabsTrigger value="artifacts" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Artifacts ({artifacts.length})
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/*  THEMES TAB                                                   */}
        {/* ============================================================ */}
        <TabsContent value="themes">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : filteredThemes.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No themes yet"
              description="Import meetings and run the processing pipeline to generate themes."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredThemes.map((theme) => (
                <Card key={theme.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-semibold text-sm">{theme.name}</h4>
                      {theme.pillar && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {theme.pillar}
                        </Badge>
                      )}
                    </div>
                    {theme.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {theme.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                      <span>{theme.artifact_count} artifacts</span>
                      <span>{theme.meeting_count} meetings</span>
                      <span>
                        {Math.round(theme.confidence * 100)}% confidence
                      </span>
                    </div>
                    {theme.sample_artifacts &&
                      theme.sample_artifacts.length > 0 && (
                        <div className="space-y-1.5">
                          {theme.sample_artifacts.map((sa, i) => (
                            <div
                              key={i}
                              className="text-xs text-muted-foreground flex items-start gap-1.5"
                            >
                              <span
                                className={`shrink-0 px-1 py-0.5 rounded ${
                                  TYPE_COLORS[sa.type] ||
                                  "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {sa.type.replace(/_/g, " ")}
                              </span>
                              <span className="line-clamp-1">
                                {sa.content}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/*  ARTIFACTS TAB                                                */}
        {/* ============================================================ */}
        <TabsContent value="artifacts">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-1">
              <Tag className="h-3 w-3 text-muted-foreground" />
              <select
                className="text-xs border rounded px-2 py-1 bg-background"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All types</option>
                {allTypes.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            {allPillars.length > 0 && (
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3 text-muted-foreground" />
                <select
                  className="text-xs border rounded px-2 py-1 bg-background"
                  value={pillarFilter}
                  onChange={(e) => setPillarFilter(e.target.value)}
                >
                  <option value="all">All pillars</option>
                  {allPillars.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-xs text-muted-foreground self-center ml-2">
              {filteredArtifacts.length} results
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredArtifacts.length === 0 ? (
            <EmptyState
              icon={Lightbulb}
              title="No artifacts yet"
              description="Process your meetings to extract decisions, insights, quotes, and more."
            />
          ) : (
            <div className="space-y-2">
              {filteredArtifacts.map((artifact) => (
                <Card key={artifact.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${
                          TYPE_COLORS[artifact.type] ||
                          "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {artifact.type.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{artifact.content}</p>
                        {artifact.context && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {artifact.context}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {artifact.theme && (
                            <Badge variant="outline" className="text-[10px]">
                              {artifact.theme}
                            </Badge>
                          )}
                          {artifact.pillar && (
                            <Badge variant="secondary" className="text-[10px]">
                              {artifact.pillar}
                            </Badge>
                          )}
                          {artifact.meeting_title && (
                            <span className="text-[10px] text-muted-foreground">
                              from: {artifact.meeting_title}
                            </span>
                          )}
                        </div>
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
