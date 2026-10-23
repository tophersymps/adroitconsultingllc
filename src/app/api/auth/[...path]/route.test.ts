/**
 * route.test.ts — /api/auth/[...path] Managed Better Auth proxy.
 *
 * The SDK handler is mocked. This asserts the wiring contract:
 *   - every HTTP verb delegates to the matching SDK handler with the same
 *     params promise (so the SDK sees the full path segments)
 *   - a missing/unreachable auth backend returns a 503 JSON error, not a
 *     module-load crash or a 500 with a stack trace
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
  return { mocks: { handlers, getAuthServer } };
});

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: mocks.getAuthServer,
}));

import { GET, POST, PUT, DELETE, PATCH } from "./route";

function req(): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/get-session");
}

const ctx = { params: Promise.resolve({ path: ["get-session"] }) };

beforeEach(() => {
  vi.clearAllMocks();
  for (const h of Object.values(mocks.handlers)) {
    h.mockResolvedValue(new Response(null, { status: 204 }));
  }
});

describe("/api/auth/[...path]", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
    ["PUT", PUT],
    ["DELETE", DELETE],
    ["PATCH", PATCH],
  ] as const)("delegates %s to the SDK handler", async (method, fn) => {
    const res = await fn(req(), ctx);
    expect(res.status).toBe(204);
    expect(mocks.handlers[method]).toHaveBeenCalledTimes(1);
    const [, passedCtx] = mocks.handlers[method].mock.calls[0];
    expect(await passedCtx.params).toEqual({ path: ["get-session"] });
  });

  it("returns 503 JSON when the auth backend is unavailable", async () => {
    mocks.getAuthServer.mockImplementationOnce(() => {
      throw new Error("NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required");
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Auth service unavailable");
    expect(JSON.stringify(body)).not.toContain("NEON_AUTH_COOKIE_SECRET");
  });
});
