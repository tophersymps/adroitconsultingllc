/**
 * GET /api/auth/session — current auth state for the client.
 *
 * Returns `{ user: { id, email, isAdmin } | null }` resolved from the HttpOnly
 * Managed Better Auth session cookie via `getSessionUser()` (the same source
 * as proxy.ts and the server-rendered gates). `isAdmin` is derived
 * server-side from `user_roles` (v4) so the avatar menu can gate its /admin
 * entry — non-admins always get false. No sensitive tokens ever leave the
 * server.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { accessSeam } from "@/lib/access";
import { withAuthCookies } from "@/lib/auth/cookie-jar";

export function GET(): Promise<Response> {
  // A session read can refresh the SDK cookie; the jar replays it onto this
  // response (the adapter's `cookies().set()` path is dropped in a handler).
  return withAuthCookies(handleGet);
}

async function handleGet(): Promise<Response> {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json({ user: null });
    }

    // Identity must not depend on the data layer: if the roles read fails
    // (e.g. the still-Supabase-backed seam during the Phase 3 cutover), fail
    // CLOSED to isAdmin=false instead of dropping the whole user object.
    const isAdmin = await accessSeam.isAdmin(user.id).catch(() => false);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email ?? "",
        isAdmin,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
