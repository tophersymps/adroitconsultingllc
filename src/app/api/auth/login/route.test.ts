/**
 * route.test.ts — POST /api/auth/login (t_bd7ac2a0, H1) on Managed Better Auth.
 *
 * Neon R2-1 port: the auth backend changed (Supabase GoTrue → Neon Auth
 * `signIn.email` / `signUp.email`), so the mocks changed. Every security
 * assertion from the GoTrue suite is preserved:
 *   - cross-origin POST -> 403, auth never called
 *   - rate-limited -> 429, auth never called
 *   - signin failure -> fixed generic "Invalid email or password.", never the
 *     raw upstream error detail (account enumeration + brute-force surface)
 *   - signup failure -> fixed generic message, never the raw error detail
 *   - unconfirmed email -> distinct-but-fixed 403 (US-5 recovery path)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const signInEmail = vi.fn();
  const signUpEmail = vi.fn();
  const checkRateLimit = vi.fn();
  const getClientIp = vi.fn();
  const checkOrigin = vi.fn();
  return {
    mocks: { signInEmail, signUpEmail, checkRateLimit, getClientIp, checkOrigin },
  };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: () => ({
    signIn: { email: mocks.signInEmail },
    signUp: { email: mocks.signUpEmail },
  }),
}));

vi.mock("@/lib/api-security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-security")>();
  return {
    ...actual,
    checkRateLimit: mocks.checkRateLimit,
    getClientIp: mocks.getClientIp,
    checkOrigin: mocks.checkOrigin,
  };
});

import { POST } from "./route";

const GENERIC_SIGNIN_ERROR = "Invalid email or password.";
const GENERIC_SIGNUP_ERROR =
  "Unable to create account. Please try again later.";
// Designed US-5 recovery body (t_be6b4bd2) — fixed, never the upstream detail.
const UNCONFIRMED_SIGNIN_ERROR =
  "Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or resend it below.";

function req(body: unknown, origin: string | null = "http://localhost:3000"): NextRequest {
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
  mocks.signUpEmail.mockResolvedValue({ error: null });
  mocks.signInEmail.mockResolvedValue({ error: null });
});

describe("POST /api/auth/login — H1 hardening (Neon Auth)", () => {
  it("signs in a valid user and returns ok", async () => {
    const res = await POST(
      req({ mode: "signin", email: "Reader@Example.com", password: "secret1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(mocks.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "reader@example.com", password: "secret1" }),
    );
  });

  it("omits callbackURL for a non-browser sign-in (no Origin)", async () => {
    const res = await POST(
      req({ mode: "signin", email: "reader@example.com", password: "secret1" }, null),
    );
    expect(res.status).toBe(200);
    const payload = mocks.signInEmail.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("callbackURL");
  });

  it("signs up with a name derived from the email and a same-origin verify callback", async () => {
    const res = await POST(
      req({ mode: "signup", email: "new@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("check-email");
    expect(mocks.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        password: "secret1",
        name: "new",
        callbackURL: expect.stringContaining("/field-notes"),
      }),
    );
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
    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited and never calls the auth backend", async () => {
    mocks.checkRateLimit.mockReturnValue(false);
    const res = await POST(
      req({ mode: "signin", email: "reader@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(429);
    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("returns a fixed generic message on signin failure, never the raw error", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: {
        status: 401,
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      },
    });
    const res = await POST(
      req({ mode: "signin", email: "attacker@example.com", password: "wrong!!" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe(GENERIC_SIGNIN_ERROR);
    expect(JSON.stringify(body)).not.toContain("INVALID_EMAIL_OR_PASSWORD");
  });

  it("returns a fixed generic message on signup failure, never the raw error", async () => {
    mocks.signUpEmail.mockResolvedValue({
      error: { status: 422, code: "USER_ALREADY_EXISTS", message: "User already exists" },
    });
    const res = await POST(
      req({ mode: "signup", email: "dup@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(GENERIC_SIGNUP_ERROR);
    expect(JSON.stringify(body)).not.toContain("User already exists");
    expect(JSON.stringify(body)).not.toContain("USER_ALREADY_EXISTS");
  });

  it("returns a distinct fixed 403 on sign-in of an unverified email (a11y t_be6b4bd2)", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: { status: 403, code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
    });
    const res = await POST(
      req({ mode: "signin", email: "unconfirmed@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("hasn't been confirmed");
    expect(body.error).not.toBe(GENERIC_SIGNIN_ERROR);
    expect(JSON.stringify(body)).not.toContain("EMAIL_NOT_VERIFIED");
  });

  // t_2912839f: `@neondatabase/auth` 0.7.x normalises BETTER_AUTH errors
  // before the route sees them — EMAIL_NOT_VERIFIED becomes
  // code "email_not_confirmed", status 422, message "Email verification
  // required" (the SDK's canned descriptor). These two cases pin both shapes so
  // an SDK bump cannot silently re-break the US-5 recovery path.
  it("returns the fixed 403 for the NORMALIZED SDK shape (email_not_confirmed/422)", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: {
        status: 422,
        code: "email_not_confirmed",
        message: "Email verification required",
      },
    });
    const res = await POST(
      req({ mode: "signin", email: "unconfirmed@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe(UNCONFIRMED_SIGNIN_ERROR);
    // non-enumerating: never echo the upstream/normalized code or message.
    expect(JSON.stringify(body)).not.toContain("email_not_confirmed");
    expect(JSON.stringify(body)).not.toContain("Email verification required");
  });

  it("returns the fixed 403 when the SDK falls back to validation_failed/422 with an upstream message", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: { status: 422, code: "validation_failed", message: "Email not verified" },
    });
    const res = await POST(
      req({ mode: "signin", email: "unconfirmed@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(UNCONFIRMED_SIGNIN_ERROR);
  });

  it("accepts a bare message signal with no status/code (legacy shape)", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: { message: "Email not verified" },
    });
    const res = await POST(
      req({ mode: "signin", email: "unconfirmed@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(403);
  });

  it("does NOT widen the 403 branch to a 422 validation failure of another kind", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: {
        status: 422,
        code: "validation_failed",
        message: "Invalid request parameters",
      },
    });
    const res = await POST(
      req({ mode: "signin", email: "reader@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(GENERIC_SIGNIN_ERROR);
  });

  it("does NOT treat the normalized invalid_credentials/401 as unconfirmed", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: {
        status: 401,
        code: "invalid_credentials",
        message: "Invalid email or password",
      },
    });
    const res = await POST(
      req({ mode: "signin", email: "reader@example.com", password: "wrong!!" }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe(GENERIC_SIGNIN_ERROR);
  });

  it("does NOT treat a 403 provider/feature failure that mentions confirmation as unconfirmed", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: {
        status: 403,
        code: "feature_not_supported",
        message: "Provider not supported",
      },
    });
    const res = await POST(
      req({ mode: "signin", email: "reader@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(401);
  });

  it("keeps the generic 401 for non-confirm sign-in failures", async () => {
    mocks.signInEmail.mockResolvedValue({
      error: { status: 403, code: "BANNED_USER", message: "User is banned" },
    });
    const res = await POST(
      req({ mode: "signin", email: "banned@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe(GENERIC_SIGNIN_ERROR);
  });

  it("does not leak an unconfirmed-email distinction on SIGN-UP", async () => {
    mocks.signUpEmail.mockResolvedValue({
      error: { status: 403, code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
    });
    const res = await POST(
      req({ mode: "signup", email: "dup@example.com", password: "secret1" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(GENERIC_SIGNUP_ERROR);
    expect(JSON.stringify(body)).not.toContain("confirmed");
  });

  it("does not leak the raw error in the signin 500 fallback path", async () => {
    mocks.signInEmail.mockRejectedValue(new Error("secret db detail"));
    const res = await POST(
      req({ mode: "signin", email: "reader@example.com", password: "secret1" }),
    );
    expect([401, 500]).toContain(res.status);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret db detail");
  });
});
