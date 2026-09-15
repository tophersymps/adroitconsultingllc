/**
 * Hardened cookie options for the Supabase SSR session cookie (CWE-1004).
 *
 * SECURITY CONTRACT: the session token MUST never be readable by scripts on
 * the origin. @supabase/ssr's DEFAULT_COOKIE_OPTIONS (httpOnly: false) leaks
 * the token to any script, and the app's CSP allows `script-src 'self'
 * 'unsafe-inline'`, so a single XSS escalates to full session theft. We set
 * httpOnly:true unconditionally and secure:true in production.
 *
 *   - httpOnly          always on — the token is only ever read by GoTrue via
 *                        the SSR server client (server.ts) / proxy.ts on the
 *                        server. No client code reads the cookie (useAuth
 *                        resolves state via GET /api/auth/session); the
 *                        browser client uses store/anon-key, not the cookie.
 *   - secure             on in production (HTTPS), off in dev/http localhost
 *                        so local development still works over plain HTTP.
 *   - path / sameSite    preserve @supabase/ssr defaults (/, lax).
 *   - maxAge             400 days (34560000s) — @supabase/ssr's default
 *                        session lifetime, kept unchanged.
 *
 * @supabase/ssr >= 0.5 applies `cookieOptions` by merging them over its
 * defaults in applyServerStorage(), so the flags reach cookieStore.set() /
 * response.cookies.set() on every write (initial set, refresh, sign-out
 * cleanup).
 */
export function supabaseCookieOptions(
  env: string | undefined = process.env.NODE_ENV,
) {
  return {
    path: "/",
    sameSite: "lax" as const,
    maxAge: 400 * 24 * 60 * 60,
    httpOnly: true,
    secure: env === "production",
  };
}

export type SupabaseCookieOptions = ReturnType<typeof supabaseCookieOptions>;