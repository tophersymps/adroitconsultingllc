/**
 * /api/auth/[...path] — Managed Better Auth proxy (Neon Auth), EXPLICIT ALLOWLIST.
 *
 * Security (t_be119007, MEDIUM in the R2-1 review): this mount previously
 * forwarded every method to every Better Auth endpoint — an open same-origin
 * proxy that skipped the app-level hardening (checkOrigin / checkRateLimit)
 * and echoed raw upstream error payloads, re-opening account enumeration via
 * `POST /api/auth/sign-up/email` and exposing destructive endpoints
 * (`delete-user`, `send-verification-email`, `change-email`).
 *
 * It is now a closed allowlist:
 *   - `{METHOD} {path}` must be listed in AUTH_PROXY_ALLOWLIST or the request
 *     gets a 404 with NO upstream call — destructive / enumerating endpoints
 *     are unreachable through this mount.
 *   - Every allowed request runs checkOrigin() (CSRF) and
 *     checkRateLimit() (per-IP throttle) BEFORE delegating, same as the
 *     hand-written routes.
 *   - Upstream failures are never echoed: the raw status/body is logged
 *     server-side only and the client gets a fixed generic message (429 keeps
 *     its own fixed message), so no error code or message can be used to
 *     distinguish "email already registered" from any other failure.
 *
 * Route precedence: the hand-written routes in this folder (login, session,
 * logout, reset-password/*, resend-confirmation) are static segments and win
 * over this catch-all, so their hardened behaviour is unchanged.
 *
 * Only `GET get-session` is allowed today — nothing in `src/` calls this mount
 * (client code uses /api/auth/session); it exists so a future same-origin
 * client can read the cookie-backed session without a bespoke route. Widen the
 * allowlist deliberately, one `{method, path}` at a time.
 *
 * The handler is built lazily per request (not at module scope) so `next build`
 * never needs the auth env, and a missing env returns a 503 instead of a
 * module-load crash.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/lib/auth/server";
import { checkOrigin, checkRateLimit, getClientIp } from "@/lib/api-security";

type Handler = (
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) => Promise<Response>;
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export const dynamic = "force-dynamic";

/**
 * The complete set of `"{METHOD} {path}"` pairs this mount will forward.
 * Anything absent → 404 without touching the auth backend.
 */
const AUTH_PROXY_ALLOWLIST: ReadonlySet<string> = new Set(["GET get-session"]);

/** Fixed, non-enumerating bodies (H1) — never echo upstream detail. */
const GENERIC_PROXY_ERROR = "Unable to process auth request. Please try again.";
const RATE_LIMIT_ERROR = "Too many attempts. Please try again later.";
const UNAVAILABLE_ERROR = "Auth service unavailable. Please try again later.";

/** Method + path key used against the allowlist (path segments joined). */
function allowlistKey(method: Method, segments: string[]): string {
  return `${method} ${segments.join("/")}`;
}

/**
 * Map an upstream response to a client-safe one.
 *
 * 2xx pass through untouched (the SDK owns session cookies). Anything else is
 * replaced with a fixed body: upstream status and payload are logged
 * server-side only, never echoed, so duplicate-email 422s and other
 * provider-specific failures are indistinguishable from a generic failure.
 *
 * Redirects never reach this mapping as a 3xx: the proxy mount follows
 * same-origin hops itself and answers a fixed 502 when the upstream tries to
 * leave its configured origin (`createProxyHandlers` in `@/lib/auth/server`),
 * so a followed cross-origin body is never served to the client.
 */
function mapUpstreamResponse(
  method: Method,
  path: string,
  upstream: Response,
): Response {
  if (upstream.status < 400) return upstream;

  // Server-side only: status, never the upstream body/message.
  console.error(`[api/auth/[...path]] ${method} ${path} failed`, {
    status: upstream.status,
  });

  if (upstream.status === 429) {
    return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
  }
  // Upstream/backend failure — including the proxy's own refusal to surface a
  // cross-origin redirect body (see `createProxyHandlers`) — is a 502, never a
  // 400 that would look like a caller error.
  if (upstream.status >= 500) {
    return NextResponse.json({ error: UNAVAILABLE_ERROR }, { status: 502 });
  }
  return NextResponse.json({ error: GENERIC_PROXY_ERROR }, { status: 400 });
}

function delegate(method: Method): Handler {
  return async (request, ctx) => {
    const params = await ctx.params;
    const segments = Array.isArray(params?.path) ? params.path : [];
    const path = segments.join("/");

    // Closed allowlist — no upstream call for anything not listed.
    if (!AUTH_PROXY_ALLOWLIST.has(allowlistKey(method, segments))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const req = request as NextRequest;

    // App-level CSRF + throttle, same helpers the hand-written routes use.
    if (checkOrigin(req)) {
      return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
    }
    if (!checkRateLimit(getClientIp(req))) {
      return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
    }

    try {
      const handlers = getAuthServer().handler();
      const upstream = await handlers[method](request, ctx);
      return mapUpstreamResponse(method, path, upstream);
    } catch (err) {
      console.error("[api/auth/[...path]] auth backend unavailable", err);
      return NextResponse.json({ error: UNAVAILABLE_ERROR }, { status: 503 });
    }
  };
}

export const GET = delegate("GET");
export const POST = delegate("POST");
export const PUT = delegate("PUT");
export const DELETE = delegate("DELETE");
export const PATCH = delegate("PATCH");
