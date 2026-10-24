/**
 * route.select-error.test.ts — CWE-778 regression for GET /api/atlas/cards
 * (t_601ef414, same class as the /api/progress/summary finding).
 *
 * The catalogue loaders already fail closed — each one rethrows a PostgREST
 * `{ data: null, error }` — so this route was never at risk of a false 200. It
 * did swallow the error on the way to its 503, though, so a Data API/RLS outage
 * produced no log line at all. This pins: 503 + `private, no-store` (unchanged)
 * AND one transport-only log line (status/code — never the caller's identity).
 *
 * The existing assertions in ./route.test.ts are untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getSessionUser = vi.fn();
  const getCatalogForUserV2 = vi.fn();
  return { mocks: { getSessionUser, getCatalogForUserV2 } };
});

vi.mock("@/lib/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/catalog", () => ({
  getCatalogForUserV2: mocks.getCatalogForUserV2,
  toLearnHubCards: () => [],
}));

import { GET } from "./route";

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue({
    id: "u1",
    email: "jane@adroit.io",
    name: null,
  });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/atlas/cards — catalogue read failure (t_601ef414)", () => {
  it("keeps the 503 guest baseline and logs the PostgREST code", async () => {
    mocks.getCatalogForUserV2.mockRejectedValue({
      message: "permission denied for table courses",
      code: "42501",
    });

    const res = await GET();

    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ gate: "guest-locked", series: [] });

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [message, context] = consoleError.mock.calls[0] as [string, unknown];
    expect(message).toBe("[atlas/cards] catalogue read failed");
    expect(context).toEqual({ code: "42501" });
  });

  it("logs nothing that identifies the caller", async () => {
    mocks.getCatalogForUserV2.mockRejectedValue({ code: "XX000" });

    await GET();

    const serialized = JSON.stringify(consoleError.mock.calls);
    expect(serialized).not.toContain("u1");
    expect(serialized).not.toContain("jane@adroit.io");
  });

  it("still logs an untyped failure (empty context) instead of staying silent", async () => {
    mocks.getCatalogForUserV2.mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(503);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][1]).toEqual({});
  });

  it("does not log on the healthy path", async () => {
    mocks.getCatalogForUserV2.mockResolvedValue({ isAdmin: false, courses: [] });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
