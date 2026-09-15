/**
 * cookie-options.test.ts — hardened Supabase session cookie (CWE-1004).
 *
 * The session token MUST never be reachable by scripts on the origin
 * (httpOnly), and must only travel over HTTPS in production (secure).
 * These tests pin the exact flags so a future edit that strips either one
 * fails loudly. The flags are asserted for BOTH environments because the
 * environment decides `secure`.
 */
import { describe, it, expect } from "vitest";
import { supabaseCookieOptions } from "./cookie-options";

describe("supabaseCookieOptions (CWE-1004 hardening)", () => {
  it("always sets httpOnly (token never readable by scripts on the origin)", () => {
    expect(supabaseCookieOptions("development").httpOnly).toBe(true);
    expect(supabaseCookieOptions("production").httpOnly).toBe(true);
    expect(supabaseCookieOptions("test").httpOnly).toBe(true);
    // Defaults to process.env.NODE_ENV; must still be httpOnly.
    expect(supabaseCookieOptions().httpOnly).toBe(true);
  });

  it("sets secure only in production (HTTPS), not over dev plain HTTP", () => {
    expect(supabaseCookieOptions("production").secure).toBe(true);
    expect(supabaseCookieOptions("development").secure).toBe(false);
    expect(supabaseCookieOptions("test").secure).toBe(false);
  });

  it("preserves lifecycle defaults (@supabase/ssr path, sameSite, maxAge)", () => {
    const opts = supabaseCookieOptions("production");
    expect(opts.path).toBe("/");
    expect(opts.sameSite).toBe("lax");
    // 400 days, same session lifetime as @supabase/ssr's default.
    expect(opts.maxAge).toBe(400 * 24 * 60 * 60);
  });
});