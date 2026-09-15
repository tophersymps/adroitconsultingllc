/**
 * PATCH /api/admin/courses/[slug] — admin course mutation (US-009): update
 * status / access_model / price_cents; launching sets launched_at. Writes an
 * admin_audit_log row (ADR-205). Admin-only (US-016).
 *
 * Contract: AdminCourseUpdateRequest.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, notFoundJson, writeAuditLog } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  checkOrigin,
  checkRateLimit,
  getClientIp,
} from "@/lib/api-security";
import {
  computeCourseReadiness,
  notReadyReason,
} from "@/lib/course-readiness";
import type {
  AdminCourseUpdateRequest,
  CourseRow,
} from "@/shared/contracts-course-catalog";

const STATUSES = ["pending", "live", "archived"] as const;
const MODELS = [
  "free",
  "subscription",
  "one-time",
  "sub-or-one-time",
  "granted",
] as const;
const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;

type Params = { params: Promise<{ slug: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: AdminCourseUpdateRequest;
  try {
    body = (await req.json()) as AdminCourseUpdateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (body.access_model !== undefined && !MODELS.includes(body.access_model)) {
    return NextResponse.json({ error: "Invalid access_model" }, { status: 400 });
  }
  if (
    body.price_cents !== undefined &&
    body.price_cents !== null &&
    (typeof body.price_cents !== "number" || body.price_cents < 0)
  ) {
    return NextResponse.json({ error: "Invalid price_cents" }, { status: 400 });
  }
  // Learn v2 org/profile field validation (migration 009 / ADR-208).
  if (body.difficulty !== undefined && body.difficulty !== null && !DIFFICULTIES.includes(body.difficulty)) {
    return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 });
  }
  if (body.level !== undefined && body.level !== null && !Number.isInteger(body.level)) {
    return NextResponse.json({ error: "Invalid level" }, { status: 400 });
  }
  if (
    body.sort_order !== undefined &&
    body.sort_order !== null &&
    (!Number.isInteger(body.sort_order) || body.sort_order < 0)
  ) {
    return NextResponse.json({ error: "Invalid sort_order" }, { status: 400 });
  }
  if (
    body.section_id !== undefined && body.section_id !== null &&
    typeof body.section_id !== "string"
  ) {
    return NextResponse.json({ error: "Invalid section_id" }, { status: 400 });
  }
  if (
    body.group_id !== undefined && body.group_id !== null &&
    typeof body.group_id !== "string"
  ) {
    return NextResponse.json({ error: "Invalid group_id" }, { status: 400 });
  }
  if (body.track !== undefined && body.track !== null && typeof body.track !== "string") {
    return NextResponse.json({ error: "Invalid track" }, { status: 400 });
  }
  if (
    body.recommended_background !== undefined &&
    body.recommended_background !== null &&
    typeof body.recommended_background !== "string"
  ) {
    return NextResponse.json({ error: "Invalid recommended_background" }, { status: 400 });
  }
  if (body.audience !== undefined && body.audience !== null && typeof body.audience !== "string") {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }
  for (const field of ["learning_outcomes", "course_tags"] as const) {
    const v = body[field];
    if (
      v !== undefined && v !== null &&
      (!Array.isArray(v) || v.some((s) => typeof s !== "string"))
    ) {
      return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    }
  }

  const hasAny =
    body.status !== undefined ||
    body.access_model !== undefined ||
    body.price_cents !== undefined ||
    body.section_id !== undefined ||
    body.group_id !== undefined ||
    body.track !== undefined ||
    body.level !== undefined ||
    body.sort_order !== undefined ||
    body.difficulty !== undefined ||
    body.recommended_background !== undefined ||
    body.audience !== undefined ||
    body.learning_outcomes !== undefined ||
    body.course_tags !== undefined;
  if (!hasAny) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { slug } = await params;
  const service = getSupabaseServiceClient();

  try {
    const { data: existing, error: findErr } = await service
      .from("courses")
      .select("*")
      .eq("series_slug", slug)
      .maybeSingle();
    if (findErr) throw findErr;
    const existingRow = (existing as CourseRow | null) ?? null;
    if (!existingRow) return notFoundJson();

    // Launch readiness gate (v4, t_0ed19ad0): a half-finished course must
    // NOT go live. The server enforces what the LaunchDialog's checklist
    // reflects — title + ≥1 published lesson + access model set.
    if (
      body.status === "live" &&
      existingRow.status !== "live"
    ) {
      const readiness = computeCourseReadiness(existingRow);
      const reason = notReadyReason(readiness);
      if (reason) {
        return NextResponse.json(
          { ok: false, error: `Cannot launch: ${reason}` },
          { status: 400 },
        );
      }
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.status !== undefined) updates.status = body.status;
    if (body.access_model !== undefined) updates.access_model = body.access_model;
    if (body.price_cents !== undefined) updates.price_cents = body.price_cents;
    // Learn v2 org/profile fields (migration 009 / ADR-208).
    if (body.section_id !== undefined) updates.section_id = body.section_id;
    if (body.group_id !== undefined) updates.group_id = body.group_id;
    if (body.track !== undefined) updates.track = body.track;
    if (body.level !== undefined) updates.level = body.level;
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
    if (body.difficulty !== undefined) updates.difficulty = body.difficulty;
    if (body.recommended_background !== undefined) updates.recommended_background = body.recommended_background;
    if (body.audience !== undefined) updates.audience = body.audience;
    if (body.learning_outcomes !== undefined) updates.learning_outcomes = body.learning_outcomes;
    if (body.course_tags !== undefined) updates.course_tags = body.course_tags;
    // Launching sets launched_at (idempotent — keep the first launch timestamp).
    if (body.status === "live" && !existingRow.launched_at) {
      updates.launched_at = new Date().toISOString();
    }

    const { data, error } = await service
      .from("courses")
      .update(updates)
      .eq("series_slug", slug)
      .select("*")
      .single();
    if (error) throw error;

    const updated = data as CourseRow;

    // Audit (ADR-205): launch / status_change / access_model_change.
    const auditActions: { action: string; details: Record<string, unknown> }[] =
      [];
    if (body.status !== undefined && body.status !== existingRow.status) {
      auditActions.push({
        action: body.status === "live" ? "course.launch" : "course.status_change",
        details: {
          from: existingRow.status,
          to: body.status,
          first_launch: !existingRow.launched_at && body.status === "live",
        },
      });
    }
    if (
      body.access_model !== undefined &&
      body.access_model !== existingRow.access_model
    ) {
      auditActions.push({
        action: "course.access_model_change",
        details: {
          from: existingRow.access_model,
          to: body.access_model,
        },
      });
    }
    // ADR-205 gap (t_10214e52 / CWE-778): a price-only change is still a
    // commercial mutation and must leave an audit trail.
    if (
      body.price_cents !== undefined &&
      body.price_cents !== existingRow.price_cents
    ) {
      auditActions.push({
        action: "course.price_change",
        details: {
          from: existingRow.price_cents,
          to: body.price_cents,
        },
      });
    }
    // Learn v2 org/profile change (ADR-208/205): aggregate any changed org or
    // profile field into one auditable course.profile_change row.
    const profileFields: { key: keyof AdminCourseUpdateRequest; label: string }[] = [
      { key: "section_id", label: "section_id" },
      { key: "group_id", label: "group_id" },
      { key: "track", label: "track" },
      { key: "level", label: "level" },
      { key: "sort_order", label: "sort_order" },
      { key: "difficulty", label: "difficulty" },
      { key: "recommended_background", label: "recommended_background" },
      { key: "audience", label: "audience" },
      { key: "learning_outcomes", label: "learning_outcomes" },
      { key: "course_tags", label: "course_tags" },
    ];
    const profileChanges: Record<string, { from: unknown; to: unknown }> = {};
    for (const { key, label } of profileFields) {
      const incoming = body[key];
      if (incoming === undefined) continue;
      const existing = (existingRow as unknown as Record<string, unknown>)[key] ?? null;
      if (JSON.stringify(incoming) !== JSON.stringify(existing)) {
        profileChanges[label] = { from: existing, to: incoming };
      }
    }
    if (Object.keys(profileChanges).length > 0) {
      auditActions.push({
        action: "course.profile_change",
        details: profileChanges,
      });
    }
    for (const a of auditActions) {
      await writeAuditLog({
        actorUserId: gate.userId,
        action: a.action,
        targetType: "course",
        targetId: slug,
        details: a.details,
      });
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    console.error("[admin] PATCH course", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
