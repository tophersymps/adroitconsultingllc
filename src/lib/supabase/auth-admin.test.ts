/**
 * auth-admin.test.ts — GoTrue Admin API helpers (QA fix t_48183726).
 *
 * Covers pagination (the admin list has no total/next_page, so we page until a
 * short page), 404→null for getAuthUser, and the bulk existence check.
 * fetch is stubbed; no live network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  listAuthUsers,
  getAuthUser,
  authUserIdsExist,
  GoTrueError,
} from "./auth-admin";

// The helper reads these at module load — set them before the import so
// assertCreds() passes while fetch is stubbed.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

function mockFetchOnce(
  status: number,
  body: unknown,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listAuthUsers", () => {
  it("collects users across pages and stops on a short page", async () => {
    const fetchFn = mockFetchOnce(200, {
      users: [
        { id: "1", email: "a@x.io" },
        { id: "2", email: "b@x.io" },
      ],
    });
    // Return fewer than per_page (200) → one call only.
    const users = await listAuthUsers();
    expect(users).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain(
      "/auth/v1/admin/users?per_page=200&page=1",
    );
  });

  it("pages again when a page is exactly full (per_page=200)", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      email: `u${i}@x.io`,
    }));
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({
          users: calls === 1 ? fullPage : [{ id: "last", email: "last@x.io" }],
        }),
      };
    });
    vi.stubGlobal("fetch", fn);
    const users = await listAuthUsers();
    expect(calls).toBe(2);
    expect(users).toHaveLength(201);
  });
});

describe("getAuthUser", () => {
  it("returns the user for a 200", async () => {
    mockFetchOnce(200, { id: "abc", email: "me@x.io" });
    await expect(getAuthUser("abc")).resolves.toEqual({
      id: "abc",
      email: "me@x.io",
    });
  });

  it("returns null for a 404 (unknown user)", async () => {
    mockFetchOnce(404, { msg: "not found" });
    await expect(getAuthUser("missing")).resolves.toBeNull();
  });

  it("returns null for a 400 (non-UUID id) — matches old maybeSingle", async () => {
    mockFetchOnce(400, { error_code: "validation_failed" });
    await expect(getAuthUser("not-a-uuid")).resolves.toBeNull();
  });

  it("propagates a 5xx as an error (500, not a silent null)", async () => {
    mockFetchOnce(500, { msg: "boom" });
    await expect(getAuthUser("abc")).rejects.toBeInstanceOf(GoTrueError);
  });
});

describe("authUserIdsExist", () => {
  it("returns the set of known ids from one list call", async () => {
    mockFetchOnce(200, {
      users: [
        { id: "1", email: "a@x.io" },
        { id: "2", email: "b@x.io" },
      ],
    });
    const known = await authUserIdsExist(["1", "2", "3"]);
    expect(known.has("1")).toBe(true);
    expect(known.has("2")).toBe(true);
    expect(known.has("3")).toBe(false);
  });
});
