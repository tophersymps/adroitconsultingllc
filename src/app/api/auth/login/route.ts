/**
 * POST /api/auth/login — email/password sign in OR sign up (Managed Better Auth).
 *
 * Uses the Neon Auth server API so the session cookie is written server-side
 * (HttpOnly, `__Secure-neon-auth.*`) and proxy.ts / session.ts pick it up.
 *
 * Security (t_bd7ac2a0, H1) is preserved verbatim from the GoTrue
 * implementation — a deliberate port, not a rewrite:
 *   - checkOrigin() — cross-origin POST rejected (CSRF), 403
 *   - checkRateLimit(getClientIp(req)) — per-IP throttle BEFORE parsing, 429
 *   - failures return a FIXED generic message (never the raw auth error, which
 *     would enable account enumeration); real detail is logged server-side only
 *     and only as status + code (Better Auth error objects carry no user email,
 *     but keep the same "never echo upstream" rule).
 *
 * Body: { mode: "signin" | "signup", email, password }
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/lib/auth/server";
import { buildVerifyEmailRedirect } from "@/lib/auth-emails";
import { checkRateLimit, getClientIp, checkOrigin } from "@/lib/api-security";
import { withAuthCookies } from "@/lib/auth/cookie-jar";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fixed, non-enumerating error bodies (H1) — never echo auth detail. */
const GENERIC_SIGNIN_ERROR = "Invalid email or password.";
const GENERIC_SIGNUP_ERROR =
  "Unable to create account. Please try again later.";
/**
 * Distinct-but-fixed signal for the unconfirmed-email sign-in case (a11y,
 * t_be6b4bd2). Better Auth reports it as 403 EMAIL_NOT_VERIFIED; we map that
 * to a FIXED message and status 403 so the client's US-5 recovery branch
 * (/confirm/i on the response) stays reachable. Credential failures keep the
 * generic 401 — no enumeration. Sign-up mode is untouched.
 */
const UNCONFIRMED_SIGNIN_ERROR =
  "Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or resend it below.";
const UNCONFIRMED_SIGNIN_STATUS = 403;

/** Better Auth codes/messages for a not-yet-verified account. */
function isUnconfirmed(
  error: { code?: string; message?: string } | null,
): boolean {
  const code = (error?.code ?? "").toUpperCase();
  const message = error?.message ?? "";
  return (
    code.includes("EMAIL_NOT_VERIFIED") || /not[_ ]verified|confirm/i.test(message)
  );
}

/** Safe server-side log line: status + code only, never message/email. */
function logAuthFailure(
  scope: string,
  error: { status?: number; code?: string } | null,
): void {
  console.error(`[auth/login] ${scope} failed`, {
    status: error?.status,
    code: error?.code,
  });
}

export function POST(req: NextRequest): Promise<Response> {
  // The SDK's session cookies are replayed onto the response by the jar: the
  // adapter's `cookies().set()` path is silently dropped inside a route
  // handler (see src/lib/auth/cookie-jar.ts).
  return withAuthCookies(() => handleLogin(req));
}

async function handleLogin(req: NextRequest): Promise<Response> {
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

    const auth = getAuthServer();
    // Better Auth only accepts a redirect URL on the request's own origin (see
    // authRedirectOrigin). Sign-in needs no redirect at all, so it is omitted
    // for non-browser callers instead of risking INVALID_CALLBACK_URL.
    const reqOrigin = req.headers.get("origin");

    if (mode === "signup") {
      const { error } = await auth.signUp.email({
        email,
        password,
        // Better Auth requires a display name; the email local-part keeps the
        // admin People panel useful until a profile name is set.
        name: email.split("@")[0],
        callbackURL: buildVerifyEmailRedirect(reqOrigin),
      });
      if (error) {
        // Log the real reason server-side; return a fixed generic message so an
        // attacker cannot distinguish "already registered" from other failures.
        logAuthFailure("signUp.email", error);
        return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 400 });
      }
      // Email confirmation may be required — treat as success with a hint.
      return NextResponse.json({
        status: "check-email",
        message: "Account created. Check your inbox to confirm your email, then sign in.",
      });
    }

    const { error } = await auth.signIn.email({
      email,
      password,
      ...(reqOrigin ? { callbackURL: buildVerifyEmailRedirect(reqOrigin) } : {}),
    });
    if (error) {
      // Only for an UNCONFIRMED-email sign-in do we return a distinct-but-fixed
      // 403 signal so the client can reach the US-5 recovery path. Genuine
      // bad-credential / unknown-email failures still get the fixed generic 401
      // (no enumeration); the raw upstream code/message is never echoed.
      logAuthFailure("signIn.email", error);
      if (isUnconfirmed(error)) {
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
