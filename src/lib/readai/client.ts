/**
 * Read.ai utility functions for meeting data processing.
 *
 * Read.ai integration uses webhooks (not REST polling).
 * Meeting data is pushed to /api/readai/webhook when meetings end.
 * See: https://support.read.ai/hc/en-us/articles/16352415827219
 */

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
