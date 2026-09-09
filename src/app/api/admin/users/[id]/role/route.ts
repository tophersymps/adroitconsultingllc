/**
 * PATCH /api/admin/users/[id]/role — assign/demote an admin role (US-011).
 * Writes an admin_audit_log row (role.assign). Admin-only (US-016).
 * Contract: SetRoleRequest.
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
import type { SetRoleRequest, UserRole } from "@/shared/contracts-course-catalog";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: SetRoleRequest;
  try {
    body = (await req.json()) as SetRoleRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.role !== "admin" && body.role !== "member") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { id } = await params;
  const service = getSupabaseServiceClient();

  try {
    // Target must exist as an auth user (GoTrue Admin API — the `auth` schema
    // is not exposed to PostgREST, so the old service.from("auth.users") 500'd).
    const target = await getAuthUser(id);
    if (!target) return notFoundJson();

    const previous = await (async () => {
      const { data } = await service
        .from("user_roles")
        .select("role")
        .eq("user_id", id)
        .maybeSingle();
      return ((data as { role: UserRole } | null)?.role ?? "member") as UserRole;
    })();

    const role: UserRole = body.role;

    // Lockout guards (t_10214e52 / CWE-841, operational): never let an admin
    // demote themselves, and never demote the last remaining admin (no in-app
    // recovery path — the only seeded admin is chris@adroit.io).
    if (role === "member" && previous === "admin") {
      if (id === gate.userId) {
        return NextResponse.json(
          { error: "You cannot demote your own account" },
          { status: 400 },
        );
      }
      const { data: adminRows, error: adminErr } = await service
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (adminErr) throw adminErr;
      const adminCount = (adminRows ?? []).length;
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot demote the last admin" },
          { status: 400 },
        );
      }
    }

    const { error } = await service
      .from("user_roles")
      .upsert({ user_id: id, role, updated_at: new Date().toISOString() });
    if (error) throw error;

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "role.assign",
      targetType: "user",
      targetId: id,
      details: { from: previous, to: role },
    });

    return NextResponse.json({ ok: true, data: { user_id: id, role } });
  } catch (err) {
    console.error("[admin] PATCH role", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
