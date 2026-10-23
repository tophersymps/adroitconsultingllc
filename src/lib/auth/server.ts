/**
 * src/lib/auth/server.ts — Managed Better Auth (Neon Auth) server instance.
 *
 * Replaces the Supabase/GoTrue SSR client for the AUTH surface. The instance is
 * created lazily and cached per process:
 *
 *   - `next build` imports every route module while collecting page data but
 *     never executes a handler, so a module-scope `createNeonAuth()` would
 *     throw on a build host without auth env and kill the build. Same
 *     fail-closed convention as the retired `getSupabaseServerClient()`.
 *   - The SDK's Next adapter reads/writes the session through `next/headers`
 *     cookies, which is why `createNeonAuth` (not the browser client) is used
 *     here. Route handlers may set cookies; server components may not (the SDK
 *     swallows that case upstream).
 *
 * Env (from BWS → Vercel, never committed):
 *   NEON_AUTH_BASE_URL      e.g. https://<endpoint>.neonauth.<region>.aws.neon.tech/neondb/auth
 *   NEON_AUTH_COOKIE_SECRET ≥32-char signing secret for the session-data cookie
 *
 * The cookie names are `__Secure-neon-auth.*`; `__Secure-` cookies are accepted
 * on http://localhost by Chromium, so local dev works without TLS.
 */
import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

export type NeonAuthServer = ReturnType<typeof createNeonAuth>;

let instance: NeonAuthServer | null = null;

/** True when both auth env vars are present (used for graceful degradation). */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET,
  );
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

  instance = createNeonAuth({ baseUrl, cookies: { secret } });
  return instance;
}

/** Test seam: drop the cached instance (vitest only). */
export function __resetAuthServerForTests(): void {
  instance = null;
}
