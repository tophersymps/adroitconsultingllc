/**
 * PATCH /api/admin/users/[id]/status — freeze or unfreeze a user account.
 * Freezing stamps `frozen_at = now()` on `public."user"`, immediately revokes
 * all active `neon_auth.session` rows, and blocks new logins until unfrozen.
 * Writes `user.freeze` / `user.unfreeze` to `admin_audit_log`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, notFoundJson, writeAuditLog } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/db/server";
import * as authUsersModule from "@/lib/auth/users";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";
import type { UserRole } from "@/shared/contracts-course-catalog";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { action?: unknown; reason?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action =
    body.action === "freeze"
      ? "freeze"
      : body.action === "unfreeze"
        ? "unfreeze"
        : null;
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "action must be 'freeze' or 'unfreeze'" },
      { status: 400 },
    );
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 300)
      : null;

  const { id: targetUserId } = await params;
  if (!targetUserId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  if (action === "freeze" && targetUserId === gate.userId) {
    return NextResponse.json(
      { ok: false, error: "Cannot freeze your own admin account" },
      { status: 409 },
    );
  }

  try {
    const targetUser = await authUsersModule.getAuthUser(targetUserId);
    if (!targetUser) return notFoundJson();

    if (action === "freeze") {
      const service = await getSupabaseServerClient();
      const { data: roleRow } = await service
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId)
        .maybeSingle();
      const targetRole =
        ((roleRow as { role: UserRole } | null)?.role) ?? "member";
      if (targetRole === "admin") {
        const { count } = await service
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { ok: false, error: "Cannot freeze the last remaining admin" },
            { status: 409 },
          );
        }
      }
    }

    const result = await authUsersModule.setUserFrozenState(targetUserId, {
      frozen: action === "freeze",
      reason,
    });

    await writeAuditLog({
      actorUserId: gate.userId,
      action: action === "freeze" ? "user.freeze" : "user.unfreeze",
      targetType: "user",
      targetId: targetUserId,
      details: {
        email: targetUser.email,
        reason,
        revoked_sessions: result.revokedSessions,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        user_id: targetUserId,
        email: targetUser.email,
        status: action === "freeze" ? "frozen" : "active",
        frozen_at: result.frozenAt,
        frozen_reason: result.frozenReason,
        revoked_sessions: result.revokedSessions,
      },
    });
  } catch (err) {
    console.error("[admin] PATCH /api/admin/users/[id]/status failed", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
