/**
 * route.test.ts — POST /api/auth/reset-password/update (t_e25638b3).
 *
 * Requires an active session (guest → 401). Password must be >= 6 chars.
 * On success calls supabase.auth.updateUser({ password }).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getSupabaseServerClient = vi.fn();
  const getUser = vi.fn();
  const updateUser = vi.fn();
  const checkRateLimit = vi.fn();
  const getClientIp = vi.fn();
  const checkOrigin = vi.fn();
  return {
    mocks: { getSupabaseServerClient, getUser, updateUser, checkRateLimit, getClientIp, checkOrigin },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
  }),
}));

vi.mock("@/lib/api-security", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
  checkOrigin: mocks.checkOrigin,
}));

import { POST } from "./route";

function req(body: unknown, origin?: string): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": "10.0.0.1",
  };
  if (origin) headers["origin"] = origin;
  return new NextRequest("http://localhost:3000/api/auth/reset-password/update", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function authed(id = "user-1") {
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  authed();
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.checkOrigin.mockReturnValue(null);
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.getClientIp.mockReturnValue("10.0.0.1");
});

describe("POST /api/auth/reset-password/update (t_e25638b3)", () => {
  it("updates the password for an authenticated session", async () => {
    const res = await POST(req({ password: "new-password-123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
  });

  it("rejects a guest with 401 (no session)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ password: "new-password-123" }));
    expect(res.status).toBe(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 6 chars (400)", async () => {
    const res = await POST(req({ password: "12345" }));
    expect(res.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a missing password (400)", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase update error as 400", async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: "Password too weak" } });
    const res = await POST(req({ password: "new-password-123" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Password too weak");
  });

  it("rejects a rate-limited request with 429 (CWE-307)", async () => {
    mocks.checkRateLimit.mockReturnValue(false);
    const res = await POST(req({ password: "new-password-123" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many attempts. Please try again later.");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin POST with 403 (CWE-352)", async () => {
    mocks.checkOrigin.mockReturnValue("Forbidden origin");
    const res = await POST(req({ password: "new-password-123" }, "https://evil.example"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden origin");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
