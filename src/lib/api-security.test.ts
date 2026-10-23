/**
 * api-security — validateQuizName + getClientIp tests.
 */
import { describe, it, expect, afterEach } from "vitest";
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
  /**
   * Build a request whose Host matches the URL. `host` is explicit because
   * `NextRequest` does not synthesise it from the URL, and the same-origin
   * check (QA F1, t_ab6c1cb6) is the whole point of these tests.
   */
  function req(
    origin?: string,
    opts: { url?: string; host?: string; proto?: string } = {},
  ): NextRequest {
    const url = opts.url ?? "http://localhost:3000/api/profile";
    const withHost = opts.host !== undefined ? opts.host : new URL(url).host;
    const headers: Record<string, string> = {};
    if (withHost) headers.host = withHost;
    if (origin) headers.origin = origin;
    if (opts.proto) headers["x-forwarded-proto"] = opts.proto;
    return new NextRequest(url, { headers });
  }

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.AUTH_ALLOWED_ORIGINS;
    delete process.env.VERCEL_URL;
  });

  it("returns null when no Origin header is present (direct browser navigation)", () => {
    expect(checkOrigin(req())).toBeNull();
  });

  it("accepts a same-origin POST from whatever host serves the deployment", () => {
    // Regression (QA F1, t_ab6c1cb6): previews / custom domains / plain-http
    // staging were 403'd because the allowlist was a literal production list.
    expect(
      checkOrigin(
        req("http://192.168.1.20:3111", {
          url: "http://192.168.1.20:3111/api/auth/login",
        }),
      ),
    ).toBeNull();
    // …including behind a TLS-terminating proxy (x-forwarded-proto).
    expect(
      checkOrigin(
        req("https://preview-abc123.vercel.app", {
          url: "http://preview-abc123.vercel.app/api/auth/login",
          proto: "https",
        }),
      ),
    ).toBeNull();
  });

  it("allows the configured canonical origin and its www sibling", () => {
    expect(checkOrigin(req("https://adroit.io", { host: "elsewhere.test" }))).toBeNull();
    expect(checkOrigin(req("https://www.adroit.io", { host: "elsewhere.test" }))).toBeNull();
  });

  it("derives cross-origin allowlist entries from env (NEXT_PUBLIC_SITE_URL / VERCEL_URL / AUTH_ALLOWED_ORIGINS)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.adroit.io";
    expect(
      checkOrigin(req("https://staging.adroit.io", { host: "api.internal:9000" })),
    ).toBeNull();
    expect(
      checkOrigin(req("https://www.staging.adroit.io", { host: "api.internal:9000" })),
    ).toBeNull();

    process.env.VERCEL_URL = "adroit-git-feature-x.vercel.app";
    expect(
      checkOrigin(
        req("https://adroit-git-feature-x.vercel.app", { host: "api.internal:9000" }),
      ),
    ).toBeNull();

    process.env.AUTH_ALLOWED_ORIGINS =
      "https://app.adroit.io, https://tunnel.example.dev/";
    expect(
      checkOrigin(req("https://app.adroit.io", { host: "api.internal:9000" })),
    ).toBeNull();
    expect(
      checkOrigin(req("https://tunnel.example.dev", { host: "api.internal:9000" })),
    ).toBeNull();
  });

  it("still 403s a genuinely foreign origin", () => {
    expect(
      checkOrigin(req("https://evil.example.com", { host: "elsewhere.test" })),
    ).toBe("Forbidden origin");
    expect(
      checkOrigin(req("https://adroit.io.evil.io", { host: "elsewhere.test" })),
    ).toBe("Forbidden origin");
    expect(
      checkOrigin(req("https://evil.example.com:443", { host: "evil.example.com:8443" })),
    ).toBe("Forbidden origin");
  });

  it("rejects an opaque `null` Origin (sandboxed iframe / file://)", () => {
    expect(checkOrigin(req("null", { host: "elsewhere.test" }))).toBe("Forbidden origin");
  });
});
