/**
 * src/lib/catalog.ts — Learn Platform v2 catalog builder (ADR-210).
 *
 * The ONE place a CatalogCourse is built. Merges DB-derived org/profile/access
 * (courses + catalog_sections + catalog_groups + course_prerequisites) with
 * content-derived display (series.json name/description/gradient + lesson
 * counts). Every surface (hub, cards, paywall, admin, sitemap, APIs) consumes
 * CatalogCourse — no drift between DB org fields and content display fields.
 *
 * Contract types: src/shared/contracts-course-catalog.ts (brainiac, t_e6b81ca5).
 * Design doc:    docs/system-architecture-learn-v2.md.
 *
 * Pure helpers (getNextCourse, prerequisitesMet) are unit-testable without a DB
 * (ADR-212 — next-course is DERIVED, not stored).
 */
import { accessSeam, getCatalogOrg } from "@/lib/access";
import { getLessonsForSeries, getSeriesBySlug } from "@/lib/learn";
import type { LearnCardSeries } from "@/data/types";
import type {
  CatalogCourse,
  CatalogForUserV2Result,
  CatalogGroup,
  CatalogSection,
  CoursePrerequisiteRow,
  CourseRow,
  PrerequisiteCourse,
  UserId,
} from "@/shared/contracts-course-catalog";

/** Display metadata resolved from content (series.json) for a course. */
export interface CourseContentDisplay {
  name: string;
  description: string;
  gradient: string;
  lessonCount: number;
  totalLessons: number;
  /** Final planned lesson count; falls back to `totalLessons` when undeclared. */
  curriculumLessons: number;
}

/** Resolve content display for a series slug (fallbacks for missing content). */
export function getContentDisplay(slug: string): CourseContentDisplay {
  const content = getSeriesBySlug(slug);
  const totalLessons = content?.totalLessons ?? 0;
  return {
    name: content?.name ?? humanize(slug),
    description: content?.description ?? "",
    gradient: content?.gradient ?? "from-navy to-navy-light",
    lessonCount: content?.lessons.length ?? 0,
    totalLessons,
    curriculumLessons: content?.curriculumLessons ?? totalLessons,
  };
}

function humanize(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Everything the builder needs beyond a single course row (ADR-210). */
export interface CatalogBuildContext {
  /** All sections (for joining section_id → section). */
  sections: CatalogSection[];
  /** All groups (for joining group_id → group). */
  groups: CatalogGroup[];
  /** All prerequisite join rows (for this course + name resolution). */
  prerequisites: CoursePrerequisiteRow[];
  /** All course rows in the catalog (for next-course derivation). */
  courses: CourseRow[];
  /** Resolve another course's display row by id (for prerequisite names). */
  courseNameById: (id: string) => { series_slug: string; name: string } | undefined;
}

/** Build ONE unified CatalogCourse (ADR-210). Pure aside from content reads. */
export function buildCatalogCourse(
  course: CourseRow,
  ctx: CatalogBuildContext,
  canAccess: boolean,
): CatalogCourse {
  const section = ctx.sections.find((s) => s.id === course.section_id) ?? null;
  const group = ctx.groups.find((g) => g.id === course.group_id) ?? null;

  const prerequisites: PrerequisiteCourse[] = ctx.prerequisites
    .filter((p) => p.course_id === course.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => {
      const req = ctx.courseNameById(p.required_course_id);
      return {
        series_slug: req?.series_slug ?? p.required_course_id,
        name: req?.name ?? "Required course",
      };
    });

  const display = getContentDisplay(course.series_slug);

  return {
    course,
    section,
    group,
    prerequisites,
    nextCourseId: getNextCourse(ctx.courses, course.id),
    name: display.name,
    description: display.description,
    gradient: display.gradient,
    lessonCount: display.lessonCount,
    totalLessons: display.totalLessons,
    curriculumLessons: display.curriculumLessons,
    visible: true,
    canAccess,
  };
}

/**
 * Next-course seam (ADR-212) — DERIVED, no table. Returns the course_id of the
 * next course in the same track (ordered by level, then sort_order). Null when
 * the course is standalone (no track) or is the last in its track.
 */
export function getNextCourse(
  courses: CourseRow[],
  currentId: string,
): string | null {
  const current = courses.find((c) => c.id === currentId);
  if (!current || !current.track || current.level == null) return null;
  const siblings = courses
    .filter((c) => c.track === current.track && c.level != null)
    .sort(
      (a, b) =>
        (a.level ?? 0) - (b.level ?? 0) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
  const idx = siblings.findIndex((c) => c.id === currentId);
  if (idx === -1) return null;
  return siblings[idx + 1]?.id ?? null;
}

/**
 * Prerequisite gate (plan §3c / V2 Option B foundation). True only when EVERY
 * required course id is in the user's completed set. For standalone courses
 * (no prerequisites) it is vacuously true.
 */
export function prerequisitesMet(
  requiredCourseIds: string[],
  completedCourseIds: ReadonlySet<string>,
): boolean {
  return requiredCourseIds.every((id) => completedCourseIds.has(id));
}

/**
 * Compose the full v2 catalog for a user: access seam (visibility + access) +
 * content display + DB org (sections/groups) + structured prerequisites +
 * derived next-course. Returns CatalogCourse[] (only VISIBLE courses) + admin
 * flag. This is the seam every catalog surface calls.
 */
export async function getCatalogForUserV2(
  userId: UserId,
): Promise<CatalogForUserV2Result> {
  const [catalog, org] = await Promise.all([
    accessSeam.getCatalogForUser(userId),
    getCatalogOrg(),
  ]);

  // Resolve prerequisite display names for any course id.
  const nameById = new Map<string, { series_slug: string; name: string }>();
  for (const entry of catalog.entries) {
    const display = getContentDisplay(entry.course.series_slug);
    nameById.set(entry.course.id, {
      series_slug: entry.course.series_slug,
      name: display.name,
    });
  }

  const allCourses = catalog.entries.map((e) => e.course);
  const ctx: CatalogBuildContext = {
    sections: org.sections,
    groups: org.groups,
    prerequisites: org.prerequisites,
    courses: allCourses,
    courseNameById: (id) => nameById.get(id),
  };

  const courses = catalog.entries
    .filter((e) => e.visible)
    .map((e) => buildCatalogCourse(e.course, ctx, e.canAccess));

  return { courses, isAdmin: catalog.isAdmin };
}

/**
 * Slim CatalogCourse[] → LearnCardSeries[] for the /learn hub client (guest
 * hardening t_3dbf4826). Per-lesson metadata never crosses into the client
 * bundle; only card-render fields + the DB-derived org projection ship.
 * `includeLessonSlugs` opts into the slug list for signed-in SeriesProgress.
 */
export function toLearnHubCards(
  courses: CatalogCourse[],
  opts: { includeLessonSlugs?: boolean } = {},
): LearnCardSeries[] {
  return courses.map((c) => ({
    slug: c.course.series_slug,
    name: c.name,
    description: c.description,
    gradient: c.gradient,
    lessonCount: c.lessonCount,
    totalLessons: c.totalLessons,
    curriculumLessons: c.curriculumLessons,
    lessonSlugs: opts.includeLessonSlugs
      ? getLessonsForSeries(c.course.series_slug).map((l) => l.slug)
      : [],
    section: c.section ? { slug: c.section.slug, name: c.section.name } : null,
    group: c.group ? { slug: c.group.slug, name: c.group.name } : null,
    track: c.course.track ?? null,
    level: c.course.level ?? null,
    sortOrder: c.course.sort_order ?? null,
    difficulty: c.course.difficulty ?? null,
    canAccess: c.canAccess,
  }));
}
