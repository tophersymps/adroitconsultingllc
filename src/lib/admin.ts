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
import { accessSeam, getAccessUserId } from "@/lib/access";
import { isDbTokenUnavailable } from "@/lib/db/degraded-client";
import { getSupabaseServerClient } from "@/lib/db/server";
import type { SubscriptionRow } from "@/shared/contracts-course-catalog";

/**
 * Minimum gap between two `[admin-gate] degraded-deny` lines. A sustained
 * token-route lockout hits this branch on every admin request; logging each one
 * would flood the log without adding a signal, so the line is emitted at most
 * once per window while an aggregate hit counter keeps climbing.
 */
export const DEGRADED_ADMIN_DENY_LOG_INTERVAL_MS = 60_000;

const DEGRADED_ADMIN_DENY_TAG = "[admin-gate] degraded-deny";

let lastDegradedAdminDenyLogAt: number | null = null;
let degradedAdminDenyHits = 0;

/**
 * Emit the throttled server-side signal for a degraded admin deny.
 *
 * Deliberately carries NO user id, token, token path, or error message: the
 * whole point of the CWE-755 degrade is that the deny is uniform, so the signal
 * must not become the side channel (PII / CWE-209) the response refuses to be.
 * Returns whether this call actually emitted (false = throttled).
 */
export function signalDegradedAdminDeny(now: number = Date.now()): boolean {
  degradedAdminDenyHits += 1;
  if (
    lastDegradedAdminDenyLogAt !== null &&
    now - lastDegradedAdminDenyLogAt < DEGRADED_ADMIN_DENY_LOG_INTERVAL_MS
  ) {
    return false;
  }
  lastDegradedAdminDenyLogAt = now;
  console.warn(
    `${DEGRADED_ADMIN_DENY_TAG} reason=token-unavailable code=TOKEN_UNAVAILABLE hits=${degradedAdminDenyHits} window_ms=${DEGRADED_ADMIN_DENY_LOG_INTERVAL_MS}`,
  );
  return true;
}

/**
 * Resolve the role without letting the R2-5 "no Data API token" sentinel escape
 * the gate (CWE-755). A token-route lockout is an authorization state, not an
 * outage: every admin surface must answer its uniform deny (403 API / 404 page)
 * instead of a 5xx that would confirm the route exists. Any OTHER loader error
 * still propagates — this is not a blanket catch.
 *
 * The sentinel branch is the ONLY place the degrade is visible (the deny is
 * uniform by design), so it raises the throttled `signalDegradedAdminDeny()`
 * before answering — otherwise a lockout is indistinguishable from ordinary
 * "not an admin" traffic.
 */
async function isAdminOrDeny(userId: string): Promise<boolean> {
  try {
    return await accessSeam.isAdmin(userId);
  } catch (err) {
    if (isDbTokenUnavailable(err)) {
      signalDegradedAdminDeny();
      return false;
    }
    throw err;
  }
}

/** Resolve the current admin from the session cookie. Non-admin / guest → false. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const userId = await getAccessUserId();
  if (!userId) return false;
  return isAdminOrDeny(userId);
}

/** Admin API guard — returns the acting user id when the caller is an admin. */
export async function requireAdminApi(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const userId = await getAccessUserId();
  if (!userId) return { ok: false, response: forbidden() };
  const admin = await isAdminOrDeny(userId);
  if (!admin) return { ok: false, response: forbidden() };
  return { ok: true, userId };
}

/**
 * Admin API guard for pages (layout) — non-admin renders 404 (US-016).
 * A token-route lockout maps to null as well, so the caller renders the same
 * 404 as a plain non-admin instead of a 500.
 */
export async function requireAdminPage(): Promise<{ userId: string } | null> {
  const userId = await getAccessUserId();
  if (!userId) return null;
  const admin = await isAdminOrDeny(userId);
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
