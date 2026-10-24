/**
 * route.test.ts — /api/auth/[...path] Managed Better Auth proxy (allowlisted).
 *
 * Security contract under test (t_be119007):
 *   - ONLY `{METHOD, path}` pairs in the allowlist reach the SDK; everything
 *     else returns 404 with no upstream call (no sign-up/email, no
 *     delete-user, no arbitrary verb).
 *   - checkOrigin() and checkRateLimit() gate every allowed request before
 *     delegation, mirroring the hand-written auth routes.
 *   - Upstream failures are mapped to fixed generic bodies — a duplicate-email
 *     sign-up payload (or any other provider error) is never echoed, so the
 *     proxy cannot be used to enumerate accounts.
 *   - A missing/unreachable auth backend returns 503 JSON, not a crash.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const handlers: Record<string, ReturnType<typeof vi.fn>> = {
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
    PATCH: vi.fn(),
  };
  const getAuthServer = vi.fn(() => ({ handler: () => handlers }));
  const checkOrigin = vi.fn((): string | null => null);
  const checkRateLimit = vi.fn((): boolean => true);
  const getClientIp = vi.fn((): string => "203.0.113.7");
  return {
    mocks: { handlers, getAuthServer, checkOrigin, checkRateLimit, getClientIp },
  };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: mocks.getAuthServer,
}));

// Keep the real validators, stub only the guards so the CSRF / rate-limit
// branches can be forced deterministically.
vi.mock("@/lib/api-security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-security")>();
  return {
    ...actual,
    checkOrigin: mocks.checkOrigin,
    checkRateLimit: mocks.checkRateLimit,
    getClientIp: mocks.getClientIp,
  };
});

import { GET, POST, PUT, DELETE, PATCH } from "./route";

const METHOD_FNS = {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
} as const;

type Verb = keyof typeof METHOD_FNS;

function req(
  path = "get-session",
  method = "GET",
  headers: Record<string, string> = {},
): NextRequest {
  const suffix = path ? `/${path}` : "";
  return new NextRequest(`http://localhost:3000/api/auth${suffix}`, {
    method,
    headers,
  });
}

function ctxFor(path: string) {
  return { params: Promise.resolve({ path: path ? path.split("/") : [] }) };
}

const getSessionCtx = ctxFor("get-session");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkOrigin.mockReturnValue(null);
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.getClientIp.mockReturnValue("203.0.113.7");
  for (const h of Object.values(mocks.handlers)) {
    h.mockResolvedValue(new Response(null, { status: 204 }));
  }
});

describe("/api/auth/[...path] allowlist", () => {
  it("delegates the allowlisted GET get-session to the SDK handler", async () => {
    const res = await GET(req(), getSessionCtx);
    expect(res.status).toBe(204);
    expect(mocks.handlers.GET).toHaveBeenCalledTimes(1);
    const [passedReq, passedCtx] = mocks.handlers.GET.mock.calls[0];
    expect(passedReq).toBeInstanceOf(NextRequest);
    expect(await passedCtx.params).toEqual({ path: ["get-session"] });
  });

  describe("non-allowlisted paths return 404 with no upstream call", () => {
    const paths = [
      "sign-up/email",
      "sign-in/email",
      "delete-user",
      "change-email",
      "send-verification-email",
      "get-session/extra",
      "",
    ];

    for (const path of paths) {
      it(`GET /${path || "(root)"}`, async () => {
        const res = await GET(req(path), ctxFor(path));
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "Not found" });
        expect(mocks.handlers.GET).not.toHaveBeenCalled();
        expect(mocks.getAuthServer).not.toHaveBeenCalled();
      });
    }
  });

  describe("non-allowlisted methods return 404 with no upstream call", () => {
    const cases: Array<[Verb, string]> = [
      ["POST", "get-session"],
      ["POST", "sign-up/email"],
      ["POST", "sign-in/email"],
      ["PUT", "get-session"],
      ["DELETE", "delete-user"],
      ["PATCH", "get-session"],
    ];

    for (const [verb, path] of cases) {
      it(`${verb} /${path}`, async () => {
        const res = await METHOD_FNS[verb](req(path, verb), ctxFor(path));
        expect(res.status).toBe(404);
        expect(mocks.handlers[verb]).not.toHaveBeenCalled();
        expect(mocks.getAuthServer).not.toHaveBeenCalled();
      });
    }
  });

  it("does not run the guards for a path outside the allowlist", async () => {
    const res = await POST(req("sign-up/email", "POST"), ctxFor("sign-up/email"));
    expect(res.status).toBe(404);
    expect(mocks.checkOrigin).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });
});

describe("/api/auth/[...path] app-level hardening", () => {
  it("rejects a foreign Origin with 403 before delegating", async () => {
    mocks.checkOrigin.mockReturnValueOnce("Forbidden origin");
    const res = await GET(
      req("get-session", "GET", { origin: "https://evil.example" }),
      getSessionCtx,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden origin" });
    expect(mocks.handlers.GET).not.toHaveBeenCalled();
  });

  it("applies the per-IP rate limit before delegating (429)", async () => {
    mocks.checkRateLimit.mockReturnValueOnce(false);
    const res = await GET(req(), getSessionCtx);
    expect(res.status).toBe(429);
    expect(mocks.handlers.GET).not.toHaveBeenCalled();
    expect(mocks.getClientIp).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("203.0.113.7");
  });
});

describe("/api/auth/[...path] error mapping", () => {
  it("maps an upstream duplicate-email error to a generic body", async () => {
    mocks.handlers.GET.mockResolvedValueOnce(
      Response.json(
        {
          message: "User already exists. Use another email.",
          code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        },
        { status: 422 },
      ),
    );
    const res = await GET(req(), getSessionCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: "Unable to process auth request. Please try again.",
    });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("already exists");
    expect(raw).not.toContain("USER_ALREADY_EXISTS");
  });

  const statuses = [400, 401, 403, 409, 422, 500, 503];
  for (const status of statuses) {
    it(`never echoes the upstream body for status ${status}`, async () => {
      mocks.handlers.GET.mockResolvedValueOnce(
        Response.json(
          { message: `leaky ${status}`, code: `LEAK_${status}` },
          { status },
        ),
      );
      const res = await GET(req(), getSessionCtx);
      const raw = JSON.stringify(await res.json());
      expect(raw).not.toContain("leaky");
      expect(raw).not.toContain("LEAK_");
    });
  }

  it("keeps its own fixed message for an upstream 429", async () => {
    mocks.handlers.GET.mockResolvedValueOnce(
      Response.json({ message: "slow down" }, { status: 429 }),
    );
    const res = await GET(req(), getSessionCtx);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Too many attempts. Please try again later.",
    });
  });

  it("passes a successful upstream response through unchanged", async () => {
    mocks.handlers.GET.mockResolvedValueOnce(
      Response.json({ session: null }, { status: 200 }),
    );
    const res = await GET(req(), getSessionCtx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ session: null });
  });

  it("returns 503 JSON when the auth backend is unavailable", async () => {
    mocks.getAuthServer.mockImplementationOnce(() => {
      throw new Error(
        "NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required",
      );
    });
    const res = await GET(req(), getSessionCtx);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Auth service unavailable");
    expect(JSON.stringify(body)).not.toContain("NEON_AUTH_COOKIE_SECRET");
  });

  it("returns 503 when the SDK handler throws", async () => {
    mocks.handlers.GET.mockRejectedValueOnce(new Error("upstream exploded"));
    const res = await GET(req(), getSessionCtx);
    expect(res.status).toBe(503);
    expect(mocks.handlers.GET).toHaveBeenCalledTimes(1);
  });
});
