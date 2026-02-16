"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Mic,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  Users,
  Lightbulb,
  AlertCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Meeting {
  id: string;
  title: string;
  start_time: string | null;
  duration_minutes: number | null;
  participants: unknown[];
  summary: string | null;
  key_points: unknown[];
  action_items: unknown[];
  privacy_level: string;
  processed: boolean;
  created_at: string;
}

interface MeetingArtifact {
  id: string;
  type: string;
  content: string;
  context: string | null;
  theme: string | null;
  pillar: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MeetingsClient() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Record<string, MeetingArtifact[]>>({});
  const [loadingArtifacts, setLoadingArtifacts] = useState<string | null>(null);

  const loadMeetings = useCallback(async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase
        .from("meetings")
        .select(
          "id, title, start_time, duration_minutes, participants, summary, key_points, action_items, privacy_level, processed, created_at"
        )
        .eq("provider", "read_ai")
        .order("start_time", { ascending: false })
        .limit(100);
      setMeetings((data as Meeting[]) || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  async function loadArtifacts(meetingId: string) {
    if (artifacts[meetingId]) return;
    setLoadingArtifacts(meetingId);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase
        .from("meeting_artifacts")
        .select("id, type, content, context, theme, pillar")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: true });
      setArtifacts((prev) => ({
        ...prev,
        [meetingId]: (data as MeetingArtifact[]) || [],
      }));
    } catch {
      /* ignore */
    } finally {
      setLoadingArtifacts(null);
    }
  }

  function toggleExpand(meetingId: string) {
    if (expandedId === meetingId) {
      setExpandedId(null);
    } else {
      setExpandedId(meetingId);
      loadArtifacts(meetingId);
    }
  }

  const filtered = search
    ? meetings.filter(
        (m) =>
          m.title.toLowerCase().includes(search.toLowerCase()) ||
          (m.summary && m.summary.toLowerCase().includes(search.toLowerCase()))
      )
    : meetings;

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
        title="Meetings"
        description="Browse your imported meeting reports and extracted insights."
      />

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Mic}
          title="No meetings yet"
          description="Connect Read.ai in Settings and run an import to see your meetings here."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((meeting) => {
            const isExpanded = expandedId === meeting.id;
            const meetingArtifacts = artifacts[meeting.id] || [];
            const participants = Array.isArray(meeting.participants)
              ? meeting.participants
              : [];

            return (
              <Card key={meeting.id}>
                <CardContent className="pt-6">
                  <button
                    className="w-full text-left"
                    onClick={() => toggleExpand(meeting.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm">
                            {meeting.title}
                          </h4>
                          {meeting.processed ? (
                            <Badge variant="success" className="text-[10px]">
                              Processed
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Pending
                            </Badge>
                          )}
                          {meeting.privacy_level !== "standard" && (
                            <Badge variant="outline" className="text-[10px]">
                              {meeting.privacy_level}
                            </Badge>
                          )}
                        </div>

                        {meeting.summary && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {meeting.summary}
                          </p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {meeting.start_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(meeting.start_time).toLocaleDateString()}{" "}
                              {new Date(meeting.start_time).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" }
                              )}
                            </span>
                          )}
                          {meeting.duration_minutes && (
                            <span>{meeting.duration_minutes} min</span>
                          )}
                          {participants.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {participants.length} participants
                            </span>
                          )}
                          {meetingArtifacts.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Lightbulb className="h-3 w-3" />
                              {meetingArtifacts.length} artifacts
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {/* Key points */}
                      {meeting.key_points && meeting.key_points.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                            Key Points
                          </p>
                          <ul className="text-sm space-y-1">
                            {meeting.key_points.map((kp, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-muted-foreground"
                              >
                                <span className="text-foreground">-</span>
                                <span>
                                  {typeof kp === "string"
                                    ? kp
                                    : JSON.stringify(kp)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Artifacts */}
                      {loadingArtifacts === meeting.id ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                          ))}
                        </div>
                      ) : meetingArtifacts.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                            Extracted Artifacts
                          </p>
                          <div className="space-y-2">
                            {meetingArtifacts.map((artifact) => (
                              <div
                                key={artifact.id}
                                className="rounded-lg border p-3 bg-muted/30"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span
                                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                      TYPE_COLORS[artifact.type] ||
                                      "bg-gray-100 text-gray-800"
                                    }`}
                                  >
                                    {artifact.type.replace(/_/g, " ")}
                                  </span>
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
                                </div>
                                <p className="text-sm">{artifact.content}</p>
                                {artifact.context && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {artifact.context}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : meeting.processed ? (
                        <p className="text-xs text-muted-foreground">
                          No artifacts extracted from this meeting.
                        </p>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-amber-600">
                          <AlertCircle className="h-3 w-3" />
                          Meeting not yet processed. Run sync to extract
                          artifacts.
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
