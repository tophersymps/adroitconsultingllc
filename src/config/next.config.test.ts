/**
 * next.config.test.ts — CSP / security header assertions (t_fd9f68c2).
 *
 * Regression guard for the HIGH finding from the merged-site security
 * review: the served CSP script-src blocked the reCAPTCHA script the contact
 * form depends on (www.google.com / www.gstatic.com), which either broke the
 * form or left bot defense inert. This test asserts the reCAPTCHA hosts are
 * present in the served CSP directives.
 */
import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

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
