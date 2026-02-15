"use client";

import { useState, useRef, useEffect } from "react";
import {
  Pencil,
  Copy,
  ExternalLink,
  Check,
  X,
  Save,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COLLAPSE_THRESHOLD = 280;

interface LinkedInPreviewCardProps {
  postId: string;
  authorName: string;
  authorHeadline: string;
  authorAvatarUrl: string;
  body: string;
  onSave: (postId: string, newBody: string) => Promise<void>;
}

export function LinkedInPreviewCard({
  postId,
  authorName,
  authorHeadline,
  authorAvatarUrl,
  body,
  onSave,
}: LinkedInPreviewCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(body);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync body prop changes
  useEffect(() => {
    if (!isEditing) setEditBody(body);
  }, [body, isEditing]);

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
      textareaRef.current.focus();
    }
  }, [isEditing, editBody]);

  const needsCollapse = body.length > COLLAPSE_THRESHOLD;
  const displayBody =
    !expanded && needsCollapse
      ? body.slice(0, COLLAPSE_THRESHOLD)
      : body;

  const wordCount = body
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  async function handleSave() {
    if (editBody.trim() === body) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(postId, editBody.trim());
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenLinkedIn() {
    const url = `https://www.linkedin.com/preload/sharebox/?text=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="w-full max-w-[480px] rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="h-10 w-10 shrink-0 rounded-full bg-muted overflow-hidden">
          {authorAvatarUrl ? (
            <img
              src={authorAvatarUrl}
              alt={authorName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
              {authorName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight truncate">
            {authorName}
          </p>
          <p className="text-xs text-muted-foreground leading-tight truncate">
            {authorHeadline}
          </p>
          <p className="text-xs text-muted-foreground/60 leading-tight">
            Just now
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-2">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={6}
          />
        ) : (
          <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {displayBody}
            {needsCollapse && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="text-muted-foreground hover:text-foreground ml-0.5 font-medium"
              >
                ...more
              </button>
            )}
            {needsCollapse && expanded && (
              <button
                onClick={() => setExpanded(false)}
                className="block text-muted-foreground hover:text-foreground text-xs mt-1 font-medium"
              >
                show less
              </button>
            )}
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="mx-4 border-t border-border/40" />

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>

        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditBody(body);
                  setIsEditing(false);
                }}
                className="h-7 px-2 text-xs"
                disabled={saving}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                className="h-7 px-2 text-xs"
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1" />
                )}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className={cn(
                  "h-7 px-2 text-xs",
                  copied
                    ? "text-emerald-600"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenLinkedIn}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Open in LinkedIn
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
