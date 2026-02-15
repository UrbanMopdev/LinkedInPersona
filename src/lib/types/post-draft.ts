/**
 * PostDraft: structured object for assistant-generated LinkedIn post drafts.
 * Rendered as LinkedInPreviewCard + PostMetaCard in the chat UI.
 */

export interface PostDraft {
  /** Database post ID (set after saving to DB) */
  id: string;
  /** The LinkedIn post body text */
  body: string;
  /** Author display name */
  authorName: string;
  /** Author headline (e.g. job title) */
  authorHeadline: string;
  /** Author avatar URL */
  authorAvatarUrl: string;
  /** Post metadata */
  meta: PostDraftMeta;
  /** Notion integration info */
  notion?: {
    pageId: string | null;
    syncStatus: string | null;
    lastSyncedAt: string | null;
  };
}

export interface PostDraftMeta {
  pillar: string;
  icp: string;
  objective: string;
  hookType: string;
  status: string;
  publishDate: string;
  tags: string[];
  notes: string;
}

/**
 * Maps a PostDraft back to the flat fields used in the posts DB table.
 */
export function postDraftToDbFields(draft: PostDraft) {
  return {
    content: draft.body,
    pillar: draft.meta.pillar || null,
    target_icp: draft.meta.icp || null,
    post_type: draft.meta.hookType || null,
    status: draft.meta.status || "draft",
    scheduled_at: draft.meta.publishDate || null,
    tags: draft.meta.tags.length > 0 ? draft.meta.tags : [],
    notes: draft.meta.notes || null,
  };
}
