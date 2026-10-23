/**
 * src/lib/auth/server.ts — Managed Better Auth (Neon Auth) server instance.
 *
 * Replaces the Supabase/GoTrue SSR client for the AUTH surface. The instance is
 * created lazily and cached per process:
 *
 *   - `next build` imports every route module while collecting page data but
 *     never executes a handler, so a module-scope `createAuthServer()` would
 *     throw on a build host without auth env and kill the build. Same
 *     fail-closed convention as the retired `getSupabaseServerClient()`.
 *   - The SDK reads/writes the session through `next/headers` cookies, which is
 *     why the server toolkit (not the browser client) is used here. Route
 *     handlers may set cookies; server components may not (the SDK swallows
 *     that case upstream).
 *
 * WHY NOT `createNeonAuth()` (QA follow-up t_ab6c1cb6):
 * The bundled Next adapter hard-codes two production-https assumptions that
 * break every other deployment — it forwards an EMPTY `Origin` upstream when
 * the caller sends none (curl, native/mobile, server-to-server → Neon Auth
 * `403 MISSING_OR_NULL_ORIGIN`), and it writes every session cookie with
 * `secure: true`, so browsers silently drop the session on plain-http
 * previews / LAN staging. Both are handled in `./transport.ts`; this module
 * builds the same server on the SDK's public `createAuthServer()` toolkit (the
 * documented "build your own adapter" seam) with:
 *   - `getOrigin()` → `resolveRequestOrigin()`: Origin → Referer → canonical
 *     site origin, never an empty string;
 *   - `setCookie()` → environment-aware name (`__Secure-neon-auth.*` on https,
 *     `neon-auth.*` on http) with the matching `Secure` flag;
 *   - `handler()` → a local `/api/auth/[...path]` proxy built on the public
 *     `handleAuthProxyRequest()` with the same Origin + cookie translation
 *     (`src/app/api/auth/[...path]/route.ts` only calls `handler()`).
 *
 * Env (from BWS → Vercel, never committed):
 *   NEON_AUTH_BASE_URL      e.g. https://<endpoint>.neonauth.<region>.aws.neon.tech/neondb/auth
 *   NEON_AUTH_COOKIE_SECRET ≥32-char signing secret for the session-data cookie
 *   NEON_AUTH_COOKIE_DOMAIN optional cookie Domain (e.g. `.adroit.io`)
 *   AUTH_COOKIE_SECURE      optional `true`/`false` forcing the cookie form
 *                           (see `isSecureRequest` in ./transport.ts)
 *   NEXT_PUBLIC_SITE_URL    canonical origin used when a caller sends no
 *                           Origin/Referer, and by the auth-email redirects
 */
import "server-only";

import { headers } from "next/headers";
import {
  createAuthServer,
  handleAuthProxyRequest,
  type NeonAuthServer as SdkAuthServer,
  type RequestContext,
} from "@neondatabase/auth/server";
import {
  adaptResponseCookies,
  authCookiesForUpstream,
  forwardableAuthHeaders,
  isSecureRequest,
  resolveRequestOrigin,
  toStorageCookieName,
} from "./transport";
import { recordAuthCookie } from "./cookie-jar";

/** Request-scoped handler signature the SDK's `authApiHandler` exposes. */
export type AuthProxyRequestHandler = (
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) => Promise<Response>;

export type AuthProxyHandlers = Record<
  "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  AuthProxyRequestHandler
>;

/** The SDK server API plus the proxy mount the catch-all route needs. */
export type NeonAuthServer = SdkAuthServer & {
  handler: () => AuthProxyHandlers;
};

let instance: NeonAuthServer | null = null;

/** True when both auth env vars are present (used for graceful degradation). */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET,
  );
}

/**
 * Read-only view used by the SDK toolkit: `next/headers` is imported lazily so
 * this module stays importable from a plain Node context (unit tests, build
 * data collection) where `next/headers` has no request scope.
 */
export async function createNextRequestContext(): Promise<RequestContext> {
  const headerStore = await headers();

  // One transport decision per invocation, shared by every cookie written for
  // this request.
  const secure = isSecureRequest(headerStore);

  return {
    getCookies: () =>
      authCookiesForUpstream(headerStore.get("cookie"), secure),
    // Captured, not written through `cookies().set()`: inside a route handler
    // that path is silently dropped (see cookie-jar.ts). `withAuthCookies()`
    // replays the jar onto the response the route returns.
    setCookie: (name, value, options) => {
      recordAuthCookie({
        name: toStorageCookieName(name, secure),
        value,
        options: { ...options, secure },
      });
    },
    getHeader: (name) => headerStore.get(name) ?? null,
    getOrigin: () => resolveRequestOrigin(headerStore),
    getFramework: () => "nextjs",
  };
}

/**
 * `/api/auth/[...path]` mount, mirroring the SDK's bundled Next handler but
 * with the origin/cookie translation above. The allowlist, CSRF check and rate
 * limit stay where they are — in the route module — this only proxies.
 */
function createProxyHandlers(
  baseUrl: string,
  cookieSecret: string,
): AuthProxyHandlers {
  const domain = process.env.NEON_AUTH_COOKIE_DOMAIN || undefined;

  const handler: AuthProxyRequestHandler = async (request, ctx) => {
    const { path } = await ctx.params;
    const secure = isSecureRequest(request.headers);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    const upstream = await handleAuthProxyRequest({
      request: new Request(request.url, {
        method: request.method,
        headers: forwardableAuthHeaders(request.headers),
        body: hasBody ? await request.arrayBuffer() : undefined,
      }),
      path: Array.isArray(path) ? path.join("/") : "",
      baseUrl,
      cookieSecret,
      domain,
    });

    return adaptResponseCookies(upstream, secure);
  };

  return {
    GET: handler,
    POST: handler,
    PUT: handler,
    DELETE: handler,
    PATCH: handler,
  };
}

/**
 * Return the process-wide auth server, creating it on first use.
 * Throws when the env is missing — a misconfigured runtime surfaces as a 5xx,
 * never a silent "guest everywhere" degrade.
 */
export function getAuthServer(): NeonAuthServer {
  if (instance) return instance;

  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!baseUrl || !secret) {
    throw new Error(
      "NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required",
    );
  }

  const server = createAuthServer({
    baseUrl,
    context: createNextRequestContext,
    cookieSecret: secret,
    domain: process.env.NEON_AUTH_COOKIE_DOMAIN || undefined,
  });

  instance = Object.assign(server, {
    handler: () => createProxyHandlers(baseUrl, secret),
  });
  return instance;
}

/** Test seam: drop the cached instance (vitest only). */
export function __resetAuthServerForTests(): void {
  instance = null;
}
