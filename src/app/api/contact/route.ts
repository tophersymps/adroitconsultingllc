import { NextRequest, NextResponse } from "next/server";
import type {
  ContactLeadPayload,
  ContactSubmitResult,
} from "@/shared/contracts";
import { checkOrigin, getClientIp } from "@/lib/api-security";
import { insertContactInquiry } from "@/lib/db/service";
import { sendContactNotification } from "@/lib/contact-notifications";

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (resets on redeploy / cold start). Ported from
// the marketing /api/contact: 3 submissions per IP per hour.
// ---------------------------------------------------------------------------
const submissions = new Map<string, number[]>();
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (submissions.get(ip) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  submissions.set(ip, timestamps);
  return false;
}

// ---------------------------------------------------------------------------
// reCAPTCHA v3 verification
// ---------------------------------------------------------------------------
const RECAPTCHA_THRESHOLD = 0.5;

async function verifyRecaptcha(
  token: string,
): Promise<{ valid: boolean; detail: Record<string, unknown> }> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    // Callers guard on RECAPTCHA_SECRET_KEY before reaching here in
    // production, so this branch is dev-only (test/verification path).
    console.warn("RECAPTCHA_SECRET_KEY not configured - skipping verification");
    return { valid: true, detail: { skipped: true } };
  }

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }).toString(),
  });

  const data = await res.json();
  const valid = data.success === true && (data.score ?? 0) >= RECAPTCHA_THRESHOLD;
  return { valid, detail: data };
}

// ---------------------------------------------------------------------------
// Validation (fields match ContactLeadPayload)
// ---------------------------------------------------------------------------
function validate(data: ContactLeadPayload): string | null {
  if (!data.fullName?.trim()) return "Full name is required.";
  if (data.fullName.length > 200) return "Full name is too long.";
  if (!data.email?.trim()) return "Email is required.";
  if (data.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    return "Please provide a valid email address.";
  if (!data.company?.trim()) return "Company is required.";
  if (data.company.length > 200) return "Company name is too long.";
  if (!data.service?.trim()) return "Please select a service interest.";
  if (data.service.length > 200) return "Service selection is too long.";
  if (data.role && data.role.length > 200) return "Role is too long.";
  if (data.timeline && data.timeline.length > 200) return "Timeline is too long.";
  if (data.message && data.message.length > 5000) return "Message must be 5,000 characters or fewer.";
  return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest): Promise<NextResponse<ContactSubmitResult>> {
  // CSRF/origin allowlist gate (merged host + preview origins).
  const originError = checkOrigin(request);
  if (originError) {
    return NextResponse.json(
      { ok: false, error: originError, status: 403 },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as ContactLeadPayload;

    // Honeypot: if the hidden "website" field has a value, it's a bot
    if (body.website) {
      return NextResponse.json({ ok: true });
    }

    // reCAPTCHA verification. In development (no secret) it is skipped;
    // in production a missing secret is a hard failure (503) so the
    // anti-bot control can never silently go inert: fail closed, not open.
    const isDev = process.env.NODE_ENV === "development";
    if (!isDev && !process.env.RECAPTCHA_SECRET_KEY) {
      console.error(
        "RECAPTCHA_SECRET_KEY is not configured - refusing contact submission (fail closed)",
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Contact form is temporarily unavailable. Please email us directly.",
          status: 503,
        },
        { status: 503 },
      );
    }

    // Rate limiting (keyed on the trusted proxy-provided client IP, not a
    // client-spoofable header; see getClientIp in lib/api-security). Checked
    // before outbound reCAPTCHA verification so rate-limited floods do not
    // consume external API quota.
    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { ok: false, error: "Too many submissions. Please try again later.", status: 429 },
        { status: 429 },
      );
    }

    if (!isDev) {
      if (!body.recaptchaToken) {
        return NextResponse.json(
          { ok: false, error: "reCAPTCHA verification failed. Please try again.", status: 400 },
          { status: 400 },
        );
      }

      const captcha = await verifyRecaptcha(body.recaptchaToken);
      if (!captcha.valid) {
        return NextResponse.json(
          { ok: false, error: "reCAPTCHA verification failed. Please try again.", status: 403 },
          { status: 403 },
        );
      }
    }

    // Validate
    const error = validate(body);
    if (error) {
      return NextResponse.json({ ok: false, error, status: 400 }, { status: 400 });
    }

    // Store the inquiry in Neon (privileged write path)
    const writeResult = await insertContactInquiry({
      full_name: body.fullName,
      email: body.email,
      company: body.company,
      role: body.role,
      service: body.service,
      timeline: body.timeline,
      message: body.message,
    });

    if (writeResult.error) {
      console.error("Failed to store contact inquiry in Neon:", writeResult.error);
      return NextResponse.json(
        { ok: false, error: "Your inquiry could not be submitted. Please email us directly.", status: 500 },
        { status: 500 },
      );
    }

    // Send notifications (email to contact@adroit.io, optional Discord)
    await sendContactNotification(body);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Contact form error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again or email us directly.", status: 500 },
      { status: 500 },
    );
  }
}
