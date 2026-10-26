/**
 * GET /api/auth/session — current auth state for the client.
 *
 * Returns `{ user: { id, email, isAdmin } | null }` resolved from the HttpOnly
 * Managed Better Auth session cookie via `readSessionUser()` (the same source
 * as proxy.ts and the server-rendered gates). `isAdmin` is derived
 * server-side from `user_roles` (v4) so the avatar menu can gate its /admin
 * entry — non-admins always get false. No sensitive tokens ever leave the
 * server.
 *
 * Availability contract (t_8101e74f): "signed out" and "couldn't check" are
 * DIFFERENT answers. A cookie-bearing request whose upstream `get-session`
 * fails (network / timeout / 429 / 5xx) gets `503 SESSION_UNAVAILABLE`, never
 * `200 { user: null }` — otherwise the avatar menu renders "Sign in" for a
 * signed-in user during an auth-backend hiccup. Guests (no cookie) still get
 * `200 { user: null }` without any upstream call. The strict read and its
 * secret-free structured log live in `readSessionUser()`.
 */
import { NextResponse } from "next/server";
import { hasSessionCredential, readSessionUser } from "@/lib/session";
import { accessSeam } from "@/lib/access";
import { withAuthCookies } from "@/lib/auth/cookie-jar";

/**
 * This payload carries identity (id/email/isAdmin). Tell the browser and any
 * shared intermediary not to store it — defense in depth next to the HttpOnly
 * session cookie (SEC-L2, CWE-525, t_15a53bb8).
 */
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export function GET(): Promise<Response> {
  // A session read can refresh the SDK cookie; the jar replays it onto this
  // response (the adapter's `cookies().set()` path is dropped in a handler).
  return withAuthCookies(handleGet);
}

/** Fixed, opaque body for a transient session-read failure. No upstream detail. */
const SESSION_UNAVAILABLE_BODY = {
  error: "We can't check your session right now. Please try again in a moment.",
  code: "SESSION_UNAVAILABLE",
} as const;

function unavailableResponse(retryAfterSeconds?: number): Response {
  const headers: Record<string, string> = { ...NO_STORE_HEADERS };
  if (retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }
  return NextResponse.json(SESSION_UNAVAILABLE_BODY, { status: 503, headers });
}

async function handleGet(): Promise<Response> {
  // Presence is decided without a network call. No credential => guest, and a
  // guest pageview never pays an upstream `get-session` round trip.
  if (!(await hasSessionCredential())) {
    return NextResponse.json({ user: null }, { headers: NO_STORE_HEADERS });
  }

  // A credential IS present. From here on, "user: null" is only allowed when
  // the backend actually answered "not signed in" (401/403 or a null session).
  // An availability failure is reported as 503 — never as an identity fact.
  try {
    const result = await readSessionUser();

    if (!result.ok) {
      // readSessionUser emitted the one structured, secret-free log line.
      return unavailableResponse(result.failure.retryAfterSeconds);
    }

    if (!result.user) {
      // Cookie present but the backend answered "no session": genuinely
      // signed out (expired/revoked), so the signed-out UI is correct.
      return NextResponse.json({ user: null }, { headers: NO_STORE_HEADERS });
    }

    // Identity must not depend on the data layer: if the roles read fails
    // (e.g. the still-Supabase-backed seam during the Phase 3 cutover), fail
    // CLOSED to isAdmin=false instead of dropping the whole user object.
    const isAdmin = await accessSeam.isAdmin(result.user.id).catch(() => false);

    return NextResponse.json(
      {
        user: {
          id: result.user.id,
          email: result.user.email ?? "",
          isAdmin,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    // readSessionUser is designed not to throw; an unexpected failure while a
    // credential is present is still "we couldn't check", not "signed out".
    return unavailableResponse();
  }
}
