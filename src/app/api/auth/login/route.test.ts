/**
 * route.test.ts — POST /api/auth/login (t_bd7ac2a0, H1).
 *
 * Security findings from val-el's merged-site audit:
 *   - H1 (CWE-307/209): login was the only auth mutation with NO rate limit,
 *     NO origin (CSRF) check, and echoed raw Supabase/GoTrue error.message on
 *     failure (account enumeration + brute-force surface). Sibling routes
 *     (reset-password/request, reset-password/update) already apply
 *     checkRateLimit(getClientIp) + checkOrigin.
 *
 * Fixed behavior asserted here:
 *   - cross-origin POST -> 403, auth never called
 *   - rate-limited -> 429, auth never called
 *   - signin failure -> fixed generic "Invalid email or password.", never the
 *     raw Supabase error.message; real detail logged server-side
 *   - signup failure -> fixed generic message, never the raw error.message
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getSupabaseServerClient = vi.fn();
  const signUp = vi.fn();
  const signInWithPassword = vi.fn();
  const checkRateLimit = vi.fn();
  const getClientIp = vi.fn();
  const checkOrigin = vi.fn();
  return {
    mocks: {
      getSupabaseServerClient,
      signUp,
      signInWithPassword,
      checkRateLimit,
      getClientIp,
      checkOrigin,
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
    },
  }),
}));

vi.mock("@/lib/api-security", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: mocks.getClientIp,
  checkOrigin: mocks.checkOrigin,
}));

import { POST } from "./route";

const GENERIC_SIGNIN_ERROR = "Invalid email or password.";
const GENERIC_SIGNUP_ERROR =
  "Unable to create account. Please try again later.";

function req(body: unknown, origin?: string): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": "10.0.0.1",
  };
  if (origin) headers["origin"] = origin;
  return new NextRequest("http://localhost:3000/api/auth/login", {
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
  mocks.signUp.mockResolvedValue({ error: null });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
});

describe("POST /api/auth/login — H1 hardening (t_bd7ac2a0)", () => {
  it("signs in a valid user and returns ok", async () => {
    const res = await POST(
      req({ mode: "signin", email: "reader@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "reader@example.com",
      password: "secret1",
    });
  });

  it("rejects a cross-origin POST with 403 before any auth call", async () => {
    mocks.checkOrigin.mockReturnValue("Forbidden origin");
    const res = await POST(
      req(
        { mode: "signin", email: "reader@example.com", password: "secret1" },
        "https://evil.example",
      ),
    );
    expect(res.status).toBe(403);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited and never calls Supabase auth", async () => {
    mocks.checkRateLimit.mockReturnValue(false);
    const res = await POST(
      req({ mode: "signin", email: "reader@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(429);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("returns a fixed generic message on signin failure, never the raw error.message", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const res = await POST(
      req({ mode: "signin", email: "attacker@example.com", password: "wrong!" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe(GENERIC_SIGNIN_ERROR);
    // Raw Supabase detail must never be reflected to the caller.
    expect(JSON.stringify(body)).not.toContain("Invalid login credentials");
  });

  it("returns a fixed generic message on signup failure, never the raw error.message", async () => {
    mocks.signUp.mockResolvedValue({
      error: { message: "User already registered" },
    });
    const res = await POST(
      req({ mode: "signup", email: "dup@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(GENERIC_SIGNUP_ERROR);
    expect(JSON.stringify(body)).not.toContain("User already registered");
  });

  it("does not leak the raw error.message in the signin 500 fallback path", async () => {
    mocks.signInWithPassword.mockRejectedValue(new Error("secret db detail"));
    const res = await POST(
      req({ mode: "signin", email: "reader@example.com", password: "secret1" }),
    );
    // The route's outer try/catch should swallow unexpected errors generically.
    expect([401, 500]).toContain(res.status);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret db detail");
  });
});
