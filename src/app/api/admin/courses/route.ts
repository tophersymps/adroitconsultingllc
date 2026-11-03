/**
 * GET /api/admin/courses — admin course list (US-009/014): every `courses`
 * row + its active (non-revoked) entitlement count + disk lesson counts +
 * unprovisioned series on disk. Admin-only (US-016).
 * Contract: src/shared/contracts-course-catalog.ts → AdminCourseListRow.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getAllSeries } from "@/lib/learn";
import type {
  AdminCourseListRow,
  CourseRow,
} from "@/shared/contracts-course-catalog";

export interface UnprovisionedSeriesSummary {
  slug: string;
  name: string;
  description: string;
  publishedLessonCount: number;
  totalLessonCount: number;
}

export async function GET() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const service = await getSupabaseServerClient();

    const [coursesRes, countsRes] = await Promise.all([
      service
        .from("courses")
        .select("*")
        .order("created_at", { ascending: true }),
      service
        .from("user_entitlements")
        .select("course_id")
        .is("revoked_at", null),
    ]);
    if (coursesRes.error) throw coursesRes.error;
    if (countsRes.error) throw countsRes.error;

    const countByCourse = new Map<string, number>();
    for (const row of (countsRes.data ?? []) as { course_id: string }[]) {
      countByCourse.set(
        row.course_id,
        (countByCourse.get(row.course_id) ?? 0) + 1,
      );
    }

    const diskSeries = getAllSeries();
    const diskBySlug = new Map(diskSeries.map((s) => [s.slug, s]));
    const dbCourses = (coursesRes.data ?? []) as CourseRow[];
    const provisionedSlugs = new Set(dbCourses.map((c) => c.series_slug));

    const rows: AdminCourseListRow[] = dbCourses.map((course) => {
      const series = diskBySlug.get(course.series_slug);
      return {
        course,
        activeEntitlementCount: countByCourse.get(course.id) ?? 0,
        publishedLessonCount: series?.lessons.length ?? 0,
        totalLessonCount: series?.totalLessons ?? series?.lessons.length ?? 0,
      };
    });

    const unprovisionedSeries: UnprovisionedSeriesSummary[] = diskSeries
      .filter((s) => !provisionedSlugs.has(s.slug))
      .map((s) => ({
        slug: s.slug,
        name: s.name,
        description: s.description,
        publishedLessonCount: s.lessons.length,
        totalLessonCount: s.totalLessons,
      }));

    return NextResponse.json({
      ok: true,
      data: rows,
      unprovisionedSeries,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
