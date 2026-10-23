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

import { AsyncLocalStorage } from "node:async_hooks";
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
 * Cross-origin redirect guard for the proxy mount (QA F1, t_be119007).
 *
 * The SDK's `handleAuthProxyRequest()` hardcodes
 *
 *   fetch(upstreamUrl, { method, headers, body })   // no `redirect` option
 *
 * and then rebuilds the response (`handleAuthResponse` → `new Response(...)`),
 * so the final URL is dropped and NEITHER a redirect option NOR a post-hoc
 * `response.url` origin check is reachable through its public config. Left
 * alone, undici defaults to `redirect: "follow"`: a 302 from the configured
 * baseUrl to another host is chased and the foreign body is served to the
 * client as a 200 under our origin (a same-origin-visible SSRF read).
 *
 * The guard therefore wraps the one `fetch` the SDK calls, for the duration of
 * one proxy request, and follows redirects itself:
 *   - same-origin hops are replayed manually (max 3), so normal behaviour is
 *     unchanged;
 *   - any hop that leaves the configured baseUrl origin — or a redirect loop —
 *     marks the guard `blocked` and the caller answers a fixed 502.
 *
 * `AsyncLocalStorage` scopes the guard to the request that installed it, so a
 * concurrent proxy request can never inherit (or observe) another's state.
 * Every other `fetch` in the process is untouched: the wrapper delegates
 * immediately when no guard is active or when the target is not the auth
 * origin.
 */
interface RedirectGuard {
  /** Origin the SDK is allowed to talk to (the configured baseUrl). */
  allowedOrigin: string;
  /** Set by the guarded fetch when a redirect was refused. */
  blocked: boolean;
}

const redirectGuard = new AsyncLocalStorage<RedirectGuard>();

/** Same fixed, non-enumerating wording the route uses for upstream failures. */
const REDIRECT_BLOCKED_ERROR = "Auth service unavailable. Please try again later.";
const MAX_SAME_ORIGIN_REDIRECTS = 3;

function targetUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * A request body can only be replayed across a redirect when it is
 * re-readable. The proxy only forwards `arrayBuffer()` bodies, but stay
 * conservative for any other caller.
 */
function isReplayableBody(body: BodyInit | null | undefined): boolean {
  return (
    body == null ||
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof Blob !== "undefined" && body instanceof Blob)
  );
}

function isRedirectStatus(status: number): boolean {
  return (
    status === 301 || status === 302 || status === 303 || status === 307 ||
    status === 308
  );
}

/**
 * Test seam: the guarded fetch, given the underlying fetch and guard state.
 * Exported so the redirect matrix can be unit-tested without a network stack.
 */
export async function __fetchWithOriginRedirectGuard(
  baseFetch: typeof fetch,
  guard: RedirectGuard,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let target = targetUrl(input);

  // Only police the hop to the configured auth origin.
  if (new URL(target).origin !== guard.allowedOrigin) return baseFetch(input, init);

  const canReplay = isReplayableBody(init?.body);

  let currentInit: RequestInit = { ...init, redirect: "manual" };

  for (let hop = 0; hop <= MAX_SAME_ORIGIN_REDIRECTS; hop += 1) {
    const response = await baseFetch(target, currentInit);

    if (!isRedirectStatus(response.status)) return response;

    const location = response.headers.get("location");
    const next = location ? new URL(location, target) : null;

    // Off-origin (or a redirect with nowhere to go / too many hops / a body we
    // cannot resend): never chase it, and never hand the upstream body on.
    if (
      !next ||
      next.origin !== guard.allowedOrigin ||
      !canReplay ||
      hop === MAX_SAME_ORIGIN_REDIRECTS
    ) {
      guard.blocked = true;
      // Drop the upstream body without waiting on it: the runtime may hold the
      // stream open (a teed/patched fetch), and the caller answers 502 anyway.
      void response.body?.cancel().catch(() => undefined);
      return new Response(null, { status: 502 });
    }

    // 303 (and the legacy 301/302 for non-GET) demote to GET without a body.
    const method = (currentInit.method ?? "GET").toUpperCase();
    if (
      (response.status === 303 || response.status === 301 || response.status === 302) &&
      method !== "GET" &&
      method !== "HEAD"
    ) {
      currentInit = { ...currentInit, method: "GET", body: undefined };
    }

    target = next.href;
  }

  guard.blocked = true;
  return new Response(null, { status: 502 });
}

/**
 * Install the guard-aware wrapper once per process. Restored by
 * `__resetAuthServerForTests()` so tests can substitute a fake fetch.
 */
let unguardedFetch: typeof fetch | null = null;

function installOriginGuard(): void {
  if (unguardedFetch) return;
  const baseFetch = globalThis.fetch;
  unguardedFetch = baseFetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const guard = redirectGuard.getStore();
    if (!guard) return baseFetch(input, init);
    try {
      return __fetchWithOriginRedirectGuard(baseFetch, guard, input, init);
    } catch (err) {
      // A malformed target must not escape as an unhandled rejection.
      return Promise.reject(err);
    }
  }) as typeof fetch;
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

    installOriginGuard();

    // Per-request state: `blocked` is set from inside the guarded fetch when the
    // SDK's upstream call tried to leave the configured origin.
    const guard: RedirectGuard = {
      allowedOrigin: new URL(baseUrl).origin,
      blocked: false,
    };

    const upstream = await redirectGuard.run(guard, async () =>
      handleAuthProxyRequest({
        request: new Request(request.url, {
          method: request.method,
          headers: forwardableAuthHeaders(request.headers),
          body: hasBody ? await request.arrayBuffer() : undefined,
        }),
        path: Array.isArray(path) ? path.join("/") : "",
        baseUrl,
        cookieSecret,
        domain,
      }),
    );

    // Never surface a body whose origin we could not vouch for (QA F1).
    if (guard.blocked) {
      return new Response(JSON.stringify({ error: REDIRECT_BLOCKED_ERROR }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

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

/** Test seam: drop the cached instance and the installed fetch wrapper. */
export function __resetAuthServerForTests(): void {
  instance = null;
  if (unguardedFetch) {
    globalThis.fetch = unguardedFetch;
    unguardedFetch = null;
  }
}
