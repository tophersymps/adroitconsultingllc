/**
 * POST /api/auth/reset-password/request — request a password-reset email.
 *
 * Enumeration-safe (AC-1.2/1.7): returns the SAME generic success message
 * whether or not the email is registered, and on Supabase-side failures.
 * Rate-limited per-IP via the shared checkRateLimit pattern (AC-1.5), and
 * origin-checked for cross-origin POST protection (AC-1.6).
 *
 * Body: { email }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp, checkOrigin } from "@/lib/api-security";
import { buildAuthRedirect } from "@/lib/auth-emails";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Generic, non-enumerating success body — identical for known/unknown email. */
const GENERIC_MESSAGE =
  "If an account exists for that email, we've sent a password reset link. Please allow a few minutes for it to arrive.";

export async function POST(req: NextRequest) {
  // Cross-origin POST protection (AC-1.6).
  const originError = checkOrigin(req);
  if (originError) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  // Rate limit BEFORE parsing/validating so a flood of malformed requests is
  // also throttled. A rate-limited request returns the generic message, not a
  // distinct error that would reveal the limit (AC-1.5).
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    // Malformed JSON → treat as invalid input, generic response.
  }

  // Invalid/empty email → generic success (no enumeration), but log server-side.
  if (!email || !EMAIL_RE.test(email)) {
    console.error("[reset-request] invalid email submitted");
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildAuthRedirect("/reset-password"),
    });
    if (error) {
      // Supabase-side failure (email service down, etc.) — log, return generic.
      console.error("[reset-request] resetPasswordForEmail failed", error.message);
    }
  } catch (err) {
    console.error("[reset-request] unexpected error", err);
  }

  // Always the same generic success — never reveal whether the account exists.
  return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
}
