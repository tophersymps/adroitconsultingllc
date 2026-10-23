/**
 * auth-emails.test.ts — buildAuthRedirect (t_e25638b3).
 *
 * ADR-PWR-1: every auth-email `redirectTo` MUST point at the live origin
 * (`<siteConfig.url>/auth/callback?next=…`), never localhost. This is the
 * app-side guard against the natalie incident where Supabase's site_url
 * was localhost and every confirmation/reset email linked to an
 * unreachable host.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  authRedirectOrigin,
  buildAuthRedirect,
  buildPasswordResetRedirect,
  buildVerifyEmailRedirect,
  AUTH_ORIGIN,
  AUTH_CALLBACK_PATH,
} from "./auth-emails";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.AUTH_ALLOWED_ORIGINS;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});

describe("buildAuthRedirect (t_e25638b3)", () => {
  it("points at the live origin, never localhost (ADR-PWR-1)", () => {
    expect(AUTH_ORIGIN).not.toMatch(/localhost/);
    expect(AUTH_ORIGIN).toMatch(/^https:\/\//);
  });

  it("builds <origin>/auth/callback?next=<encoded>", () => {
    const url = buildAuthRedirect("/reset-password");
    expect(url).toBe(`${AUTH_ORIGIN}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent("/reset-password")}`);
    expect(url).toContain("/auth/callback");
    expect(url).toContain("next=%2Freset-password");
  });

  it("defaults next to /reset-password", () => {
    expect(buildAuthRedirect()).toBe(
      `${AUTH_ORIGIN}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent("/reset-password")}`,
    );
  });

  it("encodes a next with query params safely", () => {
    const url = buildAuthRedirect("/reset-password?foo=bar baz");
    expect(url).toContain(encodeURIComponent("/reset-password?foo=bar baz"));
  });
});

describe("authRedirectOrigin — bound to the configured origin set (M1, CWE-601/640)", () => {
  it("never echoes a forged request origin into a reset/verification link", () => {
    // The proven attack: Host: evil.example + Origin: https://evil.example
    // passes checkOrigin()'s same-origin branch on a self-hosted deployment,
    // then used to be echoed verbatim into the email link.
    expect(authRedirectOrigin("https://evil.example")).toBe(AUTH_ORIGIN);
    expect(buildPasswordResetRedirect("https://evil.example")).toBe(
      `${AUTH_ORIGIN}/reset-password`,
    );
    expect(buildVerifyEmailRedirect("https://evil.example")).toBe(
      `${AUTH_ORIGIN}/field-notes`,
    );
  });

  it("falls back to the canonical origin for malformed/absent origins", () => {
    for (const value of [null, undefined, "", "null", "evil.example", "javascript:alert(1)"]) {
      expect(authRedirectOrigin(value)).toBe(AUTH_ORIGIN);
    }
  });

  it("accepts a configured canonical origin and its www sibling", () => {
    expect(buildVerifyEmailRedirect(AUTH_ORIGIN)).toBe(`${AUTH_ORIGIN}/field-notes`);
    expect(buildVerifyEmailRedirect("https://www.adroit.io")).toBe(
      "https://www.adroit.io/field-notes",
    );
  });

  it("accepts deployment origins derived from config (NEXT_PUBLIC_SITE_URL / VERCEL_URL / AUTH_ALLOWED_ORIGINS)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.adroit.io";
    expect(authRedirectOrigin("https://staging.adroit.io")).toBe(
      "https://staging.adroit.io",
    );
    expect(authRedirectOrigin("https://www.staging.adroit.io")).toBe(
      "https://www.staging.adroit.io",
    );

    process.env.VERCEL_URL = "adroit-git-feature-x.vercel.app";
    expect(authRedirectOrigin("https://adroit-git-feature-x.vercel.app")).toBe(
      "https://adroit-git-feature-x.vercel.app",
    );

    process.env.AUTH_ALLOWED_ORIGINS = "https://app.adroit.io, https://tunnel.example.dev/";
    expect(authRedirectOrigin("https://app.adroit.io")).toBe(
      "https://app.adroit.io",
    );
    expect(authRedirectOrigin("https://tunnel.example.dev")).toBe(
      "https://tunnel.example.dev",
    );
  });
});
