/**
 * POST /api/admin/users/[id]/restore — restore a soft-deleted (tombstoned) user
 * within their 30-day recovery window, recreating their `neon_auth` identity
 * with the original UUID so all 9 user tables (progress, entitlements, role,
 * profile) reconnect automatically. Optionally sends a password reset link.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, notFoundJson, writeAuditLog } from "@/lib/admin";
import * as authUsersModule from "@/lib/auth/users";
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

  let sendResetEmail = true;
  try {
    const body = (await req.json()) as { send_reset_email?: boolean };
    if (body?.send_reset_email === false) sendResetEmail = false;
  } catch {
    // Default to sending reset email so restored user can log back in.
  }

  try {
    const restored = await authUsersModule.restoreTombstonedAuthUser(targetUserId);
    if (!restored) return notFoundJson();

    let resetEmailSent = false;
    if (sendResetEmail) {
      try {
        const { getAuthServer } = await import("@/lib/auth/server");
        const redirectTo = buildPasswordResetRedirect(req.headers.get("origin"));
        const res = await getAuthServer().requestPasswordReset({
          email: restored.email,
          redirectTo,
        });
        resetEmailSent = !res?.error;
      } catch {
        resetEmailSent = false;
      }
    }

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "user.restore",
      targetType: "user",
      targetId: targetUserId,
      details: {
        email: restored.email,
        reset_email_sent: resetEmailSent,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        user_id: restored.id,
        email: restored.email,
        status: "active",
        reset_email_sent: resetEmailSent,
      },
    });
  } catch (err) {
    console.error("[admin] POST /api/admin/users/[id]/restore failed", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
