/**
 * Read.ai API client for fetching meeting data.
 *
 * Read.ai exposes meeting reports via their REST API.
 * Docs: https://docs.read.ai/api
 */

const READAI_API_BASE = "https://api.read.ai/v1";

export interface ReadAiMeeting {
  id: string;
  title: string;
  start_time: string;
  end_time?: string;
  duration_minutes?: number;
  participants?: Array<{
    name: string;
    email?: string;
    role?: string;
  }>;
  summary?: string;
  transcript?: string;
  key_points?: string[];
  action_items?: Array<{
    text: string;
    assignee?: string;
    due_date?: string;
  }>;
  sentiment?: string;
  source_url?: string;
}

export interface ReadAiListResponse {
  meetings: ReadAiMeeting[];
  next_cursor?: string;
  has_more: boolean;
}

/**
 * Fetch meetings from Read.ai API with pagination and date filtering.
 */
export async function fetchReadAiMeetings(
  apiKey: string,
  options: {
    startDate?: string;
    endDate?: string;
    cursor?: string;
    limit?: number;
  } = {}
): Promise<ReadAiListResponse> {
  const params = new URLSearchParams();
  if (options.startDate) params.set("start_date", options.startDate);
  if (options.endDate) params.set("end_date", options.endDate);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));

  const res = await fetch(`${READAI_API_BASE}/meetings?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Read.ai API error (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Fetch a single meeting's full report including transcript.
 */
export async function fetchReadAiMeetingDetail(
  apiKey: string,
  meetingId: string
): Promise<ReadAiMeeting> {
  const res = await fetch(`${READAI_API_BASE}/meetings/${meetingId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Read.ai API error (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Validate a Read.ai API key by making a lightweight call.
 */
export async function validateReadAiKey(
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(`${READAI_API_BASE}/meetings?limit=1`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (res.ok) return { valid: true };
    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Invalid API key" };
    }
    return { valid: false, error: `API returned ${res.status}` };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

/**
 * Fetch all meetings in a date range (handles pagination).
 */
export async function fetchAllReadAiMeetings(
  apiKey: string,
  options: {
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<ReadAiMeeting[]> {
  const allMeetings: ReadAiMeeting[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await fetchReadAiMeetings(apiKey, {
      startDate: options.startDate,
      endDate: options.endDate,
      cursor,
      limit: 50,
    });

    allMeetings.push(...response.meetings);
    cursor = response.next_cursor;
    hasMore = response.has_more;
  }

  return allMeetings;
}

/**
 * Check if a meeting title matches exclusion patterns.
 */
export function shouldExcludeMeeting(
  title: string,
  excludePatterns: string[],
  includeKeywords: string[],
  excludeKeywords: string[]
): boolean {
  const lowerTitle = title.toLowerCase();

  // Check exclusion patterns (e.g., "1:1", "standup")
  for (const pattern of excludePatterns) {
    if (lowerTitle.includes(pattern.toLowerCase())) return true;
  }

  // Check exclude keywords
  for (const kw of excludeKeywords) {
    if (lowerTitle.includes(kw.toLowerCase())) return true;
  }

  // If include keywords are set, only include meetings matching them
  if (includeKeywords.length > 0) {
    return !includeKeywords.some((kw) =>
      lowerTitle.includes(kw.toLowerCase())
    );
  }

  return false;
}

/**
 * Redact participant names from text, replacing with generic labels.
 */
export function redactNames(
  text: string,
  participants: Array<{ name: string; email?: string }>
): string {
  let result = text;
  participants.forEach((p, i) => {
    if (p.name) {
      const nameRegex = new RegExp(escapeRegex(p.name), "gi");
      result = result.replace(nameRegex, `[Participant ${i + 1}]`);
    }
    if (p.email) {
      const emailRegex = new RegExp(escapeRegex(p.email), "gi");
      result = result.replace(emailRegex, `[email-${i + 1}]`);
    }
  });
  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
