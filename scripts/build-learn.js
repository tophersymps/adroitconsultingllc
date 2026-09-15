/**
 * Build-time script: reads MDX frontmatter from content/learn/<series>/,
 * reads optional per-series series.json config, and generates
 * src/data/learn.ts with typed LearningSeries[] + flat LearnLesson[].
 *
 * Mirrors scripts/build-posts.js (which must remain untouched).
 * Ordering contract (ADR-105): per-series LESSON listings sort by LESSON
 * NUMBER ascending (not date); SERIES-level hub ordering stays newest-activity
 * (max lesson date desc). Empty series dirs are emitted with lessons: [] so
 * pages render a graceful "coming soon" state.
 *
 * Run via package.json prebuild: node scripts/build-posts.js && node scripts/build-learn.js
 */
const fs = require("fs");
const path = require("path");

const LEARN_DIR = path.join(__dirname, "..", "content", "learn");
const OUT_PATH = path.join(__dirname, "..", "src", "data", "learn.ts");

// Fallback identity for the two known tracks (ADR-003 / data contract).
// Adding a new series requires NO code change — drop a folder (+ optional series.json).
const KNOWN_SERIES = {
  "salesforce-architect": {
    name: "Salesforce System Architect Primer",
    description:
      "A structured path from Flow fundamentals to platform architecture — practical lessons on designing Salesforce systems that scale.",
    gradient: "from-sky to-blue-600",
  },
  "agentic-ai": {
    name: "Agentic AI Implementation Path",
    description:
      "From single-agent prototypes to multi-agent orchestration — a practitioner's curriculum for shipping agentic systems.",
    gradient: "from-amber to-yellow-600",
  },
};

const FALLBACK_GRADIENT = "from-navy to-navy-light";

function parseFrontmatter(raw) {
  const lines = raw.split("\n");
  if (lines[0].trim() !== "---") return [null, raw];
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return [null, raw];
  const fm = {};
  for (const line of lines.slice(1, end)) {
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    let k = line.slice(0, ci).trim();
    let v = line.slice(ci + 1).trim();
    if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (v.startsWith("[")) {
      v = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else v = v.replace(/^["']|["']$/g, "");
    fm[k] = v;
  }
  return [fm, lines.slice(end + 1).join("\n")];
}

/** Parse "Month DD, YYYY"; returns valid Date or null. */
function parseDate(str) {
  if (!str || typeof str !== "string") return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function humanize(slug) {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Sort lessons by LESSON NUMBER ASC (ADR-105). Lesson 0 sorts last, stable. */
function sortLessonsByLessonNumber(lessons) {
  return lessons
    .map((l, idx) => ({ l, idx }))
    .sort((a, b) => {
      const la = a.l.lesson > 0 ? a.l.lesson : Number.MAX_SAFE_INTEGER;
      const lb = b.l.lesson > 0 ? b.l.lesson : Number.MAX_SAFE_INTEGER;
      if (la !== lb) return la - lb;
      // ties → stable (original order)
      return a.idx - b.idx;
    })
    .map((x) => x.l);
}

/** Newest lesson date in a series (hub ordering), or -Infinity when empty. */
function newestLessonTime(lessons) {
  let max = -Infinity;
  for (const l of lessons) {
    const t = parseDate(l.date);
    if (t && t.getTime() > max) max = t.getTime();
  }
  return max;
}

function readSeriesJson(dir) {
  const cfgPath = path.join(dir, "series.json");
  try {
    return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * B-04 lint guard: fail the build if any lesson-count claim in a series
 * description or lesson excerpt exceeds the number of PUBLISHED lessons.
 *
 * Catches regressions like "90-lesson deep dive" on a series that has only
 * 28 published lessons (the trust/truth fix). Pattern matched: an integer
 * followed by lesson/lessons/requirement(s)/step(s) — e.g. "30-lesson",
 * "46-requirement", "~30-lesson", "22 lessons". Deliberately ignores
 * unrelated numeric claims (dates, token limits like "30,000").
 */
const LESSON_COUNT_CLAIM =
  /(\d+)\s*-?\s*(lesson|lessons|requirement|requirements|step|steps)/gi;

function findOverclaimedCount(text) {
  if (!text) return null;
  let m;
  const re = new RegExp(LESSON_COUNT_CLAIM.source, "gi");
  let maxClaim = null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    // Ignore obviously-unrelated magnitudes (e.g. "30,000" tokens) — a
    // lesson/requirement series never legitimately claims 4+ digits.
    if (n >= 1000) continue;
    if (maxClaim === null || n > maxClaim) maxClaim = n;
  }
  return maxClaim;
}

/** Assert a single series' claims never exceed its published lesson count. */
function assertNoLessonCountOverpromise(series) {
  const published = series.lessons.length;
  const claimed = findOverclaimedCount(series.description);
  if (claimed !== null && claimed > published) {
    throw new Error(
      `[B-04] ${series.slug} description overpromises lessons: claims ${claimed}, only ${published} published. ` +
        `Fix the copy (adroit-blog discovery/consolidated-backlog.md B-04).`,
    );
  }
  for (const l of series.lessons) {
    const excerptClaimed = findOverclaimedCount(l.excerpt);
    if (excerptClaimed !== null && excerptClaimed > published) {
      throw new Error(
        `[B-04] ${series.slug}/${l.slug} excerpt overpromises lessons: claims ${excerptClaimed}, only ${published} published. ` +
          `Fix the copy (discovery/consolidated-backlog.md B-04).`,
      );
    }
  }
}

function buildSeries(seriesSlug, dir) {
  const cfg = readSeriesJson(dir) || {};
  const known = KNOWN_SERIES[seriesSlug] || {};

  const lessons = [];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx")).sort();
  } catch {
    files = [];
  }

  for (const file of files) {
    const slug = file.replace(/\.mdx$/, "");
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    const [fm] = parseFrontmatter(raw);
    if (!fm) {
      console.warn(`Warning: ${seriesSlug}/${file} has no frontmatter, skipping`);
      continue;
    }
    const dateRaw = fm.date || "";
    const date = parseDate(dateRaw) ? dateRaw : "Date unknown";
    const lesson = Number.isNaN(parseInt(fm.lesson, 10)) ? 0 : parseInt(fm.lesson, 10);
    const status = fm.status === "draft" ? "draft" : "published";
    if (status === "draft") {
      console.log(`Skipping draft lesson: ${seriesSlug}/${file}`);
      continue;
    }
    lessons.push({
      slug: fm.slug || slug,
      title: fm.title || "",
      series: fm.series || seriesSlug,
      lesson,
      excerpt: fm.excerpt || "",
      date,
      author: fm.author || "Adroit Consulting",
      readTime: fm.readTime || "5 min read",
      tags: fm.tags || [],
      status,
    });
  }

  const sorted = sortLessonsByLessonNumber(lessons);
  const totalLessons = sorted.reduce((max, l) => Math.max(max, l.lesson), 0);

  /*
   * The curriculum's FINAL size, declared in series.json.
   *
   * `totalLessons` above is the highest lesson number that currently exists, so
   * it grows every time a lesson lands. That is correct for "12 / 12 published"
   * badges and it is what certificate eligibility gates on, so it must keep
   * meaning exactly that. But anything that needs a *stable* size — the star
   * chart picks a constellation whose star count matches the course — cannot use
   * a number that moves daily.
   *
   * Falls back to `totalLessons` when undeclared, so a course without the field
   * behaves exactly as before.
   */
  const declared = Number.parseInt(cfg.curriculumLessons, 10);
  const curriculumLessons =
    Number.isInteger(declared) && declared > 0
      ? Math.max(declared, totalLessons)
      : totalLessons;

  if (Number.isInteger(declared) && declared > 0 && declared < totalLessons) {
    console.warn(
      `Warning: ${seriesSlug} declares curriculumLessons=${declared} but already ` +
        `has ${totalLessons} lessons; using ${totalLessons}. Update series.json.`,
    );
  }

  return {
    slug: seriesSlug,
    name: cfg.name || known.name || humanize(seriesSlug),
    description: cfg.description ?? known.description ?? "",
    // Org (group/subgroup/section/track/level/sort_order) is NO LONGER read
    // from series.json — it lives in the DB (catalog_sections/groups + courses
    // columns, migration 009, ADR-206/207). series.json is display-only:
    // name/description/gradient. The Learn hub buckets from DB rows.
    gradient: cfg.gradient || known.gradient || FALLBACK_GRADIENT,
    lessons: sorted,
    totalLessons,
    curriculumLessons,
  };
}

function build() {
  let dirs = [];
  try {
    dirs = fs
      .readdirSync(LEARN_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    dirs = [];
    console.log("content/learn/ missing — emitting empty learn data");
  }

  const series = dirs.map((slug) => buildSeries(slug, path.join(LEARN_DIR, slug)));

  // B-04 lint guard: fail the build on any lesson-count overpromise.
  for (const s of series) assertNoLessonCountOverpromise(s);

  // Sort series: newest LESSON date DESC (hub PathCards), ties → slug ASC.
  // Empty series sort last.
  series.sort((a, b) => {
    const ta = newestLessonTime(a.lessons);
    const tb = newestLessonTime(b.lessons);
    if (tb !== ta) return tb - ta;
    return a.slug.localeCompare(b.slug);
  });

  // Flat list, NEWEST FIRST across all series (sitemap, nav, lookups).
  const flat = series.flatMap((s) => s.lessons).sort((a, b) => {
    const da = parseDate(a.date);
    const db = parseDate(b.date);
    const ta = da ? da.getTime() : -Infinity;
    const tb = db ? db.getTime() : -Infinity;
    if (tb !== ta) return tb - ta;
    return a.series.localeCompare(b.series) || a.lesson - b.lesson;
  });

  const content = `import { LearnLesson, LearningSeries } from "./types";

/**
 * GENERATED by scripts/build-learn.js. DO NOT HAND-EDIT.
 * Run \`node scripts/build-learn.js\` (or npm run prebuild) to regenerate.
 */

/** All series, sorted by newest lesson date DESC (ties → slug asc). Empty dirs included with lessons: []. */
export const learnSeries: LearningSeries[] = ${JSON.stringify(series, null, 2)};

/** Flat list of every lesson, NEWEST FIRST (for sitemap, nav, flat lookups). */
export const learnLessons: LearnLesson[] = ${JSON.stringify(flat, null, 2)};
`;

  fs.writeFileSync(OUT_PATH, content);
  const counts = series.map((s) => `${s.slug}: ${s.lessons.length} lessons`).join(", ");
  console.log(`Generated learn.ts: ${series.length} series (${counts}) — ${flat.length} lessons total`);
}

build();

