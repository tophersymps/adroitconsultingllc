/**
 * GET /api/auth/session — current auth state for the client.
 *
 * Returns `{ user: { id, email, isAdmin } | null }` resolved from the HttpOnly
 * session cookie via the SSR client (same auth source as the progress
 * API routes). `isAdmin` is derived server-side from `user_roles` (v4) so the
 * avatar menu can gate its /admin entry — non-admins always get false. No
 * sensitive tokens ever leave the server.
 */
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { accessSeam } from "@/lib/access";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ user: null });
    }

    const isAdmin = await accessSeam.isAdmin(user.id);

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
