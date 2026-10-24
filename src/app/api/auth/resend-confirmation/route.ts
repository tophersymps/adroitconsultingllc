/**
 * POST /api/auth/resend-confirmation — resend the signup verification email.
 *
 * ADR-PWR-4: lives only in the login unconfirmed-email error state. Generic,
 * non-enumerating response (identical whether or not the email is registered),
 * rate-limited per-IP, origin-checked. Mirrors the reset-request route.
 *
 * Managed Better Auth exposes this as `sendVerificationEmail`; upstream
 * failures are logged server-side (status + code only) and never surfaced.
 *
 * Body: { email }
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/lib/auth/server";
import { checkRateLimit, getClientIp, checkOrigin } from "@/lib/api-security";
import { buildVerifyEmailRedirect } from "@/lib/auth-emails";
import { withAuthCookies } from "@/lib/auth/cookie-jar";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERIC_MESSAGE =
  "If that account needs confirmation, we've sent a new confirmation link. Please allow a few minutes for it to arrive.";

/**
 * Duplicate-send guard (t_9690dda0).
 *
 * A sign-up plus an immediate "resend" click (or a double-submitted form /
 * retried script) burns two verification emails ~1s apart against the Resend
 * quota, and the second link just invalidates nothing useful. Every send issues
 * a NEW token upstream, so the duplicate is only visible in the provider's log.
 *
 * One send per address per window: the caller still gets the same generic 200
 * (no enumeration), we simply skip the upstream `sendVerificationEmail`.
 *
 * Best-effort by design: the map lives in the process, so it dedupes repeated
 * clicks that land on the same serverless instance. Replicas and cold starts
 * each start empty — a cross-instance guarantee would need shared state
 * (Redis/KV) which this LOW-severity path does not warrant.
 */
const RESEND_COOLDOWN_MS = 60_000;
const RESEND_COOLDOWN_MAX_ENTRIES = 1_000;

const lastSendAtByEmail = new Map<string, number>();

/** Reserve the one send allowed for `email` in this window. */
function reserveSend(email: string, now: number = Date.now()): boolean {
  const last = lastSendAtByEmail.get(email);
  if (last !== undefined && now - last < RESEND_COOLDOWN_MS) {
    return false;
  }
  if (lastSendAtByEmail.size >= RESEND_COOLDOWN_MAX_ENTRIES) {
    for (const [key, at] of lastSendAtByEmail) {
      if (now - at >= RESEND_COOLDOWN_MS) lastSendAtByEmail.delete(key);
    }
    // Still full of live entries: drop the oldest to bound memory.
    if (lastSendAtByEmail.size >= RESEND_COOLDOWN_MAX_ENTRIES) {
      const oldest = lastSendAtByEmail.keys().next();
      if (!oldest.done) lastSendAtByEmail.delete(oldest.value);
    }
  }
  lastSendAtByEmail.set(email, now);
  return true;
}

/** Test seam: reset the per-process cooldown map. */
export function __resetResendCooldownForTests(): void {
  lastSendAtByEmail.clear();
}

export function POST(req: NextRequest): Promise<Response> {
  return withAuthCookies(() => handleResend(req));
}

async function handleResend(req: NextRequest): Promise<Response> {
  const originError = checkOrigin(req);
  if (originError) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    // malformed JSON → generic response
  }

  if (!email || !EMAIL_RE.test(email)) {
    console.error("[resend-confirmation] invalid email submitted");
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }

  if (!reserveSend(email)) {
    // Duplicate within the cooldown window: same generic answer, no second send.
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }

  try {
    const { error } = await getAuthServer().sendVerificationEmail({
      email,
      callbackURL: buildVerifyEmailRedirect(req.headers.get("origin")),
    });
    if (error) {
      console.error("[resend-confirmation] sendVerificationEmail failed", {
        status: error.status,
        code: error.code,
      });
    }
  } catch (err) {
    console.error("[resend-confirmation] unexpected error", err);
  }

  return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
}
