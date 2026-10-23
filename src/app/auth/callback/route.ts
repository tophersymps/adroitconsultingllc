/**
 * GET /auth/callback — auth-email landing shim (Managed Better Auth).
 *
 * Historical (Supabase/GoTrue) behaviour was a single-use code EXCHANGE that
 * wrote a session cookie. Better Auth has no exchange step: the email links to
 * `/reset-password?token=…` directly (see `buildPasswordResetRedirect()`), and
 * the token itself is the credential that `/api/auth/reset-password/update`
 * redeems.
 *
 * This route is kept so that:
 *   - already-sent / bookmarked links that pass `?token=…` (or `?error=…` and
 *     `?code=…`) still land somewhere useful, and
 *   - the documented 7-route auth surface keeps a single, audited entry point.
 *
 * It performs no credential exchange and writes no cookies. Graceful error
 * handling (AC-2.4/2.5, ADR-PWR-3) is preserved: expired/garbage → the reset
 * page's "request a new link" state, never a 500.
 *
 * `next` is sanitized with sanitizeRedirectPath (CWE-601, AC-2.3).
 */
import { NextRequest, NextResponse } from "next/server";
import { sanitizeRedirectPath } from "@/lib/redirect";

const RESET_PAGE = "/reset-password";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const next = sanitizeRedirectPath(searchParams.get("next"), RESET_PAGE);
  const token = searchParams.get("token");
  const error = searchParams.get("error") ?? searchParams.get("error_description");

  // A real token is simply forwarded to the page that redeems it.
  if (token) {
    const target = new URL(next, req.url);
    target.searchParams.set("token", token);
    return NextResponse.redirect(target);
  }

  // Upstream dead-link signals (`error=INVALID_TOKEN`, legacy `code=…`) all map
  // to the same "expired" state so the user is never told which check failed.
  if (error || searchParams.get("code")) {
    if (error) {
      console.error("[auth/callback] upstream auth error", error.slice(0, 80));
    }
    return NextResponse.redirect(
      new URL(`${RESET_PAGE}?error=expired`, req.url),
    );
  }

  // Nothing usable in the URL (missing token) → invalid link (AC-2.5).
  return NextResponse.redirect(new URL(`${RESET_PAGE}?error=invalid`, req.url));
}
