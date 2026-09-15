/**
 * route.test.ts — GET /auth/callback (t_e25638b3).
 *
 * Exchanges the recovery code for a session, then redirects to the
 * sanitized `next` (default /reset-password). Expired/invalid/missing
 * codes redirect to /reset-password?error=… (AC-2.4/2.5, ADR-PWR-3).
 * `next` is sanitized against open-redirect (CWE-601, AC-2.3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getSupabaseServerClient = vi.fn();
  const exchangeCodeForSession = vi.fn();
  return { mocks: { getSupabaseServerClient, exchangeCodeForSession } };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
  }),
}));

import { GET } from "./route";

function req(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("GET /auth/callback (t_e25638b3)", () => {
  it("exchanges a valid code and redirects to the sanitized next", async () => {
    const res = await GET(req("http://localhost:3000/auth/callback?code=abc123&next=/reset-password"));
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
  });

  it("defaults to /reset-password when no next is provided", async () => {
    const res = await GET(req("http://localhost:3000/auth/callback?code=abc123"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
  });

  it("sanitizes an external next to the default (CWE-601, AC-2.3)", async () => {
    const res = await GET(
      req("http://localhost:3000/auth/callback?code=abc123&next=https://evil.example"),
    );
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
  });

  it("redirects to ?error=invalid when the code is missing (AC-2.5)", async () => {
    const res = await GET(req("http://localhost:3000/auth/callback"));
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password?error=invalid");
  });

  it("redirects to ?error=expired for an expired/used code (ADR-PWR-3)", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "Email link is invalid or has expired" },
    });
    const res = await GET(req("http://localhost:3000/auth/callback?code=stale"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password?error=expired");
  });

  it("redirects to ?error=invalid when exchange throws (never a 500)", async () => {
    mocks.exchangeCodeForSession.mockRejectedValue(new Error("boom"));
    const res = await GET(req("http://localhost:3000/auth/callback?code=abc123"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password?error=invalid");
  });
});
