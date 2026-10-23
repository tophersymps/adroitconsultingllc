/**
 * src/lib/admin.ts — shared helpers for the admin backend (US-009→016).
 *
 * Every admin route/page is gated server-side (US-016): the layout guard and
 * each API handler call `requireAdmin` FIRST and reject non-admins with
 * 404 (page) / 403 (API). Hiding the nav is never the only guard.
 *
 * Reads/writes inside the admin API use the SERVICE client (BYPASSRLS) only
 * AFTER the admin gate passes — never to resolve "who is the current user".
 * Every mutation writes an `admin_audit_log` row (ADR-205).
 */
import { NextResponse } from "next/server";
import { accessSeam } from "@/lib/access";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getSessionUserUncached } from "@/lib/session";
import type { SubscriptionRow } from "@/shared/contracts-course-catalog";

/**
 * The acting user's id, resolved WITHOUT the signed `session_data` cookie cache.
 *
 * Admin authorization is the one place where a stale identity is a security
 * problem, not just a latency win: that cookie pins the user for up to 300 s
 * (SDK default, decision card t_62b515f6 §11), so a deleted/revoked account
 * would keep passing `accessSeam.isAdmin()` for the rest of the window. Every
 * gate below therefore pays one upstream `get-session` round trip; learner
 * surfaces keep the cached `getAccessUserId()`/`getSessionUser()` read.
 */
async function actingAdminUserId(): Promise<string | null> {
  const user = await getSessionUserUncached();
  return user?.id ?? null;
}

/** Resolve the current admin from an upstream session read. Non-admin / guest → false. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const userId = await actingAdminUserId();
  if (!userId) return false;
  return accessSeam.isAdmin(userId);
}

/** Admin API guard — returns the acting user id when the caller is an admin. */
export async function requireAdminApi(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const userId = await actingAdminUserId();
  if (!userId) return { ok: false, response: forbidden() };
  const admin = await accessSeam.isAdmin(userId);
  if (!admin) return { ok: false, response: forbidden() };
  return { ok: true, userId };
}

/** Admin API guard for pages (layout) — non-admin renders 404 (US-016). */
export async function requireAdminPage(): Promise<{ userId: string } | null> {
  const userId = await actingAdminUserId();
  if (!userId) return null;
  const admin = await accessSeam.isAdmin(userId);
  if (!admin) return null;
  return { userId };
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function notFoundJson(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * The user's subscription that currently grants access (status active/trialing
 * AND not past its period end), or null. Mirrors the access seam's
 * activeSubGrantsAccess semantics so the admin matrix agrees with the
 * learner-facing access decision. Self-contained (no access.ts import) so
 * admin route tests can mock the access seam independently.
 */
export function activeSubscriptionOf(
  subs: SubscriptionRow[],
  now: string,
): SubscriptionRow | null {
  for (const sub of subs) {
    if (sub.status !== "active" && sub.status !== "trialing") continue;
    if (sub.current_period_end && sub.current_period_end <= now) continue;
    return sub;
  }
  return null;
}

/**
 * Append an admin_audit_log row (ADR-205). Fire-and-forget via the service
 * client; a failure logs server-side but never fails the primary mutation.
 * `action` vocabulary (arch §2.5): course.launch, course.status_change,
 * course.access_model_change, role.assign, entitlement.grant,
 * entitlement.revoke, entitlement.bulk_grant.
 */
export async function writeAuditLog(input: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const service = await getSupabaseServerClient();
    await service.from("admin_audit_log").insert({
      actor_user_id: input.actorUserId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      details: input.details ?? null,
    });
  } catch (err) {
    console.error("[admin-audit]", input.action, err);
  }
}
