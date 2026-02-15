"use client";

import { useState, useEffect, useCallback } from "react";
import { getCalendarPosts, reschedulePost } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  AlertCircle,
  CheckCircle2,
  Database,
} from "lucide-react";
import Link from "next/link";

interface CalendarPost {
  id: string;
  title: string | null;
  content: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  pillar: string | null;
  tags: string[] | null;
  notion_page_id: string | null;
}

const PILLAR_COLORS: Record<string, string> = {
  "thought-leadership": "bg-blue-100 text-blue-800 border-blue-200",
  educational: "bg-emerald-100 text-emerald-800 border-emerald-200",
  personal: "bg-purple-100 text-purple-800 border-purple-200",
  promotional: "bg-amber-100 text-amber-800 border-amber-200",
  engagement: "bg-pink-100 text-pink-800 border-pink-200",
};

function getPillarColor(pillar: string | null) {
  if (!pillar) return "";
  return PILLAR_COLORS[pillar.toLowerCase()] || "bg-secondary text-foreground";
}

function getWeekDates(baseDate: Date): Date[] {
  const start = new Date(baseDate);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function getMonthDates(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday=0
  const weeks: (Date | null)[][] = [];
  let currentWeek: (Date | null)[] = [];

  for (let i = 0; i < startDay; i++) currentWeek.push(null);

  for (let d = 1; d <= lastDay.getDate(); d++) {
    currentWeek.push(new Date(year, month, d));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }
  return weeks;
}

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarClient() {
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [view, setView] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dragPost, setDragPost] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [filterPillar, setFilterPillar] = useState<string>("all");

  const loadPosts = useCallback(async () => {
    try {
      const data = await getCalendarPosts();
      setPosts(data as CalendarPost[]);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const postsByDate = new Map<string, CalendarPost[]>();
  for (const post of posts) {
    const date = post.scheduled_at || post.published_at;
    if (!date) continue;
    if (filterPillar !== "all" && post.pillar?.toLowerCase() !== filterPillar) continue;
    const key = date.slice(0, 10);
    const existing = postsByDate.get(key) || [];
    existing.push(post);
    postsByDate.set(key, existing);
  }

  const unscheduled = posts.filter(
    (p) => !p.scheduled_at && !p.published_at && p.status === "draft"
  );

  async function handleDrop(targetDate: string) {
    if (!dragPost) return;
    setError("");
    try {
      await reschedulePost(dragPost, targetDate + "T09:00:00Z");
      setSuccess("Post rescheduled!");
      setTimeout(() => setSuccess(""), 2000);
      await loadPosts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reschedule failed");
    }
    setDragPost(null);
  }

  async function handleRescheduleManual() {
    if (!rescheduleId || !rescheduleDate) return;
    setError("");
    try {
      await reschedulePost(rescheduleId, rescheduleDate + "T09:00:00Z");
      setSuccess("Post rescheduled!");
      setTimeout(() => setSuccess(""), 2000);
      setRescheduleId(null);
      setRescheduleDate("");
      await loadPosts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reschedule failed");
    }
  }

  function navigatePrev() {
    const d = new Date(currentDate);
    if (view === "month") {
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setDate(d.getDate() - 7);
    }
    setCurrentDate(d);
  }

  function navigateNext() {
    const d = new Date(currentDate);
    if (view === "month") {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + 7);
    }
    setCurrentDate(d);
  }

  const today = dateKey(new Date());
  const pillars = [...new Set(posts.map((p) => p.pillar).filter(Boolean))] as string[];

  // Render helpers
  function renderPostChip(post: CalendarPost) {
    const label = post.title || post.content.slice(0, 40);
    return (
      <div
        key={post.id}
        draggable
        onDragStart={() => setDragPost(post.id)}
        className={`text-xs px-2 py-1 rounded border cursor-grab truncate ${
          post.status === "published"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : post.pillar
              ? getPillarColor(post.pillar)
              : "bg-secondary border-border text-foreground"
        }`}
        title={post.content.slice(0, 200)}
      >
        <span className="flex items-center gap-1">
          {post.status !== "published" && <GripVertical className="h-3 w-3 shrink-0 opacity-50" />}
          {post.notion_page_id && <Database className="h-3 w-3 shrink-0 opacity-60" />}
          <span className="truncate">{label}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container px-6 py-8">
      <PageHeader title="Calendar" description="Plan and schedule your LinkedIn content.">
        <div className="flex items-center gap-2">
          <Button
            variant={view === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("month")}
          >
            Month
          </Button>
          <Button
            variant={view === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("week")}
          >
            Week
          </Button>
        </div>
      </PageHeader>

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

      {/* Navigation + Filter */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={navigatePrev}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-h3 min-w-[180px] text-center">
            {view === "month"
              ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
              : `Week of ${getWeekDates(currentDate)[0].toLocaleDateString()}`}
          </h2>
          <Button variant="ghost" size="icon" onClick={navigateNext}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
        </div>
        {pillars.length > 0 && (
          <select
            className="text-sm border rounded-lg px-3 py-1.5 bg-background"
            value={filterPillar}
            onChange={(e) => setFilterPillar(e.target.value)}
          >
            <option value="all">All pillars</option>
            {pillars.map((p) => (
              <option key={p} value={p.toLowerCase()}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-[500px] w-full" />
      ) : view === "month" ? (
        /* Month view */
        <div className="border rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-muted/50">
            {DAY_LABELS.map((d) => (
              <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center border-b">
                {d}
              </div>
            ))}
          </div>
          {/* Weeks */}
          {getMonthDates(currentDate.getFullYear(), currentDate.getMonth()).map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day, di) => {
                const key = day ? dateKey(day) : `empty-${wi}-${di}`;
                const dayPosts = day ? postsByDate.get(dateKey(day)) || [] : [];
                const isToday = day && dateKey(day) === today;
                return (
                  <div
                    key={key}
                    className={`min-h-[100px] border-b border-r p-1.5 ${
                      !day ? "bg-muted/30" : ""
                    } ${isToday ? "bg-primary/5" : ""} ${
                      dragPost ? "hover:bg-primary/10 transition-colors" : ""
                    }`}
                    onDragOver={(e) => {
                      if (day) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (day) handleDrop(dateKey(day));
                    }}
                  >
                    {day && (
                      <>
                        <div className={`text-xs mb-1 ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                          {day.getDate()}
                        </div>
                        <div className="space-y-1">
                          {dayPosts.slice(0, 3).map(renderPostChip)}
                          {dayPosts.length > 3 && (
                            <div className="text-xs text-muted-foreground pl-2">
                              +{dayPosts.length - 3} more
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        /* Week view */
        <div className="border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/50">
            {getWeekDates(currentDate).map((d) => (
              <div
                key={dateKey(d)}
                className={`px-2 py-2 text-center border-b ${dateKey(d) === today ? "bg-primary/10" : ""}`}
              >
                <div className="text-xs text-muted-foreground">{DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]}</div>
                <div className={`text-sm font-semibold ${dateKey(d) === today ? "text-primary" : ""}`}>
                  {d.getDate()}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {getWeekDates(currentDate).map((d) => {
              const key = dateKey(d);
              const dayPosts = postsByDate.get(key) || [];
              return (
                <div
                  key={key}
                  className={`min-h-[300px] border-r p-2 ${dragPost ? "hover:bg-primary/10 transition-colors" : ""}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(key)}
                >
                  <div className="space-y-2">
                    {dayPosts.map((post) => (
                      <Link key={post.id} href="/app/write" className="block">
                        <Card className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <span
                                draggable
                                onDragStart={() => setDragPost(post.id)}
                                className="shrink-0 mt-0.5 cursor-grab"
                              >
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">
                                  {post.title || post.content.slice(0, 50)}
                                </p>
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  <Badge variant={post.status === "published" ? "success" : "secondary"} className="text-[10px]">
                                    {post.status}
                                  </Badge>
                                  {post.pillar && (
                                    <Badge variant="outline" className="text-[10px]">{post.pillar}</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unscheduled posts */}
      {unscheduled.length > 0 && (
        <div className="mt-8">
          <h3 className="text-h3 mb-4">Unscheduled Drafts ({unscheduled.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unscheduled.map((post) => (
              <Card key={post.id}>
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm font-semibold truncate mb-2">
                    {post.title || post.content.slice(0, 60)}
                  </p>
                  {post.pillar && (
                    <Badge variant="outline" className="mb-2 text-xs">{post.pillar}</Badge>
                  )}
                  {rescheduleId === post.id ? (
                    <div className="flex gap-2 mt-2">
                      <Input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Button size="sm" onClick={handleRescheduleManual}>
                        Set
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRescheduleId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRescheduleId(post.id)}
                      className="mt-1"
                    >
                      <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                      Schedule
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
