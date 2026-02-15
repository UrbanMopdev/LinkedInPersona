/**
 * LinkedIn profile parser — works on plain text that users copy-paste
 * directly from their LinkedIn profile page (Select All → Copy → Paste).
 *
 * No scraping, no API keys, no cost. Users own their data.
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

export interface LinkedInEducation {
  school: string;
  degree: string;
  years: string;
}

export interface LinkedInPost {
  content: string;
  reactions: number;
  comments: number;
}

export interface LinkedInProfileData {
  name: string | null;
  headline: string | null;
  location: string | null;
  about: string | null;
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  posts: LinkedInPost[];
  rawPostTexts: string[];
}

/* ------------------------------------------------------------------ */
/*  Section splitting                                                  */
/* ------------------------------------------------------------------ */

/**
 * LinkedIn's copy-paste output uses recognisable section headings.
 * We split on these to isolate each block of content.
 */
const SECTION_HEADINGS = [
  "About",
  "Activity",
  "Experience",
  "Education",
  "Licenses & certifications",
  "Skills",
  "Recommendations",
  "Courses",
  "Projects",
  "Honors & awards",
  "Publications",
  "Languages",
  "Volunteer experience",
  "Interests",
  "Organizations",
];

/** Build a regex that matches section headings on their own line. */
function sectionSplitRegex(): RegExp {
  const escaped = SECTION_HEADINGS.map((h) =>
    h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  // Match heading on its own line (possibly with whitespace around it)
  return new RegExp(`^\\s*(${escaped.join("|")})\\s*$`, "mi");
}

interface Section {
  heading: string;
  body: string;
}

function splitIntoSections(text: string): {
  header: string;
  sections: Section[];
} {
  const regex = sectionSplitRegex();
  const lines = text.split("\n");
  const sections: Section[] = [];
  let headerLines: string[] = [];
  let currentHeading: string | null = null;
  let currentBody: string[] = [];
  let foundFirst = false;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          body: currentBody.join("\n").trim(),
        });
      } else if (!foundFirst) {
        headerLines = [...currentBody];
      }
      currentHeading = match[1].trim();
      currentBody = [];
      foundFirst = true;
    } else {
      currentBody.push(line);
    }
  }
  // Push last section
  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      body: currentBody.join("\n").trim(),
    });
  }
  if (!foundFirst) {
    headerLines = currentBody;
  }

  return { header: headerLines.join("\n").trim(), sections };
}

/* ------------------------------------------------------------------ */
/*  Text cleaning                                                      */
/* ------------------------------------------------------------------ */

export function cleanText(raw: string): string {
  return raw
    .replace(/…see more/gi, "")
    .replace(/…?see less/gi, "")
    .replace(
      /Show \d+ more (experience|education|skill|certification)s?/gi,
      "",
    )
    .replace(/Like\s*Comment\s*Repost\s*Send/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip lines that are pure LinkedIn UI chrome. */
function isUiNoise(line: string): boolean {
  const l = line.trim().toLowerCase();
  return (
    l === "" ||
    l === "skip to main content" ||
    l === "linkedin" ||
    l === "search" ||
    l === "messaging" ||
    l === "notifications" ||
    /^(home|my network|jobs|messaging|notifications|me|for business|post)$/i.test(l) ||
    /^\d+\s*(new\s*)?(notification|message)s?$/i.test(l) ||
    l === "open to" ||
    l === "show all" ||
    l === "more" ||
    l === "contact info" ||
    l === "see all activity" ||
    l === "connect" ||
    l === "follow" ||
    l === "message" ||
    /^see (all|more) \d+/i.test(l) ||
    /^show all \d+/i.test(l) ||
    l === "people also viewed" ||
    l === "people you may know"
  );
}

/* ------------------------------------------------------------------ */
/*  Header parser (name, headline, location)                           */
/* ------------------------------------------------------------------ */

function parseHeader(header: string): {
  name: string | null;
  headline: string | null;
  location: string | null;
} {
  const lines = header
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !isUiNoise(l));

  let name: string | null = null;
  let headline: string | null = null;
  let location: string | null = null;

  // After filtering noise, the first meaningful line is typically the name.
  // The next line (that doesn't look like a connection count or location) is the headline.
  // Location often contains a comma or "Area" or known patterns.
  for (let i = 0; i < lines.length && i < 15; i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip connection counts
    if (/^\d+\+?\s*connections?$/i.test(line)) continue;
    if (/^\d+\+?\s*followers?$/i.test(line)) continue;
    if (/^(1st|2nd|3rd)\s*degree/i.test(line)) continue;

    if (!name) {
      // Name is usually 2-5 words, no special characters
      if (
        line.length > 1 &&
        line.length < 80 &&
        !line.includes("|") &&
        !line.includes("·")
      ) {
        name = line;
        continue;
      }
    }

    if (!headline) {
      // Headline is usually longer, may contain | or special chars
      if (line.length > 3 && line.length < 300) {
        headline = line;
        continue;
      }
    }

    if (!location) {
      // Location patterns: "City, State" or "City, Country" or "X Area"
      if (
        /,/.test(line) &&
        line.length < 100 &&
        !/^\d/.test(line) &&
        !line.includes("|")
      ) {
        location = line.replace(/\s*·\s*Contact info.*$/i, "").trim();
        break;
      }
      if (/area$/i.test(line)) {
        location = line;
        break;
      }
    }
  }

  return { name, headline, location };
}

/* ------------------------------------------------------------------ */
/*  About parser                                                       */
/* ------------------------------------------------------------------ */

function parseAbout(body: string): string | null {
  const cleaned = cleanText(body);
  if (cleaned.length < 5) return null;
  return cleaned;
}

/* ------------------------------------------------------------------ */
/*  Experience parser                                                  */
/* ------------------------------------------------------------------ */

/**
 * LinkedIn experience copy-paste typically looks like:
 *
 *   VP of Marketing
 *   Acme Corp · Full-time
 *   Jan 2020 - Present · 4 yrs 2 mos
 *   San Francisco, California, United States
 *
 *   Did X, Y, Z...
 *
 * Or for grouped roles under one company:
 *
 *   Acme Corp
 *   6 yrs
 *   VP of Marketing
 *   Jan 2020 - Present · 4 yrs
 *   Senior Manager
 *   Jun 2017 - Dec 2019 · 2 yrs
 */

const DATE_RANGE_RE =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}\s*[-–]\s*(present|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/i;
const DURATION_RE = /·?\s*\d+\s*(yr|mo|year|month)s?/i;
const EMPLOYMENT_TYPE_RE =
  /·\s*(Full-time|Part-time|Contract|Freelance|Self-employed|Internship|Seasonal|Apprenticeship)/i;

function parseExperienceSection(body: string): LinkedInExperience[] {
  const experiences: LinkedInExperience[] = [];
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip UI noise
    if (isUiNoise(line) || /^logo$/i.test(line) || /^show all/i.test(line)) {
      i++;
      continue;
    }

    // Try to detect if this line is a role title (next line might be company)
    // or a company name (next lines are grouped roles)
    const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
    const lineAfter = i + 2 < lines.length ? lines[i + 2] : "";

    // Pattern: Title on one line, Company · Employment type on next
    if (
      EMPLOYMENT_TYPE_RE.test(nextLine) ||
      (nextLine && !DATE_RANGE_RE.test(line) && DATE_RANGE_RE.test(lineAfter))
    ) {
      const title = line;
      const company = nextLine
        .replace(EMPLOYMENT_TYPE_RE, "")
        .replace(/·\s*$/, "")
        .trim();
      i += 2;

      // Pick up duration line
      let duration = "";
      if (i < lines.length && DATE_RANGE_RE.test(lines[i])) {
        duration = lines[i].replace(DURATION_RE, "").trim();
        const durMatch = lines[i].match(DURATION_RE);
        if (durMatch) duration = lines[i].trim();
        i++;
      }

      // Skip location line
      if (
        i < lines.length &&
        /,/.test(lines[i]) &&
        lines[i].length < 80 &&
        !DATE_RANGE_RE.test(lines[i])
      ) {
        i++;
      }

      // Pick up description lines until next role or section noise
      let description = "";
      const descLines: string[] = [];
      while (i < lines.length) {
        const dl = lines[i];
        if (
          isUiNoise(dl) ||
          EMPLOYMENT_TYPE_RE.test(dl) ||
          /^logo$/i.test(dl) ||
          /^show all/i.test(dl)
        ) {
          break;
        }
        // Check if this looks like a new role title
        // (next line has employment type or date range)
        const peekNext = i + 1 < lines.length ? lines[i + 1] : "";
        const peekAfter = i + 2 < lines.length ? lines[i + 2] : "";
        if (
          EMPLOYMENT_TYPE_RE.test(peekNext) ||
          (peekNext &&
            !DATE_RANGE_RE.test(dl) &&
            DATE_RANGE_RE.test(peekAfter))
        ) {
          break;
        }
        if (DATE_RANGE_RE.test(dl)) break;
        descLines.push(dl);
        i++;
      }
      description = descLines.join("\n").trim();

      experiences.push({
        title,
        company,
        duration,
        description: cleanText(description),
      });
      continue;
    }

    // Fallback: skip unrecognised lines
    i++;
  }

  return experiences;
}

/* ------------------------------------------------------------------ */
/*  Education parser                                                   */
/* ------------------------------------------------------------------ */

function parseEducationSection(body: string): LinkedInEducation[] {
  const education: LinkedInEducation[] = [];
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isUiNoise(l) && !/^logo$/i.test(l));

  let i = 0;
  while (i < lines.length) {
    const school = lines[i];
    i++;

    let degree = "";
    let years = "";

    // Next line might be degree
    if (i < lines.length && !/^\d{4}/.test(lines[i])) {
      degree = lines[i];
      i++;
    }

    // Next line might be year range
    if (i < lines.length && /\d{4}/.test(lines[i])) {
      years = lines[i];
      i++;
    }

    // Skip activity/description lines
    while (
      i < lines.length &&
      !isUiNoise(lines[i]) &&
      !/^[A-Z]/.test(lines[i])
    ) {
      i++;
    }

    if (school && school.length < 200) {
      education.push({ school, degree, years });
    }
  }

  return education;
}

/* ------------------------------------------------------------------ */
/*  Posts parser (from pasted activity page)                           */
/* ------------------------------------------------------------------ */

const ENGAGEMENT_RE = /^(\d[\d,]*)\s*(reaction|comment|repost|like|view)s?/i;
const TIMESTAMP_RE =
  /^\d+\s*(mo|d|h|w|yr|min|hour|day|week|month|year)s?\s*(ago)?$/i;

export function parsePastedPosts(raw: string): LinkedInPost[] {
  const posts: LinkedInPost[] = [];
  const lines = raw.split("\n");

  // Strategy: accumulate text lines, then when we hit engagement counts
  // or a clear break (repeated author name), flush the accumulated post.
  let accum: string[] = [];
  let currentReactions = 0;
  let currentComments = 0;

  function flush() {
    const text = accum
      .join("\n")
      .replace(/…see more/gi, "")
      .replace(/…?see less/gi, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text.length > 20) {
      posts.push({
        content: text,
        reactions: currentReactions,
        comments: currentComments,
      });
    }
    accum = [];
    currentReactions = 0;
    currentComments = 0;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty
    if (!line) continue;

    // Skip obvious UI noise
    if (isUiNoise(line)) continue;
    if (/^Like\s*Comment\s*Repost\s*Send$/i.test(line)) continue;
    if (/^(Like|Comment|Repost|Send|Share|Celebrate|Support|Love|Insightful|Funny)$/i.test(line)) continue;
    if (TIMESTAMP_RE.test(line)) continue;
    if (/^(1st|2nd|3rd)\s*degree/i.test(line)) continue;
    if (/^\d+\+?\s*(follower|connection)s?$/i.test(line)) continue;

    // Check for engagement line
    const engMatch = line.match(
      /^(\d[\d,]*)\s*(reaction|like)s?(?:\s*·\s*(\d[\d,]*)\s*(comment)s?)?/i,
    );
    if (engMatch) {
      currentReactions = parseInt(engMatch[1].replace(/,/g, ""), 10);
      if (engMatch[3]) {
        currentComments = parseInt(engMatch[3].replace(/,/g, ""), 10);
      }
      flush();
      continue;
    }

    // Separate engagement line for just comments
    const commentMatch = line.match(/^(\d[\d,]*)\s*comments?$/i);
    if (commentMatch) {
      currentComments = parseInt(commentMatch[1].replace(/,/g, ""), 10);
      flush();
      continue;
    }

    // Detect "Author Name\n1st degree" pattern as a post separator
    // If next meaningful content starts looking like a new post header, flush
    if (
      accum.length > 3 &&
      line.length < 60 &&
      !line.includes(".") &&
      !line.includes(",") &&
      /^[A-Z][a-z]+ [A-Z]/.test(line)
    ) {
      // Looks like a new author name — flush previous post
      flush();
      continue;
    }

    accum.push(line);
  }

  // Flush any remaining content
  flush();

  return posts.slice(0, 50);
}

/* ------------------------------------------------------------------ */
/*  Main parser: pasted profile text                                   */
/* ------------------------------------------------------------------ */

export function parseLinkedInPastedProfile(raw: string): LinkedInProfileData {
  const { header, sections } = splitIntoSections(raw);
  const { name, headline, location } = parseHeader(header);

  let about: string | null = null;
  let experience: LinkedInExperience[] = [];
  let education: LinkedInEducation[] = [];
  const posts: LinkedInPost[] = [];
  const rawPostTexts: string[] = [];

  for (const section of sections) {
    const h = section.heading.toLowerCase();

    if (h === "about") {
      about = parseAbout(section.body);
    } else if (h === "experience") {
      experience = parseExperienceSection(section.body);
    } else if (h === "education") {
      education = parseEducationSection(section.body);
    } else if (h === "activity") {
      // Activity section on profile page may have a few recent posts
      const activityPosts = parsePastedPosts(section.body);
      posts.push(...activityPosts);
      rawPostTexts.push(...activityPosts.map((p) => p.content));
    }
  }

  return {
    name,
    headline,
    location,
    about,
    experience,
    education,
    posts,
    rawPostTexts,
  };
}

/* ------------------------------------------------------------------ */
/*  URL helpers (kept for profile link storage)                        */
/* ------------------------------------------------------------------ */

export function normalizeLinkedInUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, "");
    if (path.startsWith("/in/")) {
      const handle = path.replace(/^\/in\//, "").split("/")[0];
      return `https://www.linkedin.com/in/${handle}`;
    }
    const segments = path.split("/").filter(Boolean);
    const handle = segments[segments.length - 1];
    return `https://www.linkedin.com/in/${handle}`;
  }
  if (/^(www\.)?linkedin\.com/i.test(trimmed)) {
    return normalizeLinkedInUrl("https://" + trimmed);
  }
  const handle = trimmed.replace(/^@/, "").split("/")[0];
  return `https://www.linkedin.com/in/${handle}`;
}
