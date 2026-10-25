export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categoryColor: "sf" | "react" | "ai" | "mkt" | "ux" | "pm";
  categoryGradient: string;
  date: string;
  author: string;
  authorInitials: string;
  readTime: string;
  featured?: boolean;
  tags: string[];
  /** Optional banner image path (public/) — gradient fallback when absent. */
  bannerImage?: string;
  /**
   * Optional OG/social card path (public/), 1200x630 JPEG. Kept separate from
   * `bannerImage` because the on-page banner is a 1600px WebP while social
   * scrapers still want a raster PNG/JPEG at a 1.91:1 ratio. Falls back to
   * `bannerImage` when absent.
   */
  ogImage?: string;
  /** Optional draft flag: "draft" is excluded from public build data. Default "published". */
  status?: "draft" | "published";
}

/** A single lesson MDX file under content/learn/<series>/<slug>.mdx */
export interface LearnLesson {
  /** URL slug — equals MDX filename; falls back to frontmatter `slug` */
  slug: string;
  /** Frontmatter title */
  title: string;
  /** Series slug — directory name under content/learn/, e.g. "salesforce-architect" */
  series: string;
  /** Sequence int from frontmatter — defines intended order ("Lesson N of M") */
  lesson: number;
  /** Frontmatter excerpt */
  excerpt: string;
  /** Display date, canonical "Month DD, YYYY"; "Date unknown" when unparseable */
  date: string;
  /** Frontmatter author; default "Adroit Consulting" */
  author: string;
  /** e.g. "5 min read"; default if missing */
  readTime: string;
  /** Frontmatter tags */
  tags: string[];
  /** Optional draft flag: "draft" is excluded from public build data. Default "published". */
  status?: "draft" | "published";
}

/**
 * What kind of exam a series ends in. Decided per series from content evidence
 * (does the exam mirror an official vendor blueprint?), never inferred from the
 * series' catalog `group` label — see `deliverables/learn-ux-exam-naming/`.
 *
 * - `course-completion`   — Adroit-authored course; the exam earns a course
 *                           completion certificate.
 * - `certification-prep`  — prep for an official vendor certification exam.
 */
export type ExamKind = "course-completion" | "certification-prep";

/** A learning track — one directory under content/learn/ */
export interface LearningSeries {
  /** Series slug — equals content/learn/<series>/ dir name */
  slug: string;
  /** Display name from series.json; fallback: humanized slug */
  name: string;
  /** One-line description from series.json; fallback: "" */
  description: string;
  /**
   * Exam kind from `series.json` — REQUIRED. `scripts/build-learn.js` fails the
   * build when it is missing or not one of the two `ExamKind` values, so every
   * generated series carries it and consumers can rely on it being present.
   */
  examKind: ExamKind;
  /** Tailwind gradient classes for card headers, e.g. "from-sky to-blue-600"; fallback: "from-navy to-navy-light" */
  gradient: string;
  /** Lessons sorted NEWEST FIRST (date desc) — enforced by build-learn.js AND lib/learn.ts */
  lessons: LearnLesson[];
  /** Highest lesson number present (BA decision: NOT hardcoded "90") */
  totalLessons: number;
  /**
   * The curriculum's final planned lesson count, from `series.json`.
   *
   * Distinct from `totalLessons`, which is the highest lesson number that
   * currently exists and therefore grows as lessons land. Use this wherever a
   * *stable* course size is needed — the star chart sizes a course's
   * constellation from it — and `totalLessons` for "published so far" counts and
   * certificate gating. Falls back to `totalLessons` when undeclared. Authors
   * set this in `series.json` when they know the finish line; do not invent one.
   */
  curriculumLessons: number;
}

/**
 * Slim series projection for the /atlas hub card grid (guest hardening
 * t_3dbf4826). Carries ONLY what the PathCard + filters render — the per-lesson
 * metadata (slug/title/excerpt/date/author/readTime/tags) is never shipped to
 * the client. `lessonSlugs` is populated for signed-in cards (SeriesProgress)
 * and always empty for guests.
 *
 * Learn Platform v2 (migration 009 / ADR-210): the org fields (section/group/
 * track/level/sortOrder/difficulty) come from the DB-backed CatalogCourse via
 * the unified catalog builder — NOT from series.json. `group`/`subgroup`
 * content fields were removed (ADR-207).
 */
export interface LearnCardSeries {
  /** Series slug — link target + card label. */
  slug: string;
  /** Display name from series.json. */
  name: string;
  /** One-line description from series.json. */
  description: string;
  /** Tailwind gradient classes for card headers. */
  gradient: string;
  /**
   * Short band label ("Salesforce", "Agentic AI", …), resolved SERVER-SIDE from
   * the single map in `src/lib/learn.ts` (ADR-221). Optional so fixtures and
   * older producers still typecheck; the card falls back to
   * `humanizeSeriesSlug(slug)` when absent. Never add a client-side label map
   * to fill this in — the whole point is that stealth labels leave the bundle.
   */
  shortLabel?: string;
  /** Published lesson count — "{n} / {total} lessons" badge. */
  lessonCount: number;
  /** Total (incl. unpublished) lesson count from series.json. */
  totalLessons: number;
  /**
   * The curriculum's final planned lesson count. Optional on the card
   * projection: cards render "{n} / {total}" from `totalLessons`, and only the
   * star chart needs the stable size. See `LearningSeries.curriculumLessons`.
   */
  curriculumLessons?: number;
  /** Lesson slugs — signed-in only (SeriesProgress); empty for guests. */
  lessonSlugs: string[];
  /* ---- Learn v2 org (DB-derived via CatalogCourse) ---- */
  /** Joined top-level section; null = uncategorized. */
  section: { slug: string; name: string } | null;
  /** Joined group under the section; null = standalone course. */
  group: { slug: string; name: string } | null;
  /** Track slug; null = standalone / Learning Path. */
  track: string | null;
  /** Level within a track (1|2|3); null = standalone. */
  level: number | null;
  /** Order within group/track. */
  sortOrder: number | null;
  /** Catalog-wide difficulty (Beginner/Intermediate/Advanced); null = unauthored. */
  difficulty: string | null;
  /** User's access on this card (drives lock vs click-through). */
  canAccess: boolean;
}
