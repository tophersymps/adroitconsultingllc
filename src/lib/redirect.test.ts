/**
 * sanitizeRedirectPath — CWE-601 open-redirect regression tests (t_6c96683f).
 *
 * Verifies Val-El's audit findings (t_d8a9dae6): external `next` values and
 * the protocol-relative / backslash bypasses must all fall back to the
 * default internal path, while genuine internal paths pass through.
 */
import { describe, it, expect } from "vitest";
import { sanitizeRedirectPath, DEFAULT_REDIRECT } from "./redirect";

describe("sanitizeRedirectPath (CWE-601)", () => {
  it("falls back for external absolute URLs", () => {
    expect(sanitizeRedirectPath("https://evil.com")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirectPath("http://evil.com/phish")).toBe(DEFAULT_REDIRECT);
  });

  it("rejects protocol-relative URLs (//)", () => {
    expect(sanitizeRedirectPath("//evil.com")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirectPath("//evil.com/steal")).toBe(DEFAULT_REDIRECT);
  });

  it("rejects backslash-escaped hosts (/\\...)", () => {
    expect(sanitizeRedirectPath("/\\evil.com")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirectPath("/\\evil.com/path")).toBe(DEFAULT_REDIRECT);
  });

  it("rejects multi-slash prefixes (///) that collapse to protocol-relative", () => {
    expect(sanitizeRedirectPath("///evil.com")).toBe(DEFAULT_REDIRECT);
  });

  it("rejects javascript: scheme and non-slash values", () => {
    expect(sanitizeRedirectPath("javascript:alert(1)")).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirectPath("blog")).toBe(DEFAULT_REDIRECT);
  });

  it("rejects null/undefined/empty", () => {
    expect(sanitizeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirectPath("")).toBe(DEFAULT_REDIRECT);
  });

  it("passes through legitimate internal relative paths", () => {
    expect(sanitizeRedirectPath("/blog")).toBe("/blog");
    expect(sanitizeRedirectPath("/learn/omni-studio-cert")).toBe(
      "/learn/omni-studio-cert",
    );
    expect(sanitizeRedirectPath("/profile")).toBe("/profile");
  });

  it("honours a custom fallback", () => {
    expect(sanitizeRedirectPath("https://evil.com", "/home")).toBe("/home");
  });
});
