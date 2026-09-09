/**
 * POST /api/admin/entitlements — grant a course to a user (US-012). Writes an
 * admin_audit_log row (entitlement.grant). Admin-only.
 * Contract: GrantEntitlementRequest.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, notFoundJson, writeAuditLog } from "@/lib/admin";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/supabase/auth-admin";
import {
  checkOrigin,
  checkRateLimit,
  getClientIp,
} from "@/lib/api-security";
import type { GrantEntitlementRequest } from "@/shared/contracts-course-catalog";

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: GrantEntitlementRequest;
  try {
    body = (await req.json()) as GrantEntitlementRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.userId !== "string" || !body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (typeof body.courseId !== "string" || !body.courseId) {
    return NextResponse.json({ error: "courseId required" }, { status: 400 });
  }

  // Additive source support (Access Panel "Grant one-time" / "Adjust"):
  // default granted, allow one-time. The GrantEntitlementRequest contract is
  // unchanged — the handler reads the optional field defensively.
  const source =
    (body as unknown as { source?: string }).source === "one-time"
      ? "one-time"
      : "granted";

  const service = getSupabaseServiceClient();
  try {
    const [user, courseRes] = await Promise.all([
      getAuthUser(body.userId),
      service.from("courses").select("id").eq("id", body.courseId).maybeSingle(),
    ]);
    if (!user) return notFoundJson();
    if (courseRes.error) throw courseRes.error;
    if (!courseRes.data) return notFoundJson();

    const note = typeof body.note === "string" ? body.note.trim() || null : null;
    const { error } = await service.from("user_entitlements").upsert(
      {
        user_id: body.userId,
        course_id: body.courseId,
        source,
        grant_note: note,
        granted_by: gate.userId,
        revoked_at: null,
      },
      { onConflict: "user_id, course_id, source" },
    );
    if (error) throw error;

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "entitlement.grant",
      targetType: "entitlement",
      targetId: `${body.userId}:${body.courseId}`,
      details: { note, source },
    });

    return NextResponse.json({ ok: true, data: { granted: true } });
  } catch (err) {
    console.error("[admin] grant", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/entitlements — soft-revoke an entitlement (US-012,
 * ADR-203): sets revoked_at on the active granted row (row kept for audit).
 * Writes an admin_audit_log row (entitlement.revoke). Admin-only.
 * Body: GrantEntitlementRequest.
 */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: GrantEntitlementRequest;
  try {
    body = (await req.json()) as GrantEntitlementRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.userId !== "string" || !body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (typeof body.courseId !== "string" || !body.courseId) {
    return NextResponse.json({ error: "courseId required" }, { status: 400 });
  }

  const service = getSupabaseServiceClient();
  try {
    const { data: revokedRows, error } = await service
      .from("user_entitlements")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", body.userId)
      .eq("course_id", body.courseId)
      .eq("source", "granted")
      .is("revoked_at", null)
      .select("user_id");
    if (error) throw error;

    // Row-affected check (t_10214e52 / CWE-778): no active granted row
    // matched (never granted, or already revoked) → don't claim a revoke and
    // don't write a misleading audit row.
    if (!revokedRows || revokedRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No active entitlement to revoke" },
        { status: 404 },
      );
    }

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "entitlement.revoke",
      targetType: "entitlement",
      targetId: `${body.userId}:${body.courseId}`,
      details: { note: typeof body.note === "string" ? body.note : null },
    });

    return NextResponse.json({ ok: true, data: { revoked: true } });
  } catch (err) {
    console.error("[admin] revoke", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
