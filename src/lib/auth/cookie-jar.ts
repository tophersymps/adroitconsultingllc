/**
 * src/lib/auth/cookie-jar.ts — deterministic session-cookie writes for the
 * Managed Better Auth (Neon Auth) SDK.
 *
 * WHY THIS EXISTS
 * The SDK writes session cookies by calling the adapter's `setCookie()`, which
 * in the bundled Next adapter is `cookies().set(...)`. Inside an App Router
 * route handler that call is NOT reliably reflected on the outgoing response:
 * the SDK's own async chain resolves `cookies()` outside the phase where Next
 * flushes mutable-cookie mutations, so the write is accepted and silently
 * dropped — sign-in answered `200 {"status":"ok"}` with **no** `Set-Cookie`
 * at all (reproduced on `next start` and `next dev`, t_ab6c1cb6).
 *
 * So the adapter never relies on that side channel: every cookie the SDK wants
 * to set is captured in a per-request jar (AsyncLocalStorage) and replayed onto
 * the response object the route actually returns. `response.headers.append`
 * is the same mechanism `cookies().set()` ultimately uses, just applied at a
 * point Next cannot ignore.
 *
 * Usage (route handlers only — server components cannot set cookies):
 *
 *   export function POST(req: NextRequest) {
 *     return withAuthCookies(() => handle(req));
 *   }
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { CookieOptions } from "@neondatabase/auth/server";

export interface PendingAuthCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

const storage = new AsyncLocalStorage<PendingAuthCookie[]>();

/**
 * Record a cookie for the in-flight request. No-op outside `withAuthCookies`
 * (server components, `getSession()` reads) — those cannot set cookies anyway.
 */
export function recordAuthCookie(cookie: PendingAuthCookie): void {
  storage.getStore()?.push(cookie);
}

/** Serialise one cookie to a `Set-Cookie` value (RFC 6265 attributes). */
export function serializeAuthCookie(cookie: PendingAuthCookie): string {
  const { name, value, options } = cookie;
  let result = `${name}=${encodeURIComponent(value)}`;
  if (options.path) result += `; Path=${options.path}`;
  if (options.domain) result += `; Domain=${options.domain}`;
  if (options.maxAge !== undefined) result += `; Max-Age=${options.maxAge}`;
  if (options.expires) result += `; Expires=${options.expires.toUTCString()}`;
  if (options.httpOnly) result += "; HttpOnly";
  if (options.secure) result += "; Secure";
  if (options.sameSite) {
    const sameSite =
      options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1);
    result += `; SameSite=${sameSite}`;
  }
  if (options.partitioned) result += "; Partitioned";
  return result;
}

/**
 * Run `handler` with a cookie jar and copy every cookie the auth SDK sets
 * during it onto the returned response.
 */
export async function withAuthCookies<T extends Response>(
  handler: () => Promise<T>,
): Promise<T> {
  const jar: PendingAuthCookie[] = [];
  const response = await storage.run(jar, handler);

  for (const cookie of jar) {
    response.headers.append("set-cookie", serializeAuthCookie(cookie));
  }
  return response;
}
