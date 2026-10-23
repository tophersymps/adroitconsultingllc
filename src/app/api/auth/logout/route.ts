/**
 * POST /api/auth/logout — sign out the current user (clears the session cookie).
 *
 * Managed Better Auth revokes the session upstream and expires the
 * `__Secure-neon-auth.*` cookies through the Next cookie adapter. Always 200:
 * a client "sign out" must never strand the user in a signed-in state because
 * of a backend hiccup, and the browser-side auth-changed event clears local
 * state regardless.
 *
 * L1 (t_7ecb98d7, CWE-352): like every other mutating auth route, the POST is
 * origin-checked and rate-limited. CSRF-logout is only a nuisance attack, but
 * the inconsistency was the finding.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/lib/auth/server";
import { withAuthCookies } from "@/lib/auth/cookie-jar";
import { checkRateLimit, getClientIp, checkOrigin } from "@/lib/api-security";

export function POST(req: NextRequest): Promise<Response> {
  // Cookie expiry headers are replayed onto the response by the jar (the
  // adapter's `cookies().set()` path is dropped inside a route handler).
  return withAuthCookies(() => handleLogout(req));
}

async function handleLogout(req: NextRequest): Promise<Response> {
  const originError = checkOrigin(req);
  if (originError) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  try {
    await getAuthServer().signOut();
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[auth/logout] signOut failed", err);
    return NextResponse.json({ status: "ok" });
  }
}
