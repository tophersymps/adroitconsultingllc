import fs from "fs";
import path from "path";
import { learnLessons, learnSeries } from "@/data/learn";
import { LearnLesson, LearnCardSeries, LearningSeries } from "@/data/types";
import { sortLessonsByLessonNumber } from "@/lib/lesson-sort";

/**
 * Learn tab data-access seam (ADR-002, superseded for lesson listings by
 * ADR-105).
 *
 * Ordering contract:
 *  - LESSON listings (series syllabus) are ordered by LESSON NUMBER ascending
 *    (ADR-105, course progression pattern) — NOT date. build-learn.js enforces
 *    this at generation time; getLessonsForSeries re-sorts defensively so a
 *    component can never accidentally render stale order. Missing lesson
 *    numbers (0) sort last, stable.
 *  - SERIES-level listings (learn hub PathCards) stay activity-based (newest
 *    lesson date desc) — unchanged.
 */

function dateTime(date: string): number {
  if (!date || date === "Date unknown") return -Infinity;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

/** All series, newest-activity first (defensive re-sort by newest lesson). */
export function getAllSeries(): LearningSeries[] {
  return [...learnSeries].sort((a, b) => {
    const aNewest = a.lessons.length
      ? Math.max(...a.lessons.map((l) => dateTime(l.date)))
      : -Infinity;
    const bNewest = b.lessons.length
      ? Math.max(...b.lessons.map((l) => dateTime(l.date)))
      : -Infinity;
    if (bNewest !== aNewest) return bNewest - aNewest;
    return a.slug.localeCompare(b.slug);
  });
}

/**
 * Slim the full LearningSeries to the card-level LearnCardSeries projection
 * for the /learn hub (guest hardening t_3dbf4826). Per-lesson metadata
 * (slug/title/excerpt/date/author/readTime/tags) never crosses into the client
 * bundle — guests receive only what the PathCard renders. `includeLessonSlugs`
 * opts into the lesson-slug list for signed-in cards (SeriesProgress) only.
 */
export function toLearnCardSeries(
  s: LearningSeries,
  opts: { includeLessonSlugs?: boolean } = {},
): LearnCardSeries {
  return {
    slug: s.slug,
    name: s.name,
    description: s.description,
    gradient: s.gradient,
    lessonCount: s.lessons.length,
    totalLessons: s.totalLessons,
    curriculumLessons: s.curriculumLessons,
    lessonSlugs: opts.includeLessonSlugs
      ? s.lessons.map((l) => l.slug)
      : [],
    // Content-derived series carry NO org (ADR-207) — the hub page populates
    // these from the DB-backed CatalogCourse via buildCatalogCourse.
    section: null,
    group: null,
    track: null,
    level: null,
    sortOrder: null,
    difficulty: null,
    canAccess: false,
  };
}

export function getSeriesBySlug(slug: string): LearningSeries | undefined {
  return learnSeries.find((s) => s.slug === slug);
}

/** Lessons for a series, defensively LESSON-NUMBER ASC (ADR-105). */
export function getLessonsForSeries(slug: string): LearnLesson[] {
  const series = getSeriesBySlug(slug);
  if (!series) return [];
  return sortLessonsByLessonNumber(series.lessons);
}

/** Scoped lookup — no cross-series slug bleed. */
export function getLesson(
  series: string,
  slug: string,
): LearnLesson | undefined {
  return learnLessons.find((l) => l.series === series && l.slug === slug);
}

/**
 * Resolve the series slug a canonical lesson slug belongs to (first match
 * across published lessons). Used by the progress APIs to gate a lesson write
 * against the access seam (a lesson can't be completed in a course the user
 * can't read). Returns undefined when the slug isn't a published lesson.
 */
export function findSeriesForLessonSlug(slug: string): string | undefined {
  return learnLessons.find((l) => l.slug === slug)?.series;
}

/**
 * All canonical lesson slugs across EVERY series: the union of published
 * lesson data (learnLessons) and the generator's planned per-lesson question
 * files (content/learn/<series>/questions/<slug>.json — the same planned set
 * the certificate rule counts against). The lesson-completion API rejects
 * slugs outside this set so completion cannot be marked for non-existent or
 * foreign lessons (security t_7469e31d F5). Falls back to published data
 * when content files are absent (e.g. tests/build without content checkout).
 */
export function getAllCanonicalLessonSlugs(): Set<string> {
  const slugs = new Set<string>();
  for (const lesson of learnLessons) slugs.add(lesson.slug);

  const learnRoot = path.join(process.cwd(), "content", "learn");
  let seriesDirs: fs.Dirent[] = [];
  try {
    seriesDirs = fs.readdirSync(learnRoot, { withFileTypes: true });
  } catch {
    return slugs;
  }
  for (const dir of seriesDirs) {
    if (!dir.isDirectory()) continue;
    let files: string[];
    try {
      files = fs.readdirSync(path.join(learnRoot, dir.name, "questions"));
    } catch {
      continue; // no per-lesson questions for this series
    }
    for (const f of files) {
      if (f.endsWith(".json")) slugs.add(f.replace(/\.json$/, ""));
    }
  }
  return slugs;
}

/** Read the raw MDX content for a learn lesson (mirrors lib/mdx.ts). */
export function getLearnMDXContent(
  series: string,
  slug: string,
): string | null {
  const mdxPath = path.join(
    process.cwd(),
    "content",
    "learn",
    series,
    `${slug}.mdx`,
  );
  try {
    return fs.readFileSync(mdxPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Strip the `---` frontmatter block from raw MDX before rendering.
 * (The blog renderer passes raw content through and renders the frontmatter
 * blob as a heading — pre-existing behavior we do NOT replicate for Learn.)
 */
export function stripMDXFrontmatter(raw: string): string {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return raw;
  return lines.slice(end + 1).join("\n");
}

/** All MDX slugs available in a series dir (mirrors lib/mdx.ts). */
export function getAllLearnMDXSlugs(series: string): string[] {
  const dir = path.join(process.cwd(), "content", "learn", series);
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".mdx"))
      .map((f) => f.replace(/\.mdx$/, ""));
  } catch {
    return [];
  }
}

/** Display helper — "Date unknown" passes through. */
export function formatLessonDate(date: string): string {
  return date;
}

/**
 * ISO-8601 for structured data / Open Graph (datePublished, published_time).
 * Lesson dates are authored as human-readable "Month DD, YYYY" (e.g.
 * "August 04, 2026"); JSON-LD and og:article:published_time require a
 * machine-readable ISO-8601 timestamp (t_fa2f15c7). Emits the timezone-free
 * full-date form (YYYY-MM-DD) so the authored calendar day never shifts by the
 * host's UTC offset. Falls back to the raw string when unparseable so
 * "Date unknown" survives without an invalid date.
 */
export function toIsoDate(date: string): string {
  if (!date || date === "Date unknown") return date;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Progress derivation (ADR-004): published = lessons present,
 * total = highest lesson number in the series (NOT hardcoded "90").
 *
 * `curriculum` is the series' FINAL planned lesson count (curriculumLessons),
 * which Phase 1 (Hubble Field hardening) makes stable and declared. It is the
 * number that sizes the constellation and the number the publisher is working
 * toward; `total - published` is the number of lessons still to come, whereas
 * `totalLessons - published` is ~0 because totalLessons == highest published.
 */
export function getSeriesProgress(series: LearningSeries): {
  published: number;
  total: number;
  /** Final planned lesson count (curriculumLessons) — stable, never shrinks. */
  curriculum: number;
} {
  return {
    published: series.lessons.length,
    total: series.totalLessons,
    curriculum: series.curriculumLessons ?? series.totalLessons,
  };
}

/** Short display label for a series (band tag pill). */
export function seriesShortLabel(slug: string): string {
  const map: Record<string, string> = {
    "salesforce-architect": "Salesforce",
    "agentic-ai": "Agentic AI",
    "omni-studio-cert": "OmniStudio",
    "ai-at-work": "AI at Work",
  };
  if (map[slug]) return map[slug];
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Avatar initials from an author name ("Adroit Consulting" → "AC"). */
export function getAuthorInitials(author: string): string {
  const words = author.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "AC";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
