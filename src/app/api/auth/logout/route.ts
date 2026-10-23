/**
 * POST /api/auth/logout — sign out the current user (clears the session cookie).
 *
 * Managed Better Auth revokes the session upstream and expires the
 * `__Secure-neon-auth.*` cookies through the Next cookie adapter. Always 200:
 * a client "sign out" must never strand the user in a signed-in state because
 * of a backend hiccup, and the browser-side auth-changed event clears local
 * state regardless.
 */
import { NextResponse } from "next/server";
import { getAuthServer } from "@/lib/auth/server";
import { withAuthCookies } from "@/lib/auth/cookie-jar";

export function POST(): Promise<Response> {
  // Cookie expiry headers are replayed onto the response by the jar (the
  // adapter's `cookies().set()` path is dropped inside a route handler).
  return withAuthCookies(handleLogout);
}

async function handleLogout(): Promise<Response> {
  try {
    await getAuthServer().signOut();
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[auth/logout] signOut failed", err);
    return NextResponse.json({ status: "ok" });
  }
}
