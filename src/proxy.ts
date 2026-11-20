/**
 * Next.js 16 Proxy (successor of `middleware.ts`) — Managed Better Auth session
 * refresh.
 *
 * F3 from security audit t_4ee14a75: without a proxy, auth state is only
 * refreshed when a route handler asks for it, so server components and pages
 * would silently degrade to "guest" on navigation. This proxy refreshes the
 * Neon Auth session cookie on navigation before any page renders.
 *
 * Why not the SDK's bundled middleware? `neonAuthMiddleware()` is a ROUTE
 * PROTECTOR: it redirects every non-skip path to `loginUrl` when there is no
 * session, and its skip list is not configurable in `createNeonAuth`. Adroit is
 * a public site (marketing, field notes, atlas catalogue) where only some pages
 * gate, so this proxy does the refresh half only: one `get-session` round-trip
 * when a session cookie is present, and any `Set-Cookie` headers it returns are
 * copied onto the response. It never redirects.
 *
 * NOTE: do NOT use `next/headers` cookies() here — proxy runs before the render
 * tree and only has access to request/response cookies.
 */
import { handleAuthProxyRequest } from "@neondatabase/auth/server";
import { NextResponse, type NextRequest } from "next/server";
import {
  adaptSetCookieHeaders,
  forwardableAuthHeaders,
  hasSessionCookie,
  isSecureRequest,
} from "@/lib/auth/transport";

/** Session-data cookie cache TTL (seconds), matching the SDK default. */
const SESSION_DATA_TTL = 300;

export async function proxy(request: NextRequest) {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

  // No auth config (build-time collection, previews without secrets) → pass
  // through untouched, exactly like the old Supabase guard.
  if (!baseUrl || !cookieSecret) {
    return NextResponse.next({ request });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!hasSessionCookie(cookieHeader, isSecureRequest(request.headers))) {
    // Guest: nothing to refresh.
    return NextResponse.next({ request });
  }

  try {
    const authResponse = await handleAuthProxyRequest({
      // Origin is synthesised when the caller sends none (non-browser clients),
      // and the auth cookies are re-prefixed to the names the SDK expects.
      request: new Request(request.url, {
        method: "GET",
        headers: forwardableAuthHeaders(request.headers),
      }),
      path: "get-session",
      baseUrl,
      cookieSecret,
      sessionDataTtl: SESSION_DATA_TTL,
    });

    // `__Secure-`-prefixed + `Secure` on https/loopback, plain `neon-auth.*`
    // on http — otherwise the refreshed cookie is dropped by the browser.
    const setCookies = adaptSetCookieHeaders(
      authResponse.headers,
      isSecureRequest(request.headers),
    );
    if (setCookies.length === 0) {
      return NextResponse.next({ request });
    }

    const response = NextResponse.next({ request });
    for (const cookie of setCookies) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  } catch (err) {
    // Never block navigation on an auth-backend hiccup: pages gate themselves.
    console.error("[proxy] session refresh failed", err);
    return NextResponse.next({ request });
  }
}

export const config = {
  /*
   * Allow-list, NOT a catch-all (t_3f9353a0).
   *
   * Proxy runs on a route if and only if that route's RENDER path reads
   * auth/access state. Public pages (marketing, field notes, tags, the
   * standalone lab page, the auth-entry forms) are served straight from
   * Vercel's edge cache with no Middleware leg — which is the whole point:
   * Vercel counts Fast Origin Transfer between the CDN and Functions/Middleware
   * in both directions (and twice for one Middleware request), and adroit.io is
   * on a Hobby plan that hard-pauses at 10 GB/month. The old catch-all matcher
   * ran Proxy on every non-asset page, including the 28-of-32 sampled requests
   * whose HTML came from `cache: PRERENDER`.
   *
   * Clauses kept here (verified 2026-11-19 by grepping the render path for
   * `lib/auth` / `lib/access` / the SSR session client):
   *   /admin/**     — src/app/admin/layout.tsx calls requireAdminPage() (404s non-admins)
   *   /atlas/**     — hub + [series]/** (lesson, check, exam, certificate, preview):
   *                   all import @/lib/access and render per-user CardGateState
   *   /preview/**   — request-time draft previews gated by isPreviewEmailAllowed()
   *   /profile      — SSR session read; guests get the locked-sky teaser
   *   /settings     — SSR session read; guests redirect to /login?next=/settings
   *
   * Excluded on purpose: everything else, notably /api/** (routes refresh the
   * session themselves via withAuthCookies), static assets and /_next/*.
   *
   * The contract is pinned by src/proxy.matcher.test.ts — it fails if a gated
   * page is added without a matching clause here.
   *
   * NOTE: these values must stay string literals. Next statically extracts
   * `export const config` from the module AST (extract-const-value.js) and
   * rejects identifier references, so `matcher: GATED_MATCHERS` would be
   * silently ignored and Proxy would run on *every* request.
   */
  matcher: [
    "/admin/:path*",
    "/atlas/:path*",
    "/preview/:path*",
    "/profile",
    "/settings",
  ],
};
