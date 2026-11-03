/**
 * GET /api/admin/users?q= — admin user list (US-010): every auth user with
 * role + display_name + lifecycle status, filterable by name/email substring.
 * POST /api/admin/users — create/invite a new user with optional role, course
 * grants, and welcome/password-setup email.
 * Admin-only. Contract: AdminUserListRow.
 */
import { NextRequest, NextResponse } from "next/server";
import { activeSubscriptionOf, requireAdminApi, writeAuditLog } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/db/server";
import * as authUsersModule from "@/lib/auth/users";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";
import { buildPasswordResetRedirect } from "@/lib/auth-emails";
import type {
  AdminUserListRow,
  SubscriptionRow,
  UserRole,
} from "@/shared/contracts-course-catalog";

const ROLES: UserRole[] = ["member", "admin"];

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  try {
    const service = await getSupabaseServerClient();
    const [authUsers, rolesRes, profilesRes, subsRes] = await Promise.all([
      authUsersModule.listAuthUsers(),
      service.from("user_roles").select("user_id, role"),
      service.from("user_profiles").select("user_id, display_name"),
      service.from("subscriptions").select(
        "user_id, id, plan, status, current_period_end, created_at",
      ),
    ]);
    if (rolesRes.error) throw rolesRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (subsRes.error) throw subsRes.error;

    const lifecycleList = await (async () => {
      try {
        const fn = authUsersModule.listAdminUserDetails;
        return typeof fn === "function" ? await fn() : [];
      } catch {
        return [];
      }
    })();
    const lifecycleByUser = new Map(
      (lifecycleList ?? []).map((item) => [item.id, item]),
    );

    const roleByUser = new Map<string, UserRole>();
    for (const r of (rolesRes.data ?? []) as { user_id: string; role: UserRole }[]) {
      roleByUser.set(r.user_id, r.role);
    }
    const nameByUser = new Map<string, string | null>();
    for (const p of (profilesRes.data ?? []) as {
      user_id: string;
      display_name: string | null;
    }[]) {
      nameByUser.set(p.user_id, p.display_name);
    }
    const subsByUser = new Map<string, SubscriptionRow[]>();
    for (const s of (subsRes.data ?? []) as SubscriptionRow[]) {
      const list = subsByUser.get(s.user_id) ?? [];
      list.push(s);
      subsByUser.set(s.user_id, list);
    }
    const now = new Date().toISOString();

    const combinedUsers: { id: string; email: string }[] = [...(authUsers ?? [])];
    const seenIds = new Set(combinedUsers.map((u) => u.id));
    for (const detail of lifecycleList ?? []) {
      if (!seenIds.has(detail.id)) {
        combinedUsers.push({ id: detail.id, email: detail.email });
        seenIds.add(detail.id);
      }
    }

    const rows: AdminUserListRow[] = combinedUsers
      .map((u) => {
        const detail = lifecycleByUser.get(u.id);
        return {
          user_id: u.id,
          email: u.email || detail?.email || "",
          display_name: nameByUser.get(u.id) ?? detail?.name ?? null,
          role: roleByUser.get(u.id) ?? ("member" as UserRole),
          entitlements: {},
          subscription: activeSubscriptionOf(subsByUser.get(u.id) ?? [], now),
          ...(detail
            ? {
                email_verified: detail.emailVerified,
                provider: detail.provider,
                created_at: detail.createdAt,
                last_seen_at: detail.lastSeenAt,
                active_session_count: detail.activeSessionCount,
                frozen_at: detail.frozenAt,
                frozen_reason: detail.frozenReason,
                deleted_at: detail.deletedAt,
                status: detail.status,
              }
            : {}),
        };
      })
      .filter((u) => {
        if (!q) return true;
        return (
          u.email.toLowerCase().includes(q) ||
          (u.display_name ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({ ok: true, data: rows });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (!gate.ok) return gate.response;

  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: originErr }, { status: 403 });
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: {
    email?: unknown;
    display_name?: unknown;
    role?: unknown;
    course_ids?: unknown;
    send_invite?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "A valid email address is required" },
      { status: 400 },
    );
  }

  const displayName =
    typeof body.display_name === "string" && body.display_name.trim().length > 0
      ? body.display_name.trim().slice(0, 120)
      : null;

  const role: UserRole =
    typeof body.role === "string" && ROLES.includes(body.role as UserRole)
      ? (body.role as UserRole)
      : "member";

  const courseIds = Array.isArray(body.course_ids)
    ? body.course_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  const sendInvite = body.send_invite !== false;

  try {
    const created = await authUsersModule.createAuthUserIdentity({
      email,
      name: displayName,
    });

    const service = await getSupabaseServerClient();
    const now = new Date().toISOString();

    await Promise.all([
      service.from("user_roles").upsert(
        {
          user_id: created.id,
          role,
          updated_at: now,
        },
        { onConflict: "user_id" },
      ),
      service.from("user_profiles").upsert(
        {
          user_id: created.id,
          display_name: displayName ?? created.name,
          updated_at: now,
        },
        { onConflict: "user_id" },
      ),
    ]);

    if (courseIds.length > 0) {
      for (const courseId of courseIds) {
        await service.from("user_entitlements").insert({
          user_id: created.id,
          course_id: courseId,
          source: "granted",
          grant_note: "Granted on admin user creation",
          granted_by: gate.userId,
          granted_at: now,
        });
      }
    }

    let inviteSent = false;
    if (sendInvite) {
      try {
        const { getAuthServer } = await import("@/lib/auth/server");
        const redirectTo = buildPasswordResetRedirect(req.headers.get("origin"));
        const res = await getAuthServer().requestPasswordReset({
          email: created.email,
          redirectTo,
        });
        inviteSent = !res?.error;
      } catch {
        inviteSent = false;
      }
    }

    await writeAuditLog({
      actorUserId: gate.userId,
      action: "user.create",
      targetType: "user",
      targetId: created.id,
      details: {
        email: created.email,
        display_name: displayName ?? created.name,
        role,
        course_ids: courseIds,
        invite_sent: inviteSent,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          user_id: created.id,
          email: created.email,
          display_name: displayName ?? created.name,
          role,
          invite_sent: inviteSent,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "USER_EXISTS" || code === "USER_TOMBSTONED") {
      return NextResponse.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "User already exists",
          code,
          tombstoneUserId: (err as { tombstoneUserId?: string })?.tombstoneUserId,
        },
        { status: 409 },
      );
    }
    console.error("[admin] POST /api/admin/users failed", err);
    return NextResponse.json(
      { ok: false, error: "Failed to create user" },
      { status: 500 },
    );
  }
}
