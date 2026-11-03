/**
 * POST /api/admin/users/[id]/reset-password — admin-triggered password reset
 * email for a specific user. Optionally revokes active sessions.
 * Writes `user.password_reset` to `admin_audit_log`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, notFoundJson, writeAuditLog } from "@/lib/admin";
import * as authUsersModule from "@/lib/auth/users";
import { getAuthServer } from "@/lib/auth/server";
import { buildPasswordResetRedirect } from "@/lib/auth-emails";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id: targetUserId } = await params;
  if (!targetUserId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  let revokeSessions = false;
  try {
    const body = (await req.json()) as { revoke_sessions?: boolean };
    revokeSessions = body?.revoke_sessions === true;
  } catch {
    // Empty body is valid.
  }

  try {
    const targetUser = await authUsersModule.getAuthUser(targetUserId);
    if (!targetUser || !targetUser.email) return notFoundJson();

    const redirectTo = buildPasswordResetRedirect(req.headers.get("origin"));
    const { error } = await getAuthServer().requestPasswordReset({
      email: targetUser.email,
      redirectTo,
    });

    if (error) {
      console.error("[admin] requestPasswordReset failed", {
        status: (error as { status?: number })?.status,
        code: (error as { code?: string })?.code,
      });
      return NextResponse.json(
        { ok: false, error: "Failed to send password reset email" },
        { status: 502 },
      );
    }

    let revokedCount = 0;
    if (
      revokeSessions &&
      typeof authUsersModule.revokeUserSessions === "function"
    ) {
      revokedCount = await authUsersModule
        .revokeUserSessions(targetUserId)
        .catch(() => 0);
    }

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "user.password_reset",
      targetType: "user",
      targetId: targetUserId,
      details: {
        email: targetUser.email,
        revoked_sessions: revokedCount,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        user_id: targetUserId,
        email: targetUser.email,
        revoked_sessions: revokedCount,
      },
    });
  } catch (err) {
    console.error("[admin] POST /api/admin/users/[id]/reset-password failed", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
