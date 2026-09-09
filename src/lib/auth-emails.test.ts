/**
 * auth-emails.test.ts — buildAuthRedirect (t_e25638b3).
 *
 * ADR-PWR-1: every auth-email `redirectTo` MUST point at the live origin
 * (`<siteConfig.url>/auth/callback?next=…`), never localhost. This is the
 * app-side guard against the natalie incident where Supabase's site_url
 * was localhost and every confirmation/reset email linked to an
 * unreachable host.
 */
import { describe, it, expect } from "vitest";
import { buildAuthRedirect, AUTH_ORIGIN, AUTH_CALLBACK_PATH } from "./auth-emails";

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
