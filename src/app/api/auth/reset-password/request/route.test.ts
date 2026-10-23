/**
 * route.test.ts — POST /api/auth/reset-password/request (t_e25638b3) on
 * Managed Better Auth.
 *
 * Enumeration-safety (AC-1.2/1.7): the route returns the SAME generic
 * success body whether the email is registered, unregistered, malformed, or
 * the auth backend fails — an attacker cannot distinguish a valid account.
 * Rate-limited per-IP (AC-1.5) and origin-checked (AC-1.6).
 *
 * Neon R2-1: upstream is `requestPasswordReset({ email, redirectTo })`, and
 * the redirect must be the query-free reset page (Better Auth appends the
 * token itself).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const requestPasswordReset = vi.fn();
  const checkRateLimit = vi.fn();
  const getClientIp = vi.fn();
  const checkOrigin = vi.fn();
  return {
    mocks: { requestPasswordReset, checkRateLimit, getClientIp, checkOrigin },
  };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: () => ({ requestPasswordReset: mocks.requestPasswordReset }),
}));

vi.mock("@/lib/api-security", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
  checkOrigin: mocks.checkOrigin,
}));

import { POST } from "./route";

const GENERIC_MESSAGE =
  "If an account exists for that email, we've sent a password reset link. Please allow a few minutes for it to arrive.";

function req(body: unknown, origin: string | null = "http://localhost:3000"): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": "10.0.0.1",
  };
  if (origin) headers["origin"] = origin;
  return new NextRequest("http://localhost:3000/api/auth/reset-password/request", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkOrigin.mockReturnValue(null);
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.getClientIp.mockReturnValue("10.0.0.1");
  mocks.requestPasswordReset.mockResolvedValue({ error: null });
});

describe("POST /api/auth/reset-password/request — enumeration safety (Neon Auth)", () => {
  it("returns the generic message for a registered email", async () => {
    const res = await POST(req({ email: "Reader@Example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe(GENERIC_MESSAGE);
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "reader@example.com",
      // Query-free AND same-origin: Better Auth appends `?token=…` itself and
      // rejects a redirect whose origin differs from the request's Origin.
      redirectTo: "http://localhost:3000/reset-password",
    });
  });

  it("returns the SAME generic message for an unregistered email (no enumeration)", async () => {
    mocks.requestPasswordReset.mockResolvedValue({
      error: { status: 200, code: "USER_NOT_FOUND", message: "User not found" },
    });
    const res = await POST(req({ email: "nobody@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe(GENERIC_MESSAGE);
  });

  it("returns the SAME generic message for a malformed email (no enumeration)", async () => {
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe(GENERIC_MESSAGE);
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("returns the SAME generic message when the auth backend throws", async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error("email service down"));
    const res = await POST(req({ email: "reader@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe(GENERIC_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("email service down");
  });

  it("returns the SAME generic message when rate-limited (AC-1.5)", async () => {
    mocks.checkRateLimit.mockReturnValue(false);
    const res = await POST(req({ email: "reader@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe(GENERIC_MESSAGE);
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin POST (AC-1.6)", async () => {
    mocks.checkOrigin.mockReturnValue("Forbidden origin");
    const res = await POST(req({ email: "reader@example.com" }, "https://evil.example"));
    expect(res.status).toBe(403);
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });
});
