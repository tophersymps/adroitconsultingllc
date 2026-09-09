/**
 * GET /api/admin/courses — admin course list (US-009/014): every `courses`
 * row + its active (non-revoked) entitlement count. Admin-only (US-016).
 * Contract: src/shared/contracts-course-catalog.ts → AdminCourseListRow.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type {
  AdminCourseListRow,
  CourseRow,
} from "@/shared/contracts-course-catalog";

export async function GET() {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const service = getSupabaseServiceClient();

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

    const rows: AdminCourseListRow[] = ((coursesRes.data ?? []) as CourseRow[]).map(
      (course) => ({
        course,
        activeEntitlementCount: countByCourse.get(course.id) ?? 0,
      }),
    );

    return NextResponse.json({ ok: true, data: rows });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
