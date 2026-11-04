/**
 * route.test.ts — POST /api/contact (Neon persistence + notification hardening).
 *
 * Covers:
 *   1. reCAPTCHA fails CLOSED (503) in production when RECAPTCHA_SECRET_KEY
 *      is unset.
 *   2. Rate limit keyed on the trusted proxy-provided client IP (getClientIp)
 *      so a spoofed leftmost X-Forwarded-For hop cannot bypass the 3/hr/IP cap.
 *   3. Successful submissions insert into Neon via insertContactInquiry
 *      and trigger sendContactNotification.
 *   4. Database insertion failure surfaces as a 500.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockInsertContactInquiry = vi.fn();
vi.mock("@/lib/db/service", () => ({
  insertContactInquiry: (...args: unknown[]) => mockInsertContactInquiry(...args),
}));

const mockSendContactNotification = vi.fn();
vi.mock("@/lib/contact-notifications", () => ({
  sendContactNotification: (...args: unknown[]) => mockSendContactNotification(...args),
}));

import { POST } from "./route";

function makeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost:3000/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// Minimal valid lead payload (passes validate()).
function validLead(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Jane Smith",
    email: "jane@company.com",
    company: "Acme Corp",
    service: "Salesforce Platform Strategy",
    ...overrides,
  };
}

const REAL_IP = "203.0.113.7";

beforeEach(() => {
  vi.restoreAllMocks();
  mockInsertContactInquiry.mockReset();
  mockSendContactNotification.mockReset();
  mockInsertContactInquiry.mockResolvedValue({ error: null });
  mockSendContactNotification.mockResolvedValue({ emailSent: true });

  // Non-dev environment so the fail-closed path is exercisable.
  vi.stubEnv("NODE_ENV", "test");
});

describe("POST /api/contact - reCAPTCHA fail-closed", () => {
  it("returns 503 when RECAPTCHA_SECRET_KEY is unset in production (fail closed)", async () => {
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "");
    const res = await POST(
      makeRequest(validLead({ recaptchaToken: "token" }), {
        "x-forwarded-for": `6.6.6.6, ${REAL_IP}`,
      }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.status).toBe(503);
  });

  it("accepts lead, saves to Neon, and triggers notification when token verifies", async () => {
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "secret");
    const realIp = "203.0.113.50";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("google.com/recaptcha/api/siteverify")) {
          return new Response(
            JSON.stringify({ success: true, score: 0.9 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const lead = validLead({ recaptchaToken: "good-token", message: "Hello world" });
    const res = await POST(
      makeRequest(lead, {
        "x-forwarded-for": `6.6.6.6, ${realIp}`,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(mockInsertContactInquiry).toHaveBeenCalledTimes(1);
    expect(mockInsertContactInquiry).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: "Jane Smith",
        email: "jane@company.com",
        company: "Acme Corp",
        service: "Salesforce Platform Strategy",
        message: "Hello world",
      }),
    );
    expect(mockSendContactNotification).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when database insert fails", async () => {
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "secret");
    const realIp = "203.0.113.60";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("google.com/recaptcha/api/siteverify")) {
          return new Response(
            JSON.stringify({ success: true, score: 0.9 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    mockInsertContactInquiry.mockResolvedValueOnce({
      error: new Error("DB connection timeout"),
    });

    const res = await POST(
      makeRequest(validLead({ recaptchaToken: "good-token" }), {
        "x-forwarded-for": `6.6.6.6, ${realIp}`,
      }),
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(mockSendContactNotification).not.toHaveBeenCalled();
  });
});

describe("POST /api/contact - rate limit on trusted IP", () => {
  it("rate-limits (429) after 3 submissions from the same real IP", async () => {
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "secret");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("google.com/recaptcha/api/siteverify")) {
          return new Response(
            JSON.stringify({ success: true, score: 0.9 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const headers = { "x-forwarded-for": `6.6.6.6, ${REAL_IP}` };
    for (let i = 0; i < 3; i++) {
      const res = await POST(makeRequest(validLead({ recaptchaToken: "t" }), headers));
      expect(res.status).toBe(200);
    }
    // 4th from the same real IP → 429
    const res = await POST(makeRequest(validLead({ recaptchaToken: "t" }), headers));
    expect(res.status).toBe(429);
    expect((await res.json()).status).toBe(429);
  });

  it("does NOT rate-limit a different real IP that shares the same spoofed leftmost hop", async () => {
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "secret");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("google.com/recaptcha/api/siteverify")) {
          return new Response(
            JSON.stringify({ success: true, score: 0.9 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    for (let i = 0; i < 3; i++) {
      const res = await POST(
        makeRequest(
          validLead({ recaptchaToken: "t" }),
          {
            "x-forwarded-for": `6.6.6.6, 198.51.100.${i + 1}`,
          },
        ),
      );
      expect(res.status).toBe(200);
    }
  });
});
