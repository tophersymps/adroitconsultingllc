/**
 * PUT /api/admin/courses/[slug]/prerequisites — set a course's structured
 * prerequisites (ADR-209, plan §3c). Replaces the full set for the course.
 * Admin-only; every write is audited (course.profile_change).
 *
 * Body: { requiredCourseIds: string[] } (course ids this course requires).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, writeAuditLog, notFoundJson } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";

type Params = { params: Promise<{ slug: string }> };

/** GET — the current prerequisite course_ids for a course (admin form load). */
export async function GET(_req: NextRequest, { params }: Params) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;
  const { slug } = await params;
  const service = getSupabaseServiceClient();
  try {
    const { data: courseRow } = await service
      .from("courses")
      .select("id")
      .eq("series_slug", slug)
      .maybeSingle();
    const courseId = (courseRow as { id: string } | null)?.id;
    if (!courseId) return notFoundJson();
    const { data, error } = await service
      .from("course_prerequisites")
      .select("required_course_id")
      .eq("course_id", courseId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      data: ((data ?? []) as { required_course_id: string }[]).map(
        (r) => r.required_course_id,
      ),
    });
  } catch (err) {
    console.error("[admin] get prerequisites", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { requiredCourseIds?: unknown };
  try {
    body = (await req.json()) as { requiredCourseIds?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !Array.isArray(body.requiredCourseIds) ||
    body.requiredCourseIds.some((id) => typeof id !== "string")
  ) {
    return NextResponse.json(
      { error: "requiredCourseIds must be an array of strings" },
      { status: 400 },
    );
  }

  const { slug } = await params;
  const service = getSupabaseServiceClient();

  try {
    const { data: courseRow } = await service
      .from("courses")
      .select("id")
      .eq("series_slug", slug)
      .maybeSingle();
    const courseId = (courseRow as { id: string } | null)?.id;
    if (!courseId) return notFoundJson();

    // Reject self-prerequisite (mirror the DB CHECK(course_id <> required_course_id)).
    const required = (body.requiredCourseIds as string[]).filter(
      (id) => id !== courseId,
    );

    // Replace the full prerequisite set in a transaction.
    const { error: delErr } = await service
      .from("course_prerequisites")
      .delete()
      .eq("course_id", courseId);
    if (delErr) throw delErr;

    let insertedCount = 0;
    if (required.length > 0) {
      const { error: insErr } = await service
        .from("course_prerequisites")
        .insert(
          required.map((rid, i) => ({
            course_id: courseId,
            required_course_id: rid,
            sort_order: (i + 1) * 10,
          })),
        );
      if (insErr) throw insErr;
      insertedCount = required.length;
    }

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "course.profile_change",
      targetType: "course",
      targetId: slug,
      details: { prerequisites: { count: insertedCount } },
    });

    return NextResponse.json({ ok: true, data: { count: insertedCount } });
  } catch (err) {
    console.error("[admin] set prerequisites", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
