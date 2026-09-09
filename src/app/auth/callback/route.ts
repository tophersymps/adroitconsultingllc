/**
 * GET /auth/callback — Supabase recovery-code exchange.
 *
 * The reset email links to `<origin>/auth/callback?code=…&next=/reset-password`.
 * This handler exchanges the single-use code for a session (writing the
 * HttpOnly cookie server-side via the SSR client), then redirects to the
 * sanitized `next` (default /reset-password).
 *
 * Graceful error handling (AC-2.4/2.5, ADR-PWR-3):
 *   - expired / already-used code → /reset-password?error=expired
 *   - missing or garbage code      → /reset-password?error=invalid
 * Never a 500.
 *
 * `next` is sanitized with sanitizeRedirectPath (CWE-601, AC-2.3).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeRedirectPath } from "@/lib/redirect";

const RESET_PAGE = "/reset-password";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const next = sanitizeRedirectPath(searchParams.get("next"), RESET_PAGE);

  // Missing code → invalid state (AC-2.5).
  if (!code) {
    return NextResponse.redirect(
      new URL(`${RESET_PAGE}?error=invalid`, req.url),
    );
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // Expired / already-used / invalid code — all surface the same
      // "request a new link" state (ADR-PWR-3). Log the real reason server-side.
      console.error("[auth/callback] exchangeCodeForSession failed", error.message);
      const kind = /expired|used|invalid/i.test(error.message)
        ? "expired"
        : "invalid";
      return NextResponse.redirect(
        new URL(`${RESET_PAGE}?error=${kind}`, req.url),
      );
    }

    // Success — session cookie written by the SSR client. Land on the reset page.
    return NextResponse.redirect(new URL(next, req.url));
  } catch (err) {
    console.error("[auth/callback] unexpected error", err);
    return NextResponse.redirect(
      new URL(`${RESET_PAGE}?error=invalid`, req.url),
    );
  }
}
