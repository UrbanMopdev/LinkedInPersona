"use client";

import { useState, useEffect } from "react";
import { Save, Loader2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PostDraftMeta } from "@/lib/types/post-draft";

const STATUS_OPTIONS = ["draft", "scheduled", "published"] as const;

interface PostMetaCardProps {
  postId: string;
  meta: PostDraftMeta;
  notionPageId?: string | null;
  onSave: (postId: string, meta: PostDraftMeta) => Promise<void>;
}

export function PostMetaCard({
  postId,
  meta,
  notionPageId,
  onSave,
}: PostMetaCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PostDraftMeta>(meta);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (!editing) setForm(meta);
  }, [meta, editing]);

  function updateField<K extends keyof PostDraftMeta>(
    key: K,
    value: PostDraftMeta[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddTag() {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      updateField("tags", [...form.tags, tag]);
    }
    setTagInput("");
  }

  function handleRemoveTag(tag: string) {
    updateField(
      "tags",
      form.tags.filter((t) => t !== tag)
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(postId, form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  // Read-only view
  if (!editing) {
    return (
      <div className="w-full max-w-[480px] rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Post Details
          </span>
          <div className="flex items-center gap-1.5">
            {notionPageId && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1">
                <Database className="h-2.5 w-2.5" />
                Notion
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Edit
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-xs">
          <MetaField label="Pillar" value={meta.pillar} />
          <MetaField label="ICP" value={meta.icp} />
          <MetaField label="Objective" value={meta.objective} />
          <MetaField label="Hook type" value={meta.hookType} />
          <MetaField label="Status" value={meta.status} badge />
          <MetaField label="Publish date" value={meta.publishDate} />
          <div className="col-span-2">
            <span className="text-muted-foreground">Tags</span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {meta.tags.length > 0 ? (
                meta.tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="text-[10px] h-5"
                  >
                    {t}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground/60">&mdash;</span>
              )}
            </div>
          </div>
          {meta.notes && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Notes</span>
              <p className="mt-0.5 text-foreground leading-relaxed whitespace-pre-wrap">
                {meta.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Edit mode
  return (
    <div className="w-full max-w-[480px] rounded-lg border border-ring/30 bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Edit Details
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setForm(meta);
              setEditing(false);
            }}
            className="h-6 px-2 text-xs"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            className="h-6 px-2 text-xs"
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-3">
        <EditField label="Pillar">
          <Input
            value={form.pillar}
            onChange={(e) => updateField("pillar", e.target.value)}
            className="h-7 text-xs"
          />
        </EditField>
        <EditField label="ICP">
          <Input
            value={form.icp}
            onChange={(e) => updateField("icp", e.target.value)}
            className="h-7 text-xs"
          />
        </EditField>
        <EditField label="Objective">
          <Input
            value={form.objective}
            onChange={(e) => updateField("objective", e.target.value)}
            className="h-7 text-xs"
          />
        </EditField>
        <EditField label="Hook type">
          <Input
            value={form.hookType}
            onChange={(e) => updateField("hookType", e.target.value)}
            className="h-7 text-xs"
          />
        </EditField>
        <EditField label="Status">
          <Select
            value={form.status}
            onValueChange={(v) => updateField("status", v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </EditField>
        <EditField label="Publish date">
          <Input
            type="date"
            value={form.publishDate}
            onChange={(e) => updateField("publishDate", e.target.value)}
            className="h-7 text-xs"
          />
        </EditField>
        <div className="col-span-2">
          <label className="text-[11px] text-muted-foreground mb-1 block">
            Tags
          </label>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {form.tags.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="text-[10px] h-5 cursor-pointer hover:bg-destructive/20"
                onClick={() => handleRemoveTag(t)}
              >
                {t} &times;
              </Badge>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add tag..."
              className="h-7 text-xs flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddTag}
              className="h-7 px-2 text-xs"
              disabled={!tagInput.trim()}
            >
              Add
            </Button>
          </div>
        </div>
        <div className="col-span-2">
          <label className="text-[11px] text-muted-foreground mb-1 block">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helper sub-components                                               */
/* ------------------------------------------------------------------ */

function MetaField({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <div className="mt-0.5">
        {value ? (
          badge ? (
            <Badge
              variant={
                value === "published"
                  ? "success"
                  : value === "scheduled"
                    ? "warning"
                    : "secondary"
              }
              className="text-[10px] h-5"
            >
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </Badge>
          ) : (
            <span className="text-foreground">{value}</span>
          )
        ) : (
          <span className="text-muted-foreground/60">&mdash;</span>
        )}
      </div>
    </div>
  );
}

function EditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}
