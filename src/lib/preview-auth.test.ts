/**
 * isPreviewEmailAllowed — draft preview allowlist tests (t_e1c8239e).
 *
 * Verifies the env-var/serconst allowlist contract: allowlisted emails pass,
 * everything else fails, and comparison is case/whitespace-insensitive on
 * both sides (arch §3.3 risk mitigation).
 *
 * NOTE: the module caches the allowlist at import time, so env changes need
 * `vi.resetModules()` + a fresh dynamic import.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

async function loadAllowlist(envValue?: string) {
  if (envValue === undefined) {
    delete process.env.PREVIEW_ALLOWED_EMAILS;
  } else {
    process.env.PREVIEW_ALLOWED_EMAILS = envValue;
  }
  vi.resetModules();
  const mod = await import("./preview-auth");
  return mod.isPreviewEmailAllowed;
}

describe("isPreviewEmailAllowed (draft preview allowlist)", () => {
  afterEach(() => {
    delete process.env.PREVIEW_ALLOWED_EMAILS;
  });

  it("allows an exact allowlisted email", async () => {
    const check = await loadAllowlist("chris@adroit.io, perry@adroit.io, editor@adroit.io");
    expect(check("chris@adroit.io")).toBe(true);
  });

  it("allows case-insensitive matches on the input side", async () => {
    const check = await loadAllowlist("chris@adroit.io, Perry@adroit.io, Editor@Adroit.io");
    expect(check("CHRIS@ADROIT.IO")).toBe(true);
    expect(check("editor@adroit.io")).toBe(true);
  });

  it("trims surrounding whitespace on the input side", async () => {
    const check = await loadAllowlist("chris@adroit.io");
    expect(check("  chris@adroit.io  ")).toBe(true);
  });

  it("rejects emails not on the allowlist", async () => {
    const check = await loadAllowlist("chris@adroit.io");
    expect(check("user@public.com")).toBe(false);
    expect(check("spam@evil.com")).toBe(false);
  });

  it("rejects null / undefined / empty", async () => {
    const check = await loadAllowlist("chris@adroit.io");
    expect(check(null)).toBe(false);
    expect(check(undefined)).toBe(false);
    expect(check("")).toBe(false);
  });

  it("falls back to the server constant when the env var is unset", async () => {
    const check = await loadAllowlist(undefined);
    // Server constant fallback — Chris's email is allowed by default.
    expect(check("chris@adroit.io")).toBe(true);
    expect(check("stranger@adroit.io")).toBe(false);
  });
});
