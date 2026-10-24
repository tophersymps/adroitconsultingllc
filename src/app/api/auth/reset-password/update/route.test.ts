/**
 * route.test.ts — POST /api/auth/reset-password/update (t_e25638b3) on
 * Managed Better Auth.
 *
 * Neon R2-1: the reset token from the email IS the credential, so the route
 * redeems it with `resetPassword({ newPassword, token })` — no session needed
 * (imported legacy users are signed out). Security behavior preserved:
 * origin check, per-IP rate limit, min-6 validation, and a fixed non-leaking
 * error body (never the raw provider error).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const resetPassword = vi.fn();
  const checkRateLimit = vi.fn();
  const getClientIp = vi.fn();
  const checkOrigin = vi.fn();
  return { mocks: { resetPassword, checkRateLimit, getClientIp, checkOrigin } };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: () => ({ resetPassword: mocks.resetPassword }),
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

const TOKEN = "valid-reset-token";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resetPassword.mockResolvedValue({ error: null });
  mocks.checkOrigin.mockReturnValue(null);
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.getClientIp.mockReturnValue("10.0.0.1");
});

describe("POST /api/auth/reset-password/update (Neon Auth)", () => {
  it("redeems the token and sets the new password", async () => {
    const res = await POST(req({ password: "new-password-123", token: TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      newPassword: "new-password-123",
      token: TOKEN,
    });
  });

  it("rejects a request without a token with 401 (no session, no credential)", async () => {
    const res = await POST(req({ password: "new-password-123" }));
    expect(res.status).toBe(401);
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 6 chars (400)", async () => {
    const res = await POST(req({ password: "12345", token: TOKEN }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Password must be at least 6 characters.");
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("rejects a password above the upstream 128-char cap (400)", async () => {
    const res = await POST(req({ password: "a".repeat(129), token: TOKEN }));
    expect(res.status).toBe(400);
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("rejects a missing password (400)", async () => {
    const res = await POST(req({ token: TOKEN }));
    expect(res.status).toBe(400);
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("surfaces an upstream reset failure as a fixed 400 without leaking detail", async () => {
    mocks.resetPassword.mockResolvedValue({
      error: { status: 400, code: "INVALID_TOKEN", message: "Invalid token" },
    });
    const res = await POST(req({ password: "new-password-123", token: "stale" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(
      "This reset link is invalid or has expired. Please request a new one.",
    );
    expect(JSON.stringify(body)).not.toContain("Invalid token");
  });

  it("rejects a rate-limited request with 429 (CWE-307)", async () => {
    mocks.checkRateLimit.mockReturnValue(false);
    const res = await POST(req({ password: "new-password-123", token: TOKEN }));
    expect(res.status).toBe(429);
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin POST with 403 (CWE-352)", async () => {
    mocks.checkOrigin.mockReturnValue("Forbidden origin");
    const res = await POST(
      req({ password: "new-password-123", token: TOKEN }, "https://evil.example"),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden origin");
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });
});
