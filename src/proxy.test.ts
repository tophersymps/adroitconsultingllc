/**
 * proxy.test.ts — session-cookie refresh (Neon R2-1).
 *
 * The proxy must refresh a live session without ever redirecting (Adroit is a
 * public site; gating happens in pages/routes). Asserted here:
 *   - no auth env → pass through, no upstream call
 *   - no session cookie → pass through, no upstream call
 *   - session cookie → one get-session call; upstream Set-Cookie is copied
 *   - upstream failure → navigation still proceeds (never a 500)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const handleAuthProxyRequest = vi.fn();
  return { mocks: { handleAuthProxyRequest } };
});

vi.mock("@neondatabase/auth/server", () => ({
  NEON_AUTH_SESSION_COOKIE_NAME: "__Secure-neon-auth.session_token",
  handleAuthProxyRequest: mocks.handleAuthProxyRequest,
}));

import { proxy } from "./proxy";

function req(cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest("http://localhost:3000/atlas", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEON_AUTH_BASE_URL = "https://auth.example.test/neondb/auth";
  process.env.NEON_AUTH_COOKIE_SECRET = "x".repeat(32);
  mocks.handleAuthProxyRequest.mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(() => {
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.NEON_AUTH_COOKIE_SECRET;
});

describe("proxy", () => {
  it("passes through when the auth env is absent", async () => {
    delete process.env.NEON_AUTH_BASE_URL;
    const res = await proxy(req("__Secure-neon-auth.session_token=abc"));
    expect(mocks.handleAuthProxyRequest).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("passes through for a guest (no session cookie)", async () => {
    const res = await proxy(req());
    expect(mocks.handleAuthProxyRequest).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("refreshes a session and copies upstream Set-Cookie headers", async () => {
    mocks.handleAuthProxyRequest.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "set-cookie": "__Secure-neon-auth.session_data=next; Path=/; Secure" },
      }),
    );
    const res = await proxy(req("__Secure-neon-auth.session_token=abc"));
    expect(mocks.handleAuthProxyRequest).toHaveBeenCalledTimes(1);
    const call = mocks.handleAuthProxyRequest.mock.calls[0][0];
    expect(call.path).toBe("get-session");
    expect(call.baseUrl).toBe("https://auth.example.test/neondb/auth");
    expect(res.headers.getSetCookie().join(";")).toContain("session_data=next");
  });

  it("still lets navigation proceed when the refresh throws", async () => {
    mocks.handleAuthProxyRequest.mockRejectedValue(new Error("ECONNRESET"));
    const res = await proxy(req("__Secure-neon-auth.session_token=abc"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
