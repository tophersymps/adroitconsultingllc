/**
 * POST /api/auth/resend-confirmation — resend the signup confirmation email.
 *
 * ADR-PWR-4: lives only in the login unconfirmed-email error state. Generic,
 * non-enumerating response (identical whether or not the email is registered),
 * rate-limited per-IP, origin-checked. Mirrors the reset-request route.
 *
 * Body: { email }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp, checkOrigin } from "@/lib/api-security";
import { buildAuthRedirect } from "@/lib/auth-emails";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERIC_MESSAGE =
  "If that account needs confirmation, we've sent a new confirmation link. Please allow a few minutes for it to arrive.";

export async function POST(req: NextRequest) {
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

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: buildAuthRedirect("/blog") },
    });
    if (error) {
      console.error("[resend-confirmation] resend failed", error.message);
    }
  } catch (err) {
    console.error("[resend-confirmation] unexpected error", err);
  }

  return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
}
