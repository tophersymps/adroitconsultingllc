/**
 * route.test.ts — POST /api/auth/logout (L1, t_7ecb98d7, CWE-352).
 *
 * Logout is a state-changing POST like every other mutating auth route, so it
 * must carry the same CSRF origin check + per-IP rate limit. Behaviour for a
 * same-origin caller is unchanged (200 and a revoked session), and a backend
 * hiccup still answers 200 so the browser-side auth-changed event can clear
 * local state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const signOut = vi.fn();
  const checkRateLimit = vi.fn();
  const getClientIp = vi.fn();
  const checkOrigin = vi.fn();
  return { mocks: { signOut, checkRateLimit, getClientIp, checkOrigin } };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: () => ({ signOut: mocks.signOut }),
}));

vi.mock("@/lib/auth/cookie-jar", () => ({
  withAuthCookies: <T extends Response>(handler: () => Promise<T>) => handler(),
}));

vi.mock("@/lib/api-security", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
  checkOrigin: mocks.checkOrigin,
}));

import { POST } from "./route";

function req(origin: string | null = "http://localhost:3000"): NextRequest {
  const headers: Record<string, string> = { "x-forwarded-for": "10.0.0.1" };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost:3000/api/auth/logout", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkOrigin.mockReturnValue(null);
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.getClientIp.mockReturnValue("10.0.0.1");
  mocks.signOut.mockResolvedValue(undefined);
});

describe("POST /api/auth/logout — L1 hardening", () => {
  it("signs out a same-origin request and returns ok", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("rejects a foreign Origin with 403 before touching the auth backend", async () => {
    mocks.checkOrigin.mockReturnValue("Forbidden origin");
    const res = await POST(req("https://evil.example"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden origin" });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited and never signs out", async () => {
    mocks.checkRateLimit.mockReturnValue(false);
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("still answers 200 when the upstream signOut fails", async () => {
    mocks.signOut.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
