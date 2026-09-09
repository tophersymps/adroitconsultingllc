/**
 * Next.js 16 Proxy (successor of `middleware.ts`) — Supabase session refresh.
 *
 * F3 from security audit t_4ee14a75: without a proxy, expired access tokens
 * are only refreshed when a route handler calls `auth.getUser()` (cookies are
 * writable there). Server components and static pages would silently degrade
 * to "guest" on navigation until the user hits a progress API. This proxy
 * refreshes the Supabase session cookie on navigation before any page renders.
 *
 * Reference: @supabase/ssr server-side guide + Next 16 `proxy` file convention
 * (see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 *
 * NOTE: do NOT use `next/headers` cookies() here — proxy runs before the
 * render tree and only has access to request/response cookies.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No Supabase config (e.g. build-time static export) → pass through.
  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: avoid running any code between createServerClient and
  // supabase.auth.getUser() — the session refresh must happen before any
  // page/route reads the cookies.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except static assets / image optimization / api
    // (api routes do their own getUser() + cookie refresh).
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|txt|xml|json|woff2?)$).*)",
  ],
};
