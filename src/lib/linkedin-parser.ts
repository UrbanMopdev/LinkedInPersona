/**
 * LinkedIn profile data fetcher.
 *
 * Primary strategy: Proxycurl API (reliable, requires API key).
 * Fallback: direct HTML fetch (rarely works — LinkedIn blocks most
 * server-side requests with auth walls).
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LinkedInExperience {
  title: string;
  company: string;
  duration: string;
  description: string;
}

export interface LinkedInParseResult {
  headline: string | null;
  about: string | null;
  experience: LinkedInExperience[];
  posts: string[];
}

/* ------------------------------------------------------------------ */
/*  URL helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Normalize a handle or URL to a canonical LinkedIn profile URL.
 * Accepts:
 *   - "johndoe"
 *   - "@johndoe"
 *   - "https://www.linkedin.com/in/johndoe"
 *   - "linkedin.com/in/johndoe/"
 */
export function normalizeLinkedInUrl(input: string): string {
  const trimmed = input.trim();

  // Already a full URL
  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    // Ensure path starts with /in/
    const path = url.pathname.replace(/\/+$/, "");
    if (path.startsWith("/in/")) {
      const handle = path.replace(/^\/in\//, "").split("/")[0];
      return `https://www.linkedin.com/in/${handle}`;
    }
    // Might be a full profile URL without /in/, try extracting last segment
    const segments = path.split("/").filter(Boolean);
    const handle = segments[segments.length - 1];
    return `https://www.linkedin.com/in/${handle}`;
  }

  // Bare domain prefix
  if (/^(www\.)?linkedin\.com/i.test(trimmed)) {
    return normalizeLinkedInUrl("https://" + trimmed);
  }

  // Just a handle (strip leading @)
  const handle = trimmed.replace(/^@/, "").split("/")[0];
  return `https://www.linkedin.com/in/${handle}`;
}

/**
 * Extract the handle from a canonical LinkedIn URL.
 */
export function extractHandle(canonicalUrl: string): string {
  return canonicalUrl.replace("https://www.linkedin.com/in/", "");
}

/* ------------------------------------------------------------------ */
/*  Proxycurl API (primary strategy)                                   */
/* ------------------------------------------------------------------ */

/**
 * Fetch profile data via the Proxycurl API.
 * Requires PROXYCURL_API_KEY env var.
 * Returns null if the key is missing or the request fails.
 *
 * API docs: https://nubela.co/proxycurl/docs#people-api-person-profile-endpoint
 */
export async function fetchViaProxycurl(
  canonicalUrl: string,
): Promise<LinkedInParseResult | null> {
  const apiKey = process.env.PROXYCURL_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    linkedin_profile_url: canonicalUrl,
    use_cache: "if-recent",
    fallback_to_cache: "on-error",
  });

  const res = await fetch(
    `https://nubela.co/proxycurl/api/v2/linkedin?${params}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Proxycurl returned ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  const data = await res.json();

  // Map Proxycurl response → our standard shape
  const headline: string | null = data.headline || data.occupation || null;
  const about: string | null = data.summary || null;

  const experience: LinkedInExperience[] = [];
  if (Array.isArray(data.experiences)) {
    for (const exp of data.experiences) {
      const startDate = exp.starts_at
        ? `${exp.starts_at.month || ""}/${exp.starts_at.year || ""}`
        : "";
      const endDate = exp.ends_at
        ? `${exp.ends_at.month || ""}/${exp.ends_at.year || ""}`
        : "Present";
      experience.push({
        title: exp.title || "",
        company: exp.company || "",
        duration: startDate ? `${startDate} – ${endDate}` : "",
        description: exp.description || "",
      });
    }
  }

  // Proxycurl doesn't return post content in the person-profile endpoint
  const posts: string[] = [];

  return { headline, about, experience, posts };
}

/* ------------------------------------------------------------------ */
/*  Text cleaning                                                      */
/* ------------------------------------------------------------------ */

/**
 * Remove UI boilerplate, collapse whitespace, normalise paragraphs.
 */
export function cleanText(raw: string): string {
  return (
    raw
      // Strip common LinkedIn UI artefacts
      .replace(/…see more/gi, "")
      .replace(/…?see less/gi, "")
      .replace(/Show \d+ more (experience|education|skill|certification)s?/gi, "")
      .replace(/\d+ reactions?/gi, "")
      .replace(/\d+ comments?/gi, "")
      .replace(/\d+ reposts?/gi, "")
      .replace(/Like\s*Comment\s*Repost\s*Send/gi, "")
      // Collapse whitespace but preserve paragraph breaks
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/* ------------------------------------------------------------------ */
/*  HTML fetching                                                      */
/* ------------------------------------------------------------------ */

const REALISTIC_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export async function fetchLinkedInHtml(
  canonicalUrl: string,
): Promise<string> {
  const res = await fetch(canonicalUrl, {
    headers: REALISTIC_HEADERS,
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(
      `LinkedIn returned ${res.status}. The profile may be private or the URL incorrect.`,
    );
  }

  const html = await res.text();

  // Detect auth wall — LinkedIn returns 200 with a login page
  if (isAuthWall(html)) {
    throw new Error(
      "LinkedIn returned an auth wall instead of profile data. " +
        "Direct HTML fetching is blocked. Use Proxycurl API or paste profile data manually.",
    );
  }

  return html;
}

/**
 * Check if the returned HTML is an auth wall / login page
 * rather than actual profile data.
 */
function isAuthWall(html: string): boolean {
  const markers = [
    "sign in",
    "authwall",
    "auth_wall",
    "login-form",
    "join now",
    'action="/uas/login',
    "uas/login-submit",
    "session_redirect",
  ];
  const lower = html.toLowerCase();
  // If the page has multiple auth markers and no JSON-LD Person data, it's an auth wall
  const authHits = markers.filter((m) => lower.includes(m)).length;
  const hasJsonLd =
    lower.includes('"@type":"person"') ||
    lower.includes('"@type": "person"');
  return authHits >= 2 && !hasJsonLd;
}

/* ------------------------------------------------------------------ */
/*  HTML parsing                                                       */
/* ------------------------------------------------------------------ */

/**
 * Extract a meta tag value by name or property attribute.
 */
function metaContent(html: string, attr: string): string | null {
  // Try name="attr" and property="attr"
  for (const key of ["name", "property"]) {
    const re = new RegExp(
      `<meta\\s[^>]*${key}=["']${attr}["'][^>]*content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re);
    if (m) return cleanText(decodeHtmlEntities(m[1]));

    // Also try content first, then name/property
    const re2 = new RegExp(
      `<meta\\s[^>]*content=["']([^"']+)["'][^>]*${key}=["']${attr}["']`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2) return cleanText(decodeHtmlEntities(m2[1]));
  }
  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

/**
 * Try to extract JSON-LD data from the page.
 */
function extractJsonLd(html: string): Record<string, unknown> | null {
  const re =
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      // LinkedIn JSON-LD is usually a Person or array
      if (data["@type"] === "Person" || data["@type"] === "ProfilePage") {
        return data as Record<string, unknown>;
      }
      if (Array.isArray(data)) {
        const person = data.find(
          (d: Record<string, unknown>) =>
            d["@type"] === "Person" || d["@type"] === "ProfilePage",
        );
        if (person) return person as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Extract experience entries from HTML.
 */
function parseExperience(html: string): LinkedInExperience[] {
  const experiences: LinkedInExperience[] = [];

  // Strategy: Look for experience section in common LinkedIn patterns
  // LinkedIn public profiles often have structured sections with class-based markers

  // Try JSON-LD first
  const jsonLd = extractJsonLd(html);
  if (jsonLd) {
    const workItems = (jsonLd.worksFor ||
      jsonLd.alumniOf ||
      jsonLd.memberOf) as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(workItems)) {
      for (const item of workItems) {
        experiences.push({
          title: String(item.jobTitle || item.roleName || ""),
          company: String(
            item.name ||
              (item.organization as Record<string, unknown>)?.name ||
              "",
          ),
          duration: String(item.description || ""),
          description: "",
        });
      }
    }
  }

  // Fallback: regex-based extraction from section content
  if (experiences.length === 0) {
    // Look for experience section patterns
    const expSectionRe =
      /experience[\s\S]*?<\/section>/gi;
    const sectionMatch = html.match(expSectionRe);
    if (sectionMatch) {
      const section = sectionMatch[0];
      // Extract individual role blocks - look for h3/h4 tags with titles
      const roleRe =
        /<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/gi;
      let roleMatch;
      while ((roleMatch = roleRe.exec(section)) !== null) {
        const title = cleanText(stripTags(roleMatch[1]));
        const company = cleanText(stripTags(roleMatch[2]));
        if (title || company) {
          experiences.push({ title, company, duration: "", description: "" });
        }
      }
    }
  }

  return experiences;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/**
 * Extract post texts from profile HTML.
 * LinkedIn public profiles may show recent activity/posts.
 */
function parsePosts(html: string): string[] {
  const posts: string[] = [];
  const seen = new Set<string>();

  // Look for post content in various patterns LinkedIn uses
  // Pattern 1: data-urn based post containers
  const postContentRe =
    /<div[^>]*class="[^"]*feed-shared-text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = postContentRe.exec(html)) !== null) {
    const text = cleanText(stripTags(match[1]));
    if (text.length > 30 && !seen.has(text)) {
      seen.add(text);
      posts.push(text);
    }
  }

  // Pattern 2: article or share-update containers
  const shareRe =
    /<div[^>]*class="[^"]*update-components-text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  while ((match = shareRe.exec(html)) !== null) {
    const text = cleanText(stripTags(match[1]));
    if (text.length > 30 && !seen.has(text)) {
      seen.add(text);
      posts.push(text);
    }
  }

  // Pattern 3: generic activity section content blocks
  const activityRe =
    /<span[^>]*class="[^"]*break-words[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  while ((match = activityRe.exec(html)) !== null) {
    const text = cleanText(stripTags(match[1]));
    // Only take substantial text blocks that look like posts
    if (
      text.length > 80 &&
      !seen.has(text) &&
      !text.includes("Sign in") &&
      !text.includes("Join now")
    ) {
      seen.add(text);
      posts.push(text);
    }
  }

  // Cap at 30 posts
  return posts.slice(0, 30);
}

/**
 * Main parse function — orchestrates all extraction strategies.
 */
export function parseLinkedInHtml(html: string): LinkedInParseResult {
  // --- Headline ---
  let headline =
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title") ||
    null;

  // JSON-LD may have better headline
  const jsonLd = extractJsonLd(html);
  if (jsonLd) {
    const jlHeadline =
      (jsonLd.jobTitle as string) || (jsonLd.headline as string);
    if (jlHeadline) headline = cleanText(jlHeadline);
  }

  // Try to extract a more specific headline from profile section
  const headlineRe =
    /<div[^>]*class="[^"]*text-body-medium[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
  const headlineMatch = html.match(headlineRe);
  if (headlineMatch) {
    const extracted = cleanText(stripTags(headlineMatch[1]));
    if (extracted.length > 5 && extracted.length < 300) {
      headline = extracted;
    }
  }

  // --- About / Summary ---
  let about =
    metaContent(html, "og:description") ||
    metaContent(html, "description") ||
    null;

  if (jsonLd && jsonLd.description) {
    about = cleanText(String(jsonLd.description));
  }

  // Try to extract a longer about section
  const aboutRe =
    /about[\s\S]*?<div[^>]*class="[^"]*inline-show-more-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
  const aboutMatch = html.match(aboutRe);
  if (aboutMatch) {
    const extracted = cleanText(stripTags(aboutMatch[1]));
    if (extracted.length > (about?.length || 0)) {
      about = extracted;
    }
  }

  // --- Experience ---
  const experience = parseExperience(html);

  // --- Posts ---
  const posts = parsePosts(html);

  return { headline, about, experience, posts };
}
