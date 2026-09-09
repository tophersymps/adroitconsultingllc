/**
 * GET /api/admin/courses/[slug]/preview — launch preview + readiness (v4,
 * t_0ed19ad0). Admin-only (US-016). Returns the course row, the rendered
 * first-lesson preview (title + excerpt), and the readiness checklist that
 * the LaunchDialog mirrors. The server enforces the same readiness gate on
 * the PATCH launch, so this read never shows a state the write would reject.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, notFoundJson } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { computeCourseReadiness } from "@/lib/course-readiness";
import type { CourseRow } from "@/shared/contracts-course-catalog";

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(slug) || slug.length > 200) {
    return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
  }

  try {
    const service = getSupabaseServiceClient();
    const { data, error } = await service
      .from("courses")
      .select("*")
      .eq("series_slug", slug)
      .maybeSingle();
    if (error) throw error;
    const course = (data as CourseRow | null) ?? null;
    if (!course) return notFoundJson();

    const readiness = computeCourseReadiness(course);
    return NextResponse.json({ ok: true, data: { course, readiness } });
  } catch (err) {
    console.error("[admin] preview", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
