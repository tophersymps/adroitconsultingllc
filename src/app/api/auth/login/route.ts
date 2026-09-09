/**
 * POST /api/auth/login — email/password sign in OR sign up (Supabase).
 *
 * Uses the SSR client so the session cookie is written server-side
 * (HttpOnly) and proxy.ts / progress API routes pick it up naturally.
 *
 * Security (t_bd7ac2a0, H1): login is the highest-value brute-force /
 * credential-stuffing target, so it now applies the same controls as the
 * sibling auth mutation routes:
 *   - checkOrigin() — cross-origin POST rejected (CSRF), 403
 *   - checkRateLimit(getClientIp(req)) — per-IP throttle BEFORE parsing, 429
 *   - failures return a FIXED generic message (never the raw Supabase/GoTrue
 *     error.message, which would enable account enumeration); real detail is
 *     logged server-side only.
 *
 * Body: { mode: "signin" | "signup", email, password }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildAuthRedirect } from "@/lib/auth-emails";
import { checkRateLimit, getClientIp, checkOrigin } from "@/lib/api-security";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fixed, non-enumerating error bodies (H1) — never echo Supabase detail. */
const GENERIC_SIGNIN_ERROR = "Invalid email or password.";
const GENERIC_SIGNUP_ERROR =
  "Unable to create account. Please try again later.";
/**
 * Distinct-but-fixed signal for the unconfirmed-email sign-in case (a11y,
 * t_be6b4bd2). PR #10 collapsed EVERY sign-in failure to GENERIC_SIGNIN_ERROR,
 * which made the client's US-5 unconfirmed-email recovery branch (/confirm/i
 * on the response) dead code. We restore a way for the sign-in path ONLY to
 * distinguish "credentials wrong" from "email not confirmed" — via a distinct
 * status code (403) and a FIXED message that never echoes the raw GoTrue
 * error. Genuine bad-credential / unknown-email sign-ins still get the generic
 * 401 (no enumeration); sign-up mode is untouched (registration enumeration).
 */
const UNCONFIRMED_SIGNIN_ERROR =
  "Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or resend it below.";
const UNCONFIRMED_SIGNIN_STATUS = 403;
/** GoTrue reports an unconfirmed account via a code or message mentioning
 *  confirmation. Match both, but never pass the raw value to the client. */
const UNCONFIRMED_RE = /confirm|not_confirmed/i;

export async function POST(req: NextRequest) {
  // Cross-origin POST protection (H1) — before touching the body.
  const originError = checkOrigin(req);
  if (originError) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  // Rate limit BEFORE parsing/validating so a flood of malformed or automated
  // requests is also throttled (H1). Mirror reset-password/request.
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  try {
    const body = (await req.json()) as {
      mode?: unknown;
      email?: unknown;
      password?: unknown;
    };

    const mode = body.mode === "signup" ? "signup" : "signin";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: buildAuthRedirect("/blog") },
      });
      if (error) {
        // Log the real reason server-side; return a fixed generic message so an
        // attacker cannot distinguish "already registered" from other failures.
        console.error("[auth/login] signUp failed", error.message);
        return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 400 });
      }
      // Email confirmation may be required — treat as success with a hint.
      return NextResponse.json({
        status: "check-email",
        message: "Account created. Check your inbox to confirm your email, then sign in.",
      });
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Log the real reason server-side. Only for an UNCONFIRMED-email sign-in
      // do we return a distinct-but-fixed 403 signal so the client can reach
      // the US-5 recovery path (resend confirmation). Genuine bad-credential /
      // unknown-email failures still get the fixed generic 401 (no enumeration);
      // the raw GoTrue error.code/message is never echoed to the client.
      console.error("[auth/login] signInWithPassword failed", error.message);
      if (UNCONFIRMED_RE.test(error.message ?? "") || UNCONFIRMED_RE.test(error.code ?? "")) {
        return NextResponse.json(
          { error: UNCONFIRMED_SIGNIN_ERROR },
          { status: UNCONFIRMED_SIGNIN_STATUS },
        );
      }
      return NextResponse.json({ error: GENERIC_SIGNIN_ERROR }, { status: 401 });
    }

    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
