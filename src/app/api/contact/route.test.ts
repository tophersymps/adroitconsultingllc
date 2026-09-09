/**
 * route.test.ts — POST /api/contact (t_fd9f68c2 security fixes).
 *
 * Covers the three route-level hardening changes from the merged-site
 * security review (t_953e04ab / val-el findings):
 *   1. reCAPTCHA fails CLOSED (503) in production when RECAPTCHA_SECRET_KEY
 *      is unset, instead of silently skipping bot defense.
 *   2. Rate limit keyed on the trusted proxy-provided client IP (getClientIp)
 *      so a spoofed leftmost X-Forwarded-For hop cannot bypass the 3/hr/IP
 *      cap and spam the Salesforce Web-to-Lead sink.
 *   3. Valid reCAPTCHA token path still works (siteverify honored) when the
 *      secret is configured.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
  // Non-dev environment so the fail-closed path is exercisable. Tests do not
  // set NODE_ENV=development, but pin it defensively in case of a runner.
  vi.stubEnv("NODE_ENV", "test");
});

describe("POST /api/contact - reCAPTCHA fail-closed (finding 3)", () => {
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

  it("still accepts the lead when the secret is set and the token verifies", async () => {
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "secret");
    vi.stubEnv("SALESFORCE_OID", "oid123");
    const realIp = "203.0.113.50"; // distinct bucket from the rate-limit test

    // Mock the reCAPTCHA siteverify call.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("google.com/recaptcha/api/siteverify")) {
          return new Response(
            JSON.stringify({ success: true, score: 0.9 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (String(url).includes("webto.salesforce.com")) {
          return new Response("OK", { status: 302 }); // Web-to-Lead success = 302
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const res = await POST(
      makeRequest(validLead({ recaptchaToken: "good-token" }), {
        "x-forwarded-for": `6.6.6.6, ${realIp}`,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/contact - rate limit on trusted IP (finding 2)", () => {
  it("rate-limits (429) after 3 submissions from the same real IP", async () => {
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "secret");
    vi.stubEnv("SALESFORCE_OID", "oid123");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("google.com/recaptcha/api/siteverify")) {
          return new Response(
            JSON.stringify({ success: true, score: 0.9 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (String(url).includes("webto.salesforce.com")) {
          return new Response("OK", { status: 302 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const headers = { "x-forwarded-for": `6.6.6.6, ${REAL_IP}` };
    for (let i = 0; i < 3; i++) {
      const res = await POST(makeRequest(validLead({ recaptchaToken: "t" }), headers));
      expect(res.status).toBe(200);
    }
    // 4th from the same real IP → 429, despite the spoofed leftmost hop.
    const res = await POST(makeRequest(validLead({ recaptchaToken: "t" }), headers));
    expect(res.status).toBe(429);
    expect((await res.json()).status).toBe(429);
  });

  it("does NOT rate-limit a different real IP that shares the same spoofed leftmost hop", async () => {
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "secret");
    vi.stubEnv("SALESFORCE_OID", "oid123");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("google.com/recaptcha/api/siteverify")) {
          return new Response(
            JSON.stringify({ success: true, score: 0.9 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (String(url).includes("webto.salesforce.com")) {
          return new Response("OK", { status: 302 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    // Spoofed leftmost is identical for both, real IPs differ → no shared bucket.
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
