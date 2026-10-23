/**
 * next.config.test.ts — CSP / security header assertions (t_fd9f68c2).
 *
 * Regression guard for the HIGH finding from the merged-site security
 * review: the served CSP script-src blocked the reCAPTCHA script the contact
 * form depends on (www.google.com / www.gstatic.com), which either broke the
 * form or left bot defense inert. This test asserts the reCAPTCHA hosts are
 * present in the served CSP directives.
 *
 * Second guard — CSP connect-src for the Neon Data API origin (t_51f9ebfb, QA
 * F1 on PR #361): the browser fetches that API directly for signed-in progress
 * reads, so a missing origin silently disabled them.
 */
import { describe, it, expect } from "vitest";
import nextConfig, { NEON_DATA_API_ORIGIN_FALLBACK } from "../../next.config";

type HeaderRow = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

async function cspOf(): Promise<string> {
  const rows = await (nextConfig as { headers: () => Promise<HeaderRow[]> }).headers();
  const row = rows.find((r) => r.source === "/(.*)");
  expect(row).toBeDefined();
  const csp = row!.headers.find((h) => h.key === "Content-Security-Policy");
  expect(csp).toBeDefined();
  return csp!.value;
}

describe("next.config.ts security headers", () => {
  it("CSP script-src allows reCAPTCHA hosts (www.google.com, www.gstatic.com)", async () => {
    const value = await cspOf();
    expect(value).toContain("script-src");
    expect(value).toContain("https://www.google.com");
    expect(value).toContain("https://www.gstatic.com");
  });

  it("CSP frame-src allows the reCAPTCHA iframe host (www.google.com)", async () => {
    const value = await cspOf();
    expect(value).toContain("frame-src");
    expect(value).toContain("https://www.google.com");
  });

  it("keeps HSTS, nosniff, frame-deny and referrer policy", async () => {
    const rows = await (nextConfig as { headers: () => Promise<HeaderRow[]> }).headers();
    const keys = rows.find((r) => r.source === "/(.*)")!.headers.map((h) => h.key);
    expect(keys).toContain("Strict-Transport-Security");
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Referrer-Policy");
  });
});

/** Value of a single CSP directive, tokens space-separated. */
async function connectSrcTokens(): Promise<string[]> {
  const csp = await cspOf();
  const directive = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === "connect-src" || d.startsWith("connect-src "));
  expect(directive, "CSP is missing the connect-src directive").toBeDefined();
  return directive!.split(/\s+/);
}

describe("CSP connect-src allows the Neon Data API (t_51f9ebfb)", () => {
  it("lists the production Neon Data API origin the browser fetches", async () => {
    const tokens = await connectSrcTokens();
    expect(tokens).toContain(NEON_DATA_API_ORIGIN_FALLBACK);
  });

  it("derives an extra origin from NEXT_PUBLIC_NEON_DATA_API_URL (origin only)", async () => {
    const previous = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
    const configured =
      "https://ep-config-test.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1";
    process.env.NEXT_PUBLIC_NEON_DATA_API_URL = configured;
    try {
      const tokens = await connectSrcTokens();
      // `headers()` reads the env per call, so a per-environment Data API URL
      // (preview branch, local proxy) is allowed without a code change.
      expect(tokens).toContain(
        "https://ep-config-test.apirest.c-13.us-east-1.aws.neon.tech",
      );
      // A path would never match a fetch — only the origin belongs here.
      expect(tokens).not.toContain(configured);
      expect(tokens).toContain(NEON_DATA_API_ORIGIN_FALLBACK);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
      else process.env.NEXT_PUBLIC_NEON_DATA_API_URL = previous;
    }
  });

  it("no longer allows the retired Supabase wildcard", async () => {
    const tokens = await connectSrcTokens();
    expect(tokens.some((t) => t.includes("supabase.co"))).toBe(false);
  });
});
