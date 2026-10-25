/**
 * route.test.ts — POST /api/auth/resend-confirmation (t_9690dda0).
 *
 * The duplicate-verification-email report (one signup → two emails ~1s apart)
 * traced to repeated send attempts, so the route now allows one send per
 * address per cooldown window. These tests pin the guard:
 *   - a first request sends
 *   - a second request inside the window answers the same generic 200 and does
 *     NOT call `sendVerificationEmail` again (that second call is what burned
 *     the Resend quota)
 *   - a different address is unaffected
 *   - after the window a new send is allowed (no permanent suppression)
 *   - invalid input and cross-origin requests never reach the backend
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const sendVerificationEmail = vi.fn();
  const checkRateLimit = vi.fn();
  const getClientIp = vi.fn();
  const checkOrigin = vi.fn();
  return {
    mocks: { sendVerificationEmail, checkRateLimit, getClientIp, checkOrigin },
  };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: () => ({ sendVerificationEmail: mocks.sendVerificationEmail }),
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

import { POST, __resetResendCooldownForTests } from "./route";

const GENERIC_MESSAGE =
  "If that account needs confirmation, we've sent a new confirmation link. Please allow a few minutes for it to arrive.";

function req(body: unknown, origin: string | null = "http://localhost:3000"): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": "10.0.0.1",
  };
  if (origin) headers["origin"] = origin;
  return new NextRequest("http://localhost:3000/api/auth/resend-confirmation", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetResendCooldownForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T21:00:00Z"));
  mocks.checkOrigin.mockReturnValue(null);
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.getClientIp.mockReturnValue("10.0.0.1");
  mocks.sendVerificationEmail.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/auth/resend-confirmation — duplicate-send guard", () => {
  it("sends one verification email and answers generically", async () => {
    const res = await POST(req({ email: "Reader@Example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: GENERIC_MESSAGE });
    expect(mocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "reader@example.com" }),
    );
  });

  it("does not send twice for the same address inside the cooldown window", async () => {
    await POST(req({ email: "reader@example.com" }));
    // The reported symptom: a second click ~1s later.
    vi.setSystemTime(new Date("2026-10-23T21:00:01Z"));
    const second = await POST(req({ email: "reader@example.com" }));

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ message: GENERIC_MESSAGE });
    expect(mocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("treats differently cased/spaced spellings as the same address", async () => {
    await POST(req({ email: "Reader@Example.com" }));
    await POST(req({ email: "  reader@example.com  " }));

    expect(mocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("still sends for a different address", async () => {
    await POST(req({ email: "reader@example.com" }));
    await POST(req({ email: "other@example.com" }));

    expect(mocks.sendVerificationEmail).toHaveBeenCalledTimes(2);
  });

  it("allows a new send once the cooldown window has passed", async () => {
    await POST(req({ email: "reader@example.com" }));
    vi.setSystemTime(new Date("2026-10-23T21:01:00Z")); // exactly 60s later
    await POST(req({ email: "reader@example.com" }));

    expect(mocks.sendVerificationEmail).toHaveBeenCalledTimes(2);
  });

  it("never calls the backend for an invalid address", async () => {
    const res = await POST(req({ email: "not-an-email" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: GENERIC_MESSAGE });
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin POST before any send", async () => {
    mocks.checkOrigin.mockReturnValue(new Response(null, { status: 403 }));

    const res = await POST(req({ email: "reader@example.com" }));

    expect(res.status).toBe(403);
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("keeps the generic answer when the upstream send fails", async () => {
    mocks.sendVerificationEmail.mockResolvedValue({
      error: { status: 500, code: "internal_error" },
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req({ email: "reader@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: GENERIC_MESSAGE });
    errSpy.mockRestore();
  });
});
