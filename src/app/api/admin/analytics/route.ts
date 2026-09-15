/**
 * GET /api/admin/analytics — per-course completion analytics (v4,
 * t_0ed19ad0, deferred-from-V2). Reads over existing progress/quiz tables:
 * enrollment count, lessons completed, average progress per course + an
 * 8-week trend. Admin-only (US-016).
 *
 * Computed from lesson_completion + read_progress (service client) joined to
 * content (lib/learn) so lesson slugs map to their series. No chart library —
 * the admin surface renders CSS bars + one inline SVG from the response.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  buildCourseLessonSlugs,
  computeCourseAnalytics,
  type CompletionRow,
  type ReadProgressRow,
} from "@/lib/course-analytics";
import type { CourseRow } from "@/shared/contracts-course-catalog";

export async function GET() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const service = getSupabaseServiceClient();
    const [coursesRes, completionsRes, readsRes] = await Promise.all([
      service.from("courses").select("*"),
      service.from("lesson_completion").select("user_id, lesson_slug, completed_at"),
      service
        .from("read_progress")
        .select("user_id, content_type, content_slug, read_at"),
    ]);
    if (coursesRes.error) throw coursesRes.error;
    if (completionsRes.error) throw completionsRes.error;
    if (readsRes.error) throw readsRes.error;

    const courses = (coursesRes.data ?? []) as CourseRow[];
    const lessonSlugs = buildCourseLessonSlugs(courses.map((c) => c.series_slug));
    const result = computeCourseAnalytics({
      courses,
      courseLessonSlugs: lessonSlugs,
      completions: (completionsRes.data ?? []) as CompletionRow[],
      reads: (readsRes.data ?? []) as ReadProgressRow[],
    });

    return NextResponse.json({ ok: true, data: result });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
