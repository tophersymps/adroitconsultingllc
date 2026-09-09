/**
 * POST /api/admin/courses/provision — course auto-provisioning helper (v4,
 * t_0ed19ad0).
 *
 * The Daily Planet scheduler calls this on the first lesson of a new series
 * to create the `pending` `courses` row (default access_model='granted', per
 * v4). Idempotent: if the series already has a courses row it returns the
 * existing row unchanged. No admin create-UI — provisioning is headless.
 *
 * Secured like the other admin endpoints (US-016): server-side role gate via
 * requireAdminApi (the scheduler runs with a service-role context, so writes
 * go through the service client AFTER the admin gate passes), + origin check
 * + rate limit. Writes an admin_audit_log row (ADR-205).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, writeAuditLog } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";
import { seriesExists } from "@/lib/course-readiness";
import type { CourseRow } from "@/shared/contracts-course-catalog";

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { seriesSlug?: unknown; title?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const seriesSlug =
    typeof body.seriesSlug === "string" ? body.seriesSlug.trim() : "";
  if (!/^[a-zA-Z0-9_-]+$/.test(seriesSlug) || seriesSlug.length > 200) {
    return NextResponse.json(
      { error: "Invalid seriesSlug" },
      { status: 400 },
    );
  }
  if (!seriesExists(seriesSlug)) {
    return NextResponse.json(
      { error: "Unknown content series" },
      { status: 400 },
    );
  }
  const title =
    typeof body.title === "string" && body.title.trim().length > 0
      ? body.title.trim().slice(0, 200)
      : seriesSlug;

  const service = getSupabaseServiceClient();

  try {
    // Idempotent: a row already exists → return it, don't duplicate.
    const { data: existing, error: findErr } = await service
      .from("courses")
      .select("*")
      .eq("series_slug", seriesSlug)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) {
      return NextResponse.json({ ok: true, data: existing, created: false });
    }

    const { data, error } = await service
      .from("courses")
      .insert({
        series_slug: seriesSlug,
        title,
        status: "pending",
        access_model: "granted", // v4 default for newly-provisioned series
        price_cents: null,
      })
      .select("*")
      .single();
    if (error) throw error;

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "course.provision",
      targetType: "course",
      targetId: seriesSlug,
      details: { title, status: "pending", access_model: "granted" },
    });

    return NextResponse.json({
      ok: true,
      data: data as CourseRow,
      created: true,
    });
  } catch (err) {
    console.error("[admin] provision course", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
