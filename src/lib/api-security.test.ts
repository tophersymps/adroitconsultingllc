/**
 * api-security — validateQuizName + getClientIp tests.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { validateQuizName, getClientIp, checkOrigin } from "./api-security";

describe("getClientIp", () => {
  function req(headers: Record<string, string>): NextRequest {
    return new NextRequest("http://localhost:3000/api/profile", { headers });
  }

  it("prefers x-real-ip (trusted proxy) over the spoofable x-forwarded-for header", () => {
    expect(
      getClientIp(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" })),
    ).toBe("203.0.113.7");
  });

  it("takes the RIGHTMOST x-forwarded-for entry, not the attacker-controlled first", () => {
    // Client spoofs a fake leftmost value; the trusted proxy appends the real IP.
    expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.9" }))).toBe(
      "198.51.100.9",
    );
    expect(
      getClientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 198.51.100.9" })),
    ).toBe("198.51.100.9");
  });

  it("returns a single x-forwarded-for value when present alone", () => {
    expect(getClientIp(req({ "x-forwarded-for": "10.9.9.9" }))).toBe("10.9.9.9");
  });

  it("ignores empty entries in the x-forwarded-for chain", () => {
    expect(getClientIp(req({ "x-forwarded-for": " ,  , 198.51.100.9" }))).toBe(
      "198.51.100.9",
    );
  });

  it("falls back to loopback when no proxy headers are present (local dev)", () => {
    expect(getClientIp(req({}))).toBe("127.0.0.1");
  });
});

describe("validateQuizName", () => {
  it("accepts tier quiz names with colons (ADR-101)", () => {
    expect(validateQuizName("omni-studio-cert:lesson:day-01-f1-omnistudio-solution-and-industry-use-cases", "quizName")).toBeNull();
    expect(validateQuizName("omni-studio-cert:check:3", "quizName")).toBeNull();
    expect(validateQuizName("omni-studio-cert:exam", "quizName")).toBeNull();
    // bare legacy series names still pass (fallback path)
    expect(validateQuizName("omni-studio-cert", "quizName")).toBeNull();
  });

  it("rejects dots, slashes, spaces, and empty values (path-traversal guard)", () => {
    expect(validateQuizName("../etc:lesson:x", "quizName")).toContain("invalid characters");
    expect(validateQuizName("a/b:lesson:x", "quizName")).toContain("invalid characters");
    expect(validateQuizName("a b:lesson:x", "quizName")).toContain("invalid characters");
    expect(validateQuizName("omni-studio-cert:lesson:x.y", "quizName")).toContain("invalid characters");
    expect(validateQuizName("", "quizName")).toContain("required");
    expect(validateQuizName(null, "quizName")).toContain("required");
  });

  it("rejects over-long names", () => {
    expect(validateQuizName("a".repeat(201), "quizName")).toContain("characters or fewer");
  });
});

describe("checkOrigin (CSRF / F6)", () => {
  function req(origin?: string): NextRequest {
    return new NextRequest("http://localhost:3000/api/profile", {
      headers: origin ? { origin } : {},
    });
  }

  it("returns null when no Origin header is present (direct browser navigation)", () => {
    expect(checkOrigin(req())).toBeNull();
  });

  it("allows the live deployed blog origin (adroit-blog-two.vercel.app)", () => {
    // Regression for t_34f01164 — profile PATCH 403 "Forbidden origin" on the
    // live site because the "-two" deploy origin was missing from the allowlist.
    expect(checkOrigin(req("https://adroit-blog-two.vercel.app"))).toBeNull();
  });

  it("allows other known first-party origins", () => {
    expect(checkOrigin(req("https://adroit.io"))).toBeNull();
    expect(checkOrigin(req("https://www.adroit.io"))).toBeNull();
    expect(checkOrigin(req("http://localhost:3000"))).toBeNull();
  });

  it("still 403s a disallowed origin", () => {
    expect(checkOrigin(req("https://evil.example.com"))).toBe("Forbidden origin");
    expect(checkOrigin(req("https://adroit-blog-two.vercel.app.evil.io"))).toBe(
      "Forbidden origin",
    );
  });
});
