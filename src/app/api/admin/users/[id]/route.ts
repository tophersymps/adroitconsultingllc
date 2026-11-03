/**
 * GET /api/admin/users/[id] — admin user detail (US-010/014): role + active
 * entitlements (keyed by course_id → source) for the user matrix.
 * DELETE /api/admin/users/[id]?mode=soft|hard — soft-delete (30-day tombstone)
 * or permanently hard-delete a user account.
 * Admin-only. Contract: AdminUserListRow (entitlements populated).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  activeSubscriptionOf,
  requireAdminApi,
  notFoundJson,
  writeAuditLog,
} from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/db/server";
import * as authUsersModule from "@/lib/auth/users";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";
import type {
  AdminUserListRow,
  EntitlementSource,
  SubscriptionRow,
  UserRole,
} from "@/shared/contracts-course-catalog";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  try {
    const service = await getSupabaseServerClient();
    const [user, roleRes, profileRes, entRes, subRes] = await Promise.all([
      authUsersModule.getAuthUser(id),
      service
        .from("user_roles")
        .select("role")
        .eq("user_id", id)
        .maybeSingle(),
      service
        .from("user_profiles")
        .select("display_name")
        .eq("user_id", id)
        .maybeSingle(),
      service
        .from("user_entitlements")
        .select("course_id, source")
        .eq("user_id", id)
        .is("revoked_at", null),
      service
        .from("subscriptions")
        .select("id, plan, status, current_period_end, created_at")
        .eq("user_id", id),
    ]);
    if (!user) return notFoundJson();

    const entitlements: Record<string, EntitlementSource> = {};
    for (const e of (entRes.data ?? []) as {
      course_id: string;
      source: EntitlementSource;
    }[]) {
      entitlements[e.course_id] = e.source;
    }

    const subscription = activeSubscriptionOf(
      (subRes.data ?? []) as SubscriptionRow[],
      new Date().toISOString(),
    );

    const row: AdminUserListRow = {
      user_id: id,
      email: user.email,
      display_name:
        ((profileRes.data as { display_name: string | null } | null)
          ?.display_name) ?? null,
      role: ((roleRes.data as { role: UserRole } | null)?.role) ?? "member",
      entitlements,
      subscription,
    };
    return NextResponse.json({ ok: true, data: row });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
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

  // Self-lockout guard: an admin cannot delete their own active account.
  if (targetUserId === gate.userId) {
    return NextResponse.json(
      { ok: false, error: "Cannot delete your own admin account" },
      { status: 409 },
    );
  }

  const url = new URL(req.url);
  let modeParam = url.searchParams.get("mode");
  if (!modeParam) {
    try {
      const body = (await req.json()) as { mode?: string };
      if (body?.mode) modeParam = body.mode;
    } catch {
      // Query param or default is used when body is empty.
    }
  }
  const mode: "soft" | "hard" = modeParam === "hard" ? "hard" : "soft";

  try {
    const service = await getSupabaseServerClient();

    // Last-admin guard: if target holds admin role, ensure at least 2 admins exist.
    const { data: targetRoleRow } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const targetRole =
      ((targetRoleRow as { role: UserRole } | null)?.role) ?? "member";

    if (targetRole === "admin") {
      const { count } = await service
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { ok: false, error: "Cannot delete the last remaining admin" },
          { status: 409 },
        );
      }
    }

    if (mode === "hard") {
      const deleted = await authUsersModule.hardDeleteAuthUser(targetUserId);
      if (!deleted) return notFoundJson();

      await writeAuditLog({
        actorUserId: gate.userId,
        action: "user.delete_hard",
        targetType: "user",
        targetId: targetUserId,
        details: {
          email: deleted.email,
          mode: "hard",
          prior_role: targetRole,
        },
      });

      return NextResponse.json({
        ok: true,
        data: {
          user_id: targetUserId,
          email: deleted.email,
          mode: "hard",
          status: "deleted",
        },
      });
    }

    const tombstoned = await authUsersModule.softDeleteAuthUser(targetUserId);
    if (!tombstoned) return notFoundJson();

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "user.delete_soft",
      targetType: "user",
      targetId: targetUserId,
      details: {
        email: tombstoned.email,
        mode: "soft",
        deleted_at: tombstoned.deletedAt,
        recovery_window_days: 30,
        prior_role: targetRole,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        user_id: targetUserId,
        email: tombstoned.email,
        mode: "soft",
        deleted_at: tombstoned.deletedAt,
        status: "tombstoned",
      },
    });
  } catch (err) {
    console.error("[admin] DELETE /api/admin/users/[id] failed", err);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 },
    );
  }
}
