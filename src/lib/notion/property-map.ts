/**
 * Maps between Notion database properties and our posts table fields.
 *
 * The `property_map` stored in notion_sync_state maps our internal field names
 * to the user's Notion property names. For example:
 *   { "title": "Name", "status": "Status", "content": "Draft/Copy", ... }
 */

/* ------------------------------------------------------------------ */
/*  Default property map                                               */
/* ------------------------------------------------------------------ */

export const DEFAULT_PROPERTY_MAP: Record<string, string> = {
  title: "Post Title",
  status: "Status",
  publish_date: "Post Publish Date",
  pillar: "Pillar",
  platform: "Platform",
  post_type: "Post Type",
  target_icp: "Target ICP",
  content: "Draft/Copy",
  linkedin_url: "Link",
  tags: "Tags",
  notes: "Signal Notes",
  impressions: "Impressions",
  likes: "Likes",
  comments: "Comments",
};

/* ------------------------------------------------------------------ */
/*  Read a Notion page's properties into our flat post shape           */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionProperty = any;

interface ExtractedPost {
  title: string | null;
  status: string | null;
  publish_date: string | null;
  pillar: string | null;
  platform: string | null;
  post_type: string | null;
  target_icp: string | null;
  content: string | null;
  linkedin_url: string | null;
  tags: string[];
  notes: string | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
}

export function extractPostFromNotionPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  propertyMap: Record<string, string>
): ExtractedPost & { notion_page_id: string; last_edited_time: string } {
  const props = page.properties || {};

  return {
    notion_page_id: page.id,
    last_edited_time: page.last_edited_time,
    title: readTitle(props, propertyMap.title),
    status: readSelect(props, propertyMap.status),
    publish_date: readDate(props, propertyMap.publish_date),
    pillar: readSelect(props, propertyMap.pillar) ?? readRichText(props, propertyMap.pillar),
    platform: readSelect(props, propertyMap.platform) ?? readRichText(props, propertyMap.platform),
    post_type: readSelect(props, propertyMap.post_type) ?? readRichText(props, propertyMap.post_type),
    target_icp: readSelect(props, propertyMap.target_icp) ?? readRichText(props, propertyMap.target_icp),
    content: readRichText(props, propertyMap.content),
    linkedin_url: readUrl(props, propertyMap.linkedin_url),
    tags: readMultiSelect(props, propertyMap.tags),
    notes: readRichText(props, propertyMap.notes),
    impressions: readNumber(props, propertyMap.impressions),
    likes: readNumber(props, propertyMap.likes),
    comments: readNumber(props, propertyMap.comments),
  };
}

/* ------------------------------------------------------------------ */
/*  Build Notion property payload from our post                        */
/* ------------------------------------------------------------------ */

interface PostData {
  content: string | null;
  status: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  linkedin_url: string | null;
  pillar: string | null;
  platform: string | null;
  post_type: string | null;
  target_icp: string | null;
  tags: string[] | null;
  notes: string | null;
  impressions?: number | null;
  likes?: number | null;
  comments_count?: number | null;
}

export function buildNotionProperties(
  post: PostData,
  title: string,
  propertyMap: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingProps?: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: Record<string, any> = {};

  // Title
  if (propertyMap.title) {
    props[propertyMap.title] = {
      title: [{ type: "text", text: { content: title || "Untitled" } }],
    };
  }

  // Status (select)
  if (propertyMap.status && post.status) {
    const notionStatus = mapAppStatusToNotion(post.status);
    props[propertyMap.status] = { select: { name: notionStatus } };
  }

  // Publish Date
  if (propertyMap.publish_date) {
    const dateValue = post.published_at || post.scheduled_at;
    if (dateValue) {
      props[propertyMap.publish_date] = {
        date: { start: dateValue.split("T")[0] },
      };
    }
  }

  // Content / Draft (rich_text)
  if (propertyMap.content && post.content) {
    props[propertyMap.content] = {
      rich_text: chunkRichText(post.content),
    };
  }

  // LinkedIn URL
  if (propertyMap.linkedin_url && post.linkedin_url) {
    // Check if existing property is url or rich_text type
    const existingType = existingProps?.[propertyMap.linkedin_url]?.type;
    if (existingType === "url" || !existingType) {
      props[propertyMap.linkedin_url] = { url: post.linkedin_url };
    } else {
      props[propertyMap.linkedin_url] = {
        rich_text: [{ type: "text", text: { content: post.linkedin_url } }],
      };
    }
  }

  // Pillar (select)
  if (propertyMap.pillar && post.pillar) {
    props[propertyMap.pillar] = { select: { name: post.pillar } };
  }

  // Platform (select)
  if (propertyMap.platform && post.platform) {
    props[propertyMap.platform] = { select: { name: post.platform } };
  }

  // Post Type (select)
  if (propertyMap.post_type && post.post_type) {
    props[propertyMap.post_type] = { select: { name: post.post_type } };
  }

  // Target ICP (select)
  if (propertyMap.target_icp && post.target_icp) {
    props[propertyMap.target_icp] = { select: { name: post.target_icp } };
  }

  // Tags (multi_select)
  if (propertyMap.tags && post.tags && post.tags.length > 0) {
    props[propertyMap.tags] = {
      multi_select: post.tags.map((t) => ({ name: t })),
    };
  }

  // Notes (rich_text)
  if (propertyMap.notes && post.notes) {
    props[propertyMap.notes] = {
      rich_text: chunkRichText(post.notes),
    };
  }

  // Impressions (number)
  if (propertyMap.impressions && post.impressions != null) {
    props[propertyMap.impressions] = { number: post.impressions };
  }

  // Likes (number)
  if (propertyMap.likes && post.likes != null) {
    props[propertyMap.likes] = { number: post.likes };
  }

  // Comments (number)
  if (propertyMap.comments && post.comments_count != null) {
    props[propertyMap.comments] = { number: post.comments_count };
  }

  return props;
}

/* ------------------------------------------------------------------ */
/*  Status mapping helpers                                             */
/* ------------------------------------------------------------------ */

export function mapNotionStatusToApp(notionStatus: string | null): string {
  if (!notionStatus) return "draft";
  const lower = notionStatus.toLowerCase();
  if (lower === "published" || lower === "posted" || lower === "live")
    return "published";
  if (lower === "scheduled") return "scheduled";
  // "Drafting", "Draft", "In Progress", etc. all map to draft
  return "draft";
}

export function mapAppStatusToNotionLabel(appStatus: string): string {
  // Returns the user-facing Notion label (preserves their convention)
  switch (appStatus) {
    case "published":
      return "Published";
    case "scheduled":
      return "Scheduled";
    default:
      return "Drafting";
  }
}

export function mapAppStatusToNotion(appStatus: string): string {
  switch (appStatus) {
    case "published":
      return "Published";
    case "scheduled":
      return "Scheduled";
    default:
      return "Drafting";
  }
}

/* ------------------------------------------------------------------ */
/*  Notion property readers                                            */
/* ------------------------------------------------------------------ */

function readTitle(
  props: Record<string, NotionProperty>,
  propName?: string
): string | null {
  if (!propName || !props[propName]) return null;
  const p = props[propName];
  if (p.type === "title" && Array.isArray(p.title)) {
    return p.title.map((t: { plain_text: string }) => t.plain_text).join("");
  }
  return null;
}

function readRichText(
  props: Record<string, NotionProperty>,
  propName?: string
): string | null {
  if (!propName || !props[propName]) return null;
  const p = props[propName];
  if (p.type === "rich_text" && Array.isArray(p.rich_text)) {
    return (
      p.rich_text.map((t: { plain_text: string }) => t.plain_text).join("") ||
      null
    );
  }
  return null;
}

function readSelect(
  props: Record<string, NotionProperty>,
  propName?: string
): string | null {
  if (!propName || !props[propName]) return null;
  const p = props[propName];
  if (p.type === "select" && p.select) {
    return p.select.name || null;
  }
  if (p.type === "status" && p.status) {
    return p.status.name || null;
  }
  return null;
}

function readMultiSelect(
  props: Record<string, NotionProperty>,
  propName?: string
): string[] {
  if (!propName || !props[propName]) return [];
  const p = props[propName];
  if (p.type === "multi_select" && Array.isArray(p.multi_select)) {
    return p.multi_select.map((s: { name: string }) => s.name);
  }
  return [];
}

function readDate(
  props: Record<string, NotionProperty>,
  propName?: string
): string | null {
  if (!propName || !props[propName]) return null;
  const p = props[propName];
  if (p.type === "date" && p.date) {
    return p.date.start || null;
  }
  return null;
}

function readUrl(
  props: Record<string, NotionProperty>,
  propName?: string
): string | null {
  if (!propName || !props[propName]) return null;
  const p = props[propName];
  if (p.type === "url") return p.url || null;
  // Fallback to rich_text
  if (p.type === "rich_text") return readRichText(props, propName);
  return null;
}

function readNumber(
  props: Record<string, NotionProperty>,
  propName?: string
): number | null {
  if (!propName || !props[propName]) return null;
  const p = props[propName];
  if (p.type === "number") return p.number ?? null;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Rich text chunking (Notion limits each text block to 2000 chars)   */
/* ------------------------------------------------------------------ */

function chunkRichText(
  text: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  const chunks = [];
  const MAX_LEN = 2000;
  for (let i = 0; i < text.length; i += MAX_LEN) {
    chunks.push({
      type: "text",
      text: { content: text.slice(i, i + MAX_LEN) },
    });
  }
  return chunks.length > 0
    ? chunks
    : [{ type: "text", text: { content: "" } }];
}
