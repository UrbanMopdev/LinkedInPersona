"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getCalendarPosts, reschedulePost, updatePostFields, getLastSyncTime } from "../actions";
import { deletePost } from "../write/actions";
import { updatePostContent } from "../write/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  AlertCircle,
  CheckCircle2,
  Database,
  Table2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  ExternalLink,
  Pencil,
  Save,
  Trash2,
  RefreshCw,
  Loader2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CalendarPost {
  id: string;
  title: string | null;
  content: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  pillar: string | null;
  platform: string | null;
  post_type: string | null;
  target_icp: string | null;
  tags: string[] | null;
  notes: string | null;
  linkedin_url: string | null;
  notion_page_id: string | null;
}

type SortField =
  | "title"
  | "pillar"
  | "platform"
  | "publish_date"
  | "post_type"
  | "status"
  | "target_icp";
type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PILLAR_COLORS: Record<string, string> = {
  "real decisions real trade-offs": "bg-blue-100 text-blue-800 border-blue-200",
  "building in public (operator's desk)": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "frontline dignity": "bg-purple-100 text-purple-800 border-purple-200",
  "operator-led growth": "bg-amber-100 text-amber-800 border-amber-200",
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
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
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
  const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Drafting";
    case "scheduled":
      return "Scheduled";
    case "published":
      return "Published";
    default:
      return status;
  }
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface NotionFieldOptions {
  [field: string]: Array<{ name: string; color?: string }>;
}

/* ------------------------------------------------------------------ */
/*  Post Detail Popup (inline-editable)                                */
/* ------------------------------------------------------------------ */

function PostDetailPopup({
  post,
  notionOptions,
  onClose,
  onUpdated,
  onDeleted,
}: {
  post: CalendarPost;
  notionOptions: NotionFieldOptions;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0); // 0=none, 1=first confirm, 2=final confirm
  const [deleting, setDeleting] = useState(false);
  const [popupError, setPopupError] = useState("");
  const [popupSuccess, setPopupSuccess] = useState("");

  // Editable fields
  const [title, setTitle] = useState(post.title || "");
  const [status, setStatus] = useState(post.status);
  const [pillar, setPillar] = useState(post.pillar || "");
  const [platform, setPlatform] = useState(post.platform || "");
  const [postType, setPostType] = useState(post.post_type || "");
  const [targetIcp, setTargetIcp] = useState(post.target_icp || "");
  const [scheduledAt, setScheduledAt] = useState(
    (post.scheduled_at || post.published_at || "").slice(0, 10)
  );
  const [tags, setTags] = useState(post.tags?.join(", ") || "");
  const [notes, setNotes] = useState(post.notes || "");
  const [linkedinUrl, setLinkedinUrl] = useState(post.linkedin_url || "");
  const [content, setContent] = useState(post.content);

  async function handleSaveFields() {
    setSaving(true);
    setPopupError("");
    try {
      await updatePostFields(post.id, {
        title: title || undefined,
        status,
        scheduled_at: scheduledAt ? scheduledAt + "T09:00:00Z" : null,
        pillar: pillar || null,
        platform: platform || null,
        post_type: postType || null,
        target_icp: targetIcp || null,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        notes: notes || null,
        linkedin_url: linkedinUrl || null,
      });
      setPopupSuccess("Saved!");
      setTimeout(() => setPopupSuccess(""), 1500);
      setEditing(false);
      onUpdated();
    } catch (e: unknown) {
      setPopupError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveContent() {
    setSaving(true);
    setPopupError("");
    try {
      await updatePostContent(post.id, content);
      setPopupSuccess("Content saved!");
      setTimeout(() => setPopupSuccess(""), 1500);
      setEditingContent(false);
      onUpdated();
    } catch (e: unknown) {
      setPopupError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setPopupError("");
    try {
      await deletePost(post.id);
      onDeleted();
    } catch (e: unknown) {
      setPopupError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
      setDeleteStep(0);
    }
  }

  function renderSelectOrInput(
    label: string,
    value: string,
    onChange: (v: string) => void,
    optionsKey: string,
    placeholder: string
  ) {
    const options = notionOptions[optionsKey];
    if (options && options.length > 0) {
      return (
        <div>
          <span className="text-xs text-muted-foreground block mb-1">{label}</span>
          <Select value={value || "_none"} onValueChange={(v) => onChange(v === "_none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {options.map((opt) => (
                <SelectItem key={opt.name} value={opt.name}>{opt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    return (
      <div>
        <span className="text-xs text-muted-foreground block mb-1">{label}</span>
        <Input className="h-8 text-sm" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  const charCount = content.length;
  const charColor = charCount > 1300 ? "text-destructive" : charCount > 1100 ? "text-amber-600" : "text-muted-foreground";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex-1 min-w-0">
            {editing ? (
              <Input
                className="text-lg font-semibold mb-2"
                placeholder="Post title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            ) : (
              <h2 className="text-lg font-semibold">
                {post.title || post.content.slice(0, 60)}
              </h2>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge
                variant={
                  post.status === "published"
                    ? "success"
                    : post.status === "scheduled"
                      ? "warning"
                      : "secondary"
                }
              >
                {statusLabel(post.status)}
              </Badge>
              {post.notion_page_id && (
                <Badge variant="outline" className="gap-1">
                  <Database className="h-3 w-3" />
                  Notion
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Alerts */}
        {popupError && (
          <div className="mx-6 mb-2 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />{popupError}
          </div>
        )}
        {popupSuccess && (
          <div className="mx-6 mb-2 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{popupSuccess}
          </div>
        )}

        <Separator />

        {/* Properties grid */}
        {editing ? (
          <div className="p-6 grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Status</span>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Drafting</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Publish Date</span>
              <Input className="h-8 text-sm" type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            {renderSelectOrInput("Pillar", pillar, setPillar, "pillar", "Select pillar...")}
            {renderSelectOrInput("Platform", platform, setPlatform, "platform", "e.g. LinkedIn")}
            {renderSelectOrInput("Post Type", postType, setPostType, "post_type", "Select type...")}
            {renderSelectOrInput("Target ICP", targetIcp, setTargetIcp, "target_icp", "Select ICP...")}
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground block mb-1">Tags</span>
              <Input className="h-8 text-sm" placeholder="Comma-separated tags..." value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground block mb-1">Signal Notes</span>
              <Textarea className="min-h-[60px] text-sm" placeholder="Notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground block mb-1">Link</span>
              <Input className="h-8 text-sm" placeholder="https://linkedin.com/..." value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
            </div>
            <div className="col-span-2 flex justify-end gap-2 mt-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveFields} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? "Saving..." : "Save Fields"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Properties</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3 mr-1" />Edit
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PropertyRow label="Pillar" value={post.pillar} />
              <PropertyRow label="Platform" value={post.platform} />
              <PropertyRow label="Publish Date" value={formatDate(post.scheduled_at || post.published_at)} />
              <PropertyRow label="Post Type" value={post.post_type} />
              <PropertyRow label="Status" value={statusLabel(post.status)} />
              <PropertyRow label="Target ICP" value={post.target_icp} />
              {post.linkedin_url && (
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground block mb-1">Link</span>
                  <a
                    href={post.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />{post.linkedin_url}
                  </a>
                </div>
              )}
              {post.tags && post.tags.length > 0 && (
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground block mb-1">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {post.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {post.notes && (
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground block mb-1">Signal Notes</span>
                  <p className="text-sm text-foreground">{post.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Post content */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Post Content</span>
            {!editingContent && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingContent(true)}>
                <Pencil className="h-3 w-3 mr-1" />Edit
              </Button>
            )}
          </div>
          {editingContent ? (
            <div>
              <Textarea
                className="min-h-[200px] text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className={`text-right text-xs mt-1 ${charColor}`}>
                {charCount} / 1,300
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => { setEditingContent(false); setContent(post.content); }}>Cancel</Button>
                <Button size="sm" onClick={handleSaveContent} disabled={saving}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? "Saving..." : "Save Content"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
              {post.content}
            </div>
          )}
        </div>

        <Separator />

        {/* Actions: delete with double confirm */}
        <div className="flex items-center justify-between p-6 pt-4">
          <div>
            {deleteStep === 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteStep(1)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            )}
            {deleteStep === 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-destructive">Are you sure?</span>
                <Button variant="destructive" size="sm" onClick={() => setDeleteStep(2)}>
                  Yes, delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteStep(0)}>Cancel</Button>
              </div>
            )}
            {deleteStep === 2 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-destructive font-medium">This cannot be undone!</span>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting..." : "Confirm Delete"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteStep(0)}>Cancel</Button>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function PropertyRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground block mb-0.5">
        {label}
      </span>
      <span className="text-sm font-medium">{value || "\u2014"}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CalendarClient() {
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [view, setView] = useState<"table" | "month" | "week">("table");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dragPost, setDragPost] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [filterPillar, setFilterPillar] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);

  // Notion field options for dropdowns
  const [notionOptions, setNotionOptions] = useState<NotionFieldOptions>({});

  // Sync state
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Table sort
  const [sortField, setSortField] = useState<SortField>("publish_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const loadPosts = useCallback(async () => {
    try {
      const data = await getCalendarPosts();
      setPosts(data as CalendarPost[]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load posts"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSyncState = useCallback(async () => {
    try {
      const syncData = await getLastSyncTime();
      if (syncData) setLastSyncAt(syncData.lastSyncAt);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadPosts();
    loadSyncState();
    // Fetch Notion schema for dropdown options
    fetch("/api/notion/schema")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.fieldOptions) setNotionOptions(data.fieldOptions);
      })
      .catch(() => {});
  }, [loadPosts, loadSyncState]);

  async function handleSyncNow() {
    setSyncing(true);
    setError("");
    try {
      const res = await fetch("/api/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "incremental" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const n2a = data.notionToApp;
      const a2n = data.appToNotion;
      setSuccess(
        `Synced! Notion\u2192App: ${n2a.pagesUpdated} updated. App\u2192Notion: ${a2n.pagesProcessed} pushed.`
      );
      setTimeout(() => setSuccess(""), 4000);
      await loadPosts();
      await loadSyncState();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // Filtered posts for table
  const filteredPosts = useMemo(() => {
    let result = [...posts];
    if (filterPillar !== "all") {
      result = result.filter(
        (p) => p.pillar?.toLowerCase() === filterPillar
      );
    }
    if (filterStatus !== "all") {
      result = result.filter((p) => p.status === filterStatus);
    }
    return result;
  }, [posts, filterPillar, filterStatus]);

  // Sorted posts for table
  const sortedPosts = useMemo(() => {
    const sorted = [...filteredPosts];
    sorted.sort((a, b) => {
      let aVal: string | null = null;
      let bVal: string | null = null;

      switch (sortField) {
        case "title":
          aVal = a.title || a.content.slice(0, 50);
          bVal = b.title || b.content.slice(0, 50);
          break;
        case "pillar":
          aVal = a.pillar;
          bVal = b.pillar;
          break;
        case "platform":
          aVal = a.platform;
          bVal = b.platform;
          break;
        case "publish_date":
          aVal = a.scheduled_at || a.published_at;
          bVal = b.scheduled_at || b.published_at;
          break;
        case "post_type":
          aVal = a.post_type;
          bVal = b.post_type;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "target_icp":
          aVal = a.target_icp;
          bVal = b.target_icp;
          break;
      }

      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;

      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredPosts, sortField, sortDir]);

  // Calendar-specific data
  const postsByDate = new Map<string, CalendarPost[]>();
  for (const post of posts) {
    const date = post.scheduled_at || post.published_at;
    if (!date) continue;
    if (filterPillar !== "all" && post.pillar?.toLowerCase() !== filterPillar)
      continue;
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

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const today = dateKey(new Date());
  const pillars = [
    ...new Set(posts.map((p) => p.pillar).filter(Boolean)),
  ] as string[];

  function renderSortIcon(field: SortField) {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  }

  function renderPostChip(post: CalendarPost) {
    const label = post.title || post.content.slice(0, 40);
    return (
      <div
        key={post.id}
        draggable
        onDragStart={() => setDragPost(post.id)}
        onClick={() => setSelectedPost(post)}
        className={`text-xs px-2 py-1 rounded border cursor-pointer truncate ${
          post.status === "published"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : post.pillar
              ? getPillarColor(post.pillar)
              : "bg-secondary border-border text-foreground"
        } hover:opacity-80 transition-opacity`}
        title={post.content.slice(0, 200)}
      >
        <span className="flex items-center gap-1">
          {post.status !== "published" && (
            <GripVertical className="h-3 w-3 shrink-0 opacity-50" />
          )}
          {post.notion_page_id && (
            <Database className="h-3 w-3 shrink-0 opacity-60" />
          )}
          <span className="truncate">{label}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-container px-6 py-8">
      <PageHeader
        title="Calendar"
        description="Plan and schedule your LinkedIn content. Table view mirrors your Notion database."
      >
        <div className="flex items-center gap-3">
          {/* Sync controls */}
          {lastSyncAt && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Last sync: {new Date(lastSyncAt).toLocaleString()}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={handleSyncNow}
                disabled={syncing}
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant={view === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("table")}
            >
              <Table2 className="h-4 w-4 mr-1.5" />
              Table
            </Button>
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

      {/* Post Detail Popup */}
      {selectedPost && (
        <PostDetailPopup
          post={selectedPost}
          notionOptions={notionOptions}
          onClose={() => setSelectedPost(null)}
          onUpdated={() => {
            loadPosts();
            setSelectedPost(null);
          }}
          onDeleted={() => {
            setSelectedPost(null);
            setSuccess("Post deleted");
            setTimeout(() => setSuccess(""), 2000);
            loadPosts();
          }}
        />
      )}

      {/* ============================================================ */}
      {/*  TABLE VIEW — mirrors Notion database                        */}
      {/* ============================================================ */}
      {view === "table" && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select
              className="text-sm border rounded-lg px-3 py-1.5 bg-background"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All statuses ({posts.length})</option>
              <option value="draft">
                Drafting ({posts.filter((p) => p.status === "draft").length})
              </option>
              <option value="scheduled">
                Scheduled ({posts.filter((p) => p.status === "scheduled").length})
              </option>
              <option value="published">
                Published ({posts.filter((p) => p.status === "published").length})
              </option>
            </select>
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
            <span className="text-sm text-muted-foreground">
              {sortedPosts.length} post{sortedPosts.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : (
            <div className="border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <SortableHeader
                      label="Post Title"
                      field="title"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      renderIcon={renderSortIcon}
                    />
                    <SortableHeader
                      label="Pillar"
                      field="pillar"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      renderIcon={renderSortIcon}
                    />
                    <SortableHeader
                      label="Platform"
                      field="platform"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      renderIcon={renderSortIcon}
                    />
                    <SortableHeader
                      label="Post Publish Date"
                      field="publish_date"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      renderIcon={renderSortIcon}
                    />
                    <SortableHeader
                      label="Post Type"
                      field="post_type"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      renderIcon={renderSortIcon}
                    />
                    <SortableHeader
                      label="Status"
                      field="status"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      renderIcon={renderSortIcon}
                    />
                    <SortableHeader
                      label="Target ICP"
                      field="target_icp"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      renderIcon={renderSortIcon}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedPosts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-muted-foreground py-12"
                      >
                        No posts found. Create a draft or sync from Notion.
                      </td>
                    </tr>
                  ) : (
                    sortedPosts.map((post) => {
                      const publishDate =
                        post.scheduled_at || post.published_at;
                      return (
                        <tr
                          key={post.id}
                          className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => setSelectedPost(post)}
                        >
                          <td className="px-3 py-2.5 max-w-[280px]">
                            <div className="flex items-center gap-1.5">
                              {post.notion_page_id && (
                                <Database className="h-3 w-3 shrink-0 text-muted-foreground" />
                              )}
                              <span className="font-medium truncate">
                                {post.title || post.content.slice(0, 50)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {post.pillar && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${getPillarColor(post.pillar)}`}
                              >
                                {post.pillar}
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {post.platform || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                            {publishDate ? formatDate(publishDate) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            {post.post_type && (
                              <Badge variant="secondary" className="text-xs">
                                {post.post_type}
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge
                              variant={
                                post.status === "published"
                                  ? "success"
                                  : post.status === "scheduled"
                                    ? "warning"
                                    : "secondary"
                              }
                              className="text-xs"
                            >
                              {statusLabel(post.status)}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs">
                            {post.target_icp || "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/*  CALENDAR VIEWS (Month / Week)                               */}
      {/* ============================================================ */}
      {(view === "month" || view === "week") && (
        <>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date())}
              >
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
            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-7 bg-muted/50">
                {DAY_LABELS.map((d) => (
                  <div
                    key={d}
                    className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center border-b"
                  >
                    {d}
                  </div>
                ))}
              </div>
              {getMonthDates(
                currentDate.getFullYear(),
                currentDate.getMonth()
              ).map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                  {week.map((day, di) => {
                    const key = day ? dateKey(day) : `empty-${wi}-${di}`;
                    const dayPosts = day
                      ? postsByDate.get(dateKey(day)) || []
                      : [];
                    const isToday = day && dateKey(day) === today;
                    return (
                      <div
                        key={key}
                        className={`min-h-[100px] border-b border-r p-1.5 ${
                          !day ? "bg-muted/30" : ""
                        } ${isToday ? "bg-primary/5" : ""} ${
                          dragPost
                            ? "hover:bg-primary/10 transition-colors"
                            : ""
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
                            <div
                              className={`text-xs mb-1 ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}
                            >
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
            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-7 bg-muted/50">
                {getWeekDates(currentDate).map((d) => (
                  <div
                    key={dateKey(d)}
                    className={`px-2 py-2 text-center border-b ${dateKey(d) === today ? "bg-primary/10" : ""}`}
                  >
                    <div className="text-xs text-muted-foreground">
                      {DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]}
                    </div>
                    <div
                      className={`text-sm font-semibold ${dateKey(d) === today ? "text-primary" : ""}`}
                    >
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
                          <Card
                            key={post.id}
                            className="hover:shadow-sm transition-shadow cursor-pointer"
                            onClick={() => setSelectedPost(post)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start gap-2">
                                <span
                                  draggable
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    setDragPost(post.id);
                                  }}
                                  className="shrink-0 mt-0.5 cursor-grab"
                                >
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate">
                                    {post.title || post.content.slice(0, 50)}
                                  </p>
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    <Badge
                                      variant={
                                        post.status === "published"
                                          ? "success"
                                          : "secondary"
                                      }
                                      className="text-[10px]"
                                    >
                                      {statusLabel(post.status)}
                                    </Badge>
                                    {post.pillar && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px]"
                                      >
                                        {post.pillar}
                                      </Badge>
                                    )}
                                    {post.target_icp && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px]"
                                      >
                                        {post.target_icp}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Unscheduled posts */}
      {unscheduled.length > 0 && (
        <div className="mt-8">
          <h3 className="text-h3 mb-4">
            Unscheduled Drafts ({unscheduled.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unscheduled.map((post) => (
              <Card key={post.id}>
                <CardContent className="pt-4 pb-4">
                  <p
                    className="text-sm font-semibold truncate mb-1 cursor-pointer hover:text-primary transition-colors"
                    onClick={() => setSelectedPost(post)}
                  >
                    {post.title || post.content.slice(0, 60)}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {post.pillar && (
                      <Badge variant="outline" className="text-xs">
                        {post.pillar}
                      </Badge>
                    )}
                    {post.target_icp && (
                      <Badge variant="outline" className="text-[10px]">
                        {post.target_icp}
                      </Badge>
                    )}
                  </div>
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRescheduleId(null)}
                      >
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

/* ------------------------------------------------------------------ */
/*  Sortable Table Header                                              */
/* ------------------------------------------------------------------ */

function SortableHeader({
  label,
  field,
  current,
  dir: _dir,
  onSort,
  renderIcon,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (field: SortField) => void;
  renderIcon: (field: SortField) => React.ReactNode;
}) {
  return (
    <th
      className={`px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${
        current === field ? "text-foreground" : ""
      }`}
      onClick={() => onSort(field)}
    >
      <span className="flex items-center">
        {label}
        {renderIcon(field)}
      </span>
    </th>
  );
}
