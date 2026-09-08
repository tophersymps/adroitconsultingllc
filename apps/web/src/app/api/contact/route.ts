import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (resets on redeploy / cold start) |
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
    console.warn("RECAPTCHA_SECRET_KEY not configured — skipping verification");
    return { valid: true, detail: { skipped: true } };
  }

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }).toString(),
  });

  const data = await res.json();
  console.log("reCAPTCHA verify response:", JSON.stringify(data));

  const valid = data.success === true && (data.score ?? 0) >= RECAPTCHA_THRESHOLD;
  return { valid, detail: data };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
type FormData = {
  fullName: string;
  email: string;
  company: string;
  role?: string;
  service: string;
  timeline?: string;
  message?: string;
  website?: string; // honeypot
  recaptchaToken?: string;
};

function validate(data: FormData): string | null {
  if (!data.fullName?.trim()) return "Full name is required.";
  if (!data.email?.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    return "Please provide a valid email address.";
  if (!data.company?.trim()) return "Company is required.";
  if (!data.service?.trim()) return "Please select a service interest.";
  return null;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FormData;

    // Honeypot: if the hidden "website" field has a value, it's a bot
    if (body.website) {
      return NextResponse.json({ success: true });
    }

    // reCAPTCHA verification (skipped in development, enforced in production)
    const isDev = process.env.NODE_ENV === "development";
    const recaptchaConfigured = !!process.env.RECAPTCHA_SECRET_KEY;
    if (recaptchaConfigured && !isDev) {
      if (!body.recaptchaToken) {
        return NextResponse.json(
          { success: false, error: "reCAPTCHA verification failed. Please try again." },
          { status: 400 },
        );
      }

      const captcha = await verifyRecaptcha(body.recaptchaToken);
      if (!captcha.valid) {
        console.warn("reCAPTCHA rejected:", JSON.stringify(captcha.detail));
        return NextResponse.json(
          { success: false, error: "reCAPTCHA verification failed. Please try again." },
          { status: 403 },
        );
      }
    }

    // Rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: "Too many submissions. Please try again later." },
        { status: 429 },
      );
    }

    // Validate
    const error = validate(body);
    if (error) {
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    // Build Salesforce Web-to-Lead payload
    const oid = process.env.SALESFORCE_OID;
    if (!oid) {
      console.error("SALESFORCE_OID is not configured");
      return NextResponse.json(
        { success: false, error: "Contact form is not configured yet. Please email us directly." },
        { status: 500 },
      );
    }

    const { first, last } = splitName(body.fullName);

    const description = [
      body.timeline ? `Timeline: ${body.timeline}` : "",
      body.message ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const params = new URLSearchParams({
      oid,
      first_name: first,
      last_name: last || "(not provided)",
      email: body.email.trim(),
      company: body.company.trim(),
      title: body.role?.trim() ?? "",
      lead_source: body.service,
      description,
      retURL: "https://adroit.io",
    });

    const sfResponse = await fetch(
      "https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        redirect: "manual",
      },
    );

    const sfStatus = sfResponse.status;
    const sfBody = await sfResponse.text().catch(() => "(unable to read body)");
    const isRedirect = sfStatus >= 300 && sfStatus < 400;

    if (!sfResponse.ok && !isRedirect) {
      console.error(
        `Salesforce Web-to-Lead failed — status: ${sfStatus}, body: ${sfBody.slice(0, 500)}`,
      );
      return NextResponse.json(
        { success: false, error: "Your inquiry could not be submitted. Please email us directly." },
        { status: 502 },
      );
    }

    console.log(
      `Lead submitted for ${body.email} — SF status: ${sfStatus}`,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again or email us directly." },
      { status: 500 },
    );
  }
}
