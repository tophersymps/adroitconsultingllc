/**
 * POST /api/admin/users/bulk — execute batch operations on multiple users.
 * Supports: freeze, unfreeze, reset-password, delete (soft/hard), role, grant-course, revoke-course.
 * Enforces self-lockout guards and last-admin protection.
 * Writes audit log rows with action `user.bulk_<action>`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, writeAuditLog } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getAuthServer } from "@/lib/auth/server";
import * as authUsersModule from "@/lib/auth/users";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";
import type {
  AdminBulkUsersRequest,
  AdminBulkUsersResult,
  UserRole,
} from "@/shared/contracts-course-catalog";

const MAX_BULK_USERS = 200;

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: AdminBulkUsersRequest;
  try {
    body = (await req.json()) as AdminBulkUsersRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userIds, action } = body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "userIds array required" }, { status: 400 });
  }

  if (userIds.length > MAX_BULK_USERS) {
    return NextResponse.json(
      { error: `userIds exceeds maximum limit of ${MAX_BULK_USERS}` },
      { status: 400 },
    );
  }

  const validActions = [
    "freeze",
    "unfreeze",
    "reset-password",
    "delete",
    "role",
    "grant-course",
    "revoke-course",
  ];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Unsupported bulk action: ${action}` },
      { status: 400 },
    );
  }

  const service = await getSupabaseServerClient();
  const errors: Array<{ userId: string; error: string }> = [];
  let succeeded = 0;
  let skipped = 0;

  // Pre-load admin count for last-admin guards
  let adminCount = 0;
  try {
    const { count } = await service
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    adminCount = count ?? 0;
  } catch {
    adminCount = 0;
  }

  if (action === "freeze" || action === "unfreeze") {
    const shouldFreeze = action === "freeze";
    const reason =
      typeof body.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 300)
        : null;

    for (const userId of userIds) {
      if (shouldFreeze && userId === gate.userId) {
        errors.push({ userId, error: "Cannot freeze your own admin account" });
        skipped++;
        continue;
      }

      if (shouldFreeze && adminCount <= 1) {
        const { data: roleRow } = await service
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        if (roleRow?.role === "admin") {
          errors.push({ userId, error: "Cannot freeze the last remaining admin" });
          skipped++;
          continue;
        }
      }

      try {
        const updated = await authUsersModule.setUserFrozenState(
          userId,
          { frozen: shouldFreeze, reason },
        );
        if (updated) {
          if (shouldFreeze) {
            await authUsersModule.revokeUserSessions(userId).catch(() => {});
          }
          succeeded++;
        } else {
          errors.push({ userId, error: "User not found or state unchanged" });
        }
      } catch (err) {
        errors.push({
          userId,
          error: err instanceof Error ? err.message : "Freeze update failed",
        });
      }
    }
  } else if (action === "reset-password") {
    const authServer = getAuthServer();
    for (const userId of userIds) {
      try {
        const detail = await authUsersModule.getAdminUserDetail(userId);
        if (!detail || !detail.email) {
          errors.push({ userId, error: "User or email not found" });
          continue;
        }
        await authServer.requestPasswordReset({ email: detail.email });
        succeeded++;
      } catch (err) {
        errors.push({
          userId,
          error: err instanceof Error ? err.message : "Password reset trigger failed",
        });
      }
    }
  } else if (action === "delete") {
    const mode = body.mode === "hard" ? "hard" : "soft";
    for (const userId of userIds) {
      if (userId === gate.userId) {
        errors.push({ userId, error: "Cannot delete your own admin account" });
        skipped++;
        continue;
      }

      if (adminCount <= 1) {
        const { data: roleRow } = await service
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        if (roleRow?.role === "admin") {
          errors.push({ userId, error: "Cannot delete the last remaining admin" });
          skipped++;
          continue;
        }
      }

      try {
        if (mode === "hard") {
          const res = await authUsersModule.hardDeleteAuthUser(userId);
          if (res) succeeded++;
          else errors.push({ userId, error: "Hard delete failed" });
        } else {
          const res = await authUsersModule.softDeleteAuthUser(userId);
          if (res) succeeded++;
          else errors.push({ userId, error: "Soft delete failed" });
        }
      } catch (err) {
        errors.push({
          userId,
          error: err instanceof Error ? err.message : "Delete failed",
        });
      }
    }
  } else if (action === "role") {
    const targetRole = body.role as UserRole;
    if (targetRole !== "admin" && targetRole !== "member") {
      return NextResponse.json(
        { error: "role must be 'admin' or 'member'" },
        { status: 400 },
      );
    }

    for (const userId of userIds) {
      if (userId === gate.userId && targetRole === "member") {
        errors.push({ userId, error: "Cannot demote your own admin account" });
        skipped++;
        continue;
      }

      if (targetRole === "member" && adminCount <= 1) {
        const { data: roleRow } = await service
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        if (roleRow?.role === "admin") {
          errors.push({ userId, error: "Cannot demote the last remaining admin" });
          skipped++;
          continue;
        }
      }

      try {
        const { error: upsertErr } = await service.from("user_roles").upsert(
          {
            user_id: userId,
            role: targetRole,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (upsertErr) throw upsertErr;
        succeeded++;
      } catch (err) {
        errors.push({
          userId,
          error: err instanceof Error ? err.message : "Role update failed",
        });
      }
    }
  } else if (action === "grant-course") {
    const { courseId, source = "granted" } = body;
    if (!courseId) {
      return NextResponse.json({ error: "courseId required" }, { status: 400 });
    }

    // Verify course exists
    const { data: courseRow } = await service
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .maybeSingle();
    if (!courseRow) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const payload = userIds.map((userId) => ({
      user_id: userId,
      course_id: courseId,
      source,
      granted_at: new Date().toISOString(),
      revoked_at: null,
    }));

    const { error: insertErr } = await service
      .from("user_entitlements")
      .upsert(payload, { onConflict: "user_id,course_id" });

    if (insertErr) {
      return NextResponse.json(
        { error: insertErr.message || "Bulk grant failed" },
        { status: 500 },
      );
    }
    succeeded = userIds.length;
  } else if (action === "revoke-course") {
    const { courseId } = body;
    if (!courseId) {
      return NextResponse.json({ error: "courseId required" }, { status: 400 });
    }

    const { error: delErr } = await service
      .from("user_entitlements")
      .delete()
      .eq("course_id", courseId)
      .in("user_id", userIds);

    if (delErr) {
      return NextResponse.json(
        { error: delErr.message || "Bulk revoke failed" },
        { status: 500 },
      );
    }
    succeeded = userIds.length;
  }

  // Record structured audit log
  await writeAuditLog({
    actorUserId: gate.userId,
    action: `user.bulk_${action}`,
    targetType: "user",
    targetId: null,
    details: {
      action,
      requestedCount: userIds.length,
      succeeded,
      failed: errors.length,
      skipped,
      courseId: body.courseId,
    },
  }).catch(() => {});

  const result: AdminBulkUsersResult = {
    ok: errors.length === 0,
    action,
    total: userIds.length,
    succeeded,
    failed: errors.length,
    skipped: skipped > 0 ? skipped : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };

  return NextResponse.json(result);
}
