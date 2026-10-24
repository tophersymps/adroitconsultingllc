/**
 * GET /api/db/token — the caller's own Neon Data API JWT.
 *
 * The Managed Better Auth session cookie is `httpOnly`, so browser code cannot
 * mint a Data API token itself. This route forwards the incoming cookie to
 * Neon Auth (`GET ${NEON_AUTH_BASE_URL}/token`) server-side and returns only the
 * short-lived JWT. It is a *token* endpoint, not an authorization bypass: the
 * token is scoped to the caller's own session, is never cached, and grants
 * exactly what that user's RLS policies already allow.
 *
 * Guests get `{ token: null }` (200) — a Data API request without a bearer
 * token is served as the `anonymous` role, which is what the public catalog
 * needs.
 */
import { NextResponse } from "next/server";
import { getSessionJwt } from "@/lib/db/server";

export const dynamic = "force-dynamic";

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET() {
  try {
    const token = await getSessionJwt();
    return NextResponse.json({ token }, { headers: noStore });
  } catch {
    // Auth backend unreachable → degrade to guest, never leak an error body.
    return NextResponse.json({ token: null }, { headers: noStore });
  }
}
