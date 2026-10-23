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
  matcher: [
    // Run on all routes except static assets / image optimization / api
    // (api routes read and refresh the session themselves).
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|txt|xml|json|woff2?)$).*)",
  ],
};
