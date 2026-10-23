/**
 * POST /api/auth/reset-password/update — set a new password with a reset token.
 *
 * Managed Better Auth (Neon R2-1): the reset email links to
 * `/reset-password?token=…`; the token IS the credential, so no session is
 * required (imported legacy users have no session — they are signed out until
 * they reset). Guests without a token get 401 with the "request a new link"
 * message, matching the old behavior for an expired recovery session.
 *
 * Password must be >= 6 chars (same as login/signup) and <= 128 (upstream cap).
 * Upstream failures are mapped to a FIXED message — the raw provider error is
 * logged server-side only (status + code), never echoed.
 *
 * Body: { password, token }
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/lib/auth/server";
import { checkRateLimit, getClientIp, checkOrigin } from "@/lib/api-security";

const MAX_PASSWORD = 128;
const MAX_TOKEN = 512;

const EXPIRED_MESSAGE =
  "Your session has expired. Please request a new reset link.";
const BAD_LINK_MESSAGE =
  "This reset link is invalid or has expired. Please request a new one.";

export async function POST(req: NextRequest) {
  // Cross-origin POST protection (CWE-352), mirroring the request route.
  const originError = checkOrigin(req);
  if (originError) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  // Rate limit BEFORE parsing/validating so a flood of malformed requests is
  // also throttled (CWE-307).
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  let password = "";
  let token = "";
  try {
    const body = (await req.json()) as { password?: unknown; token?: unknown };
    password = typeof body.password === "string" ? body.password : "";
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!password || password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }
  if (password.length > MAX_PASSWORD) {
    return NextResponse.json(
      { error: `Password must be ${MAX_PASSWORD} characters or fewer.` },
      { status: 400 },
    );
  }
  if (!token || token.length > MAX_TOKEN) {
    return NextResponse.json({ error: EXPIRED_MESSAGE }, { status: 401 });
  }

  try {
    const { error } = await getAuthServer().resetPassword({
      newPassword: password,
      token,
    });
    if (error) {
      // Invalid/expired/already-used token, or a rejected password. Log the
      // real reason server-side; the client only ever sees the fixed message.
      console.error("[reset-update] resetPassword failed", {
        status: error.status,
        code: error.code,
      });
      return NextResponse.json({ error: BAD_LINK_MESSAGE }, { status: 400 });
    }

    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
