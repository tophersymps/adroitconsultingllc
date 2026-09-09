/**
 * route.test.ts — GET/PATCH /api/profile (Round 3, t_e0362113).
 *
 * The profile API is the account-identity seam: GET lazily upserts a
 * user_profiles row on first read; PATCH enforces server-side session checks,
 * validates themePref + username charset, and never trusts client RLS.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mocks } = vi.hoisted(() => {
  const getSupabaseServerClient = vi.fn();
  const getUser = vi.fn();
  const from = vi.fn();
  return { mocks: { getSupabaseServerClient, getUser, from } };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

import { GET, PATCH } from "./route";

function get(headers: Record<string, string> = {}): Promise<Response> {
  return GET(
    new NextRequest("http://localhost:3000/api/profile", {
      method: "GET",
      headers,
    }),
  );
}

function patch(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return PATCH(
    new NextRequest("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

/** Chainable fake: from("user_profiles") → .eq().maybeSingle() / .upsert() etc. */
function profileQuery({ row }: { row: unknown }) {
  const eq = vi.fn().mockReturnThis();
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn().mockReturnValue({ eq, maybeSingle, single });
  const upsert = vi.fn().mockReturnValue({ select: () => ({ single }) });
  return { select, eq, maybeSingle, upsert };
}

const AUTHED = { data: { user: { id: "u1", email: "jane@adroit.io" } } };
const GUEST = { data: { user: null } };

const PROFILE_ROW = {
  user_id: "u1",
  display_name: "Jane Doe",
  username: "janedoe",
  theme_pref: "system",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue(GUEST);
});

describe("GET /api/profile", () => {
  it("returns { user: null } for guests (mirrors /api/auth/session)", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it("returns the profile row for an authed user", async () => {
    mocks.getUser.mockResolvedValue(AUTHED);
    const q = profileQuery({ row: PROFILE_ROW });
    mocks.from.mockImplementation(() => q);
    const res = await get();
    const json = await res.json();
    expect(json).toEqual({
      user: { id: "u1", email: "jane@adroit.io" },
      profile: {
        userId: "u1",
        displayName: "Jane Doe",
        username: "janedoe",
        themePref: "system",
      },
    });
  });

  it("lazily upserts a default row when no profile exists yet", async () => {
    mocks.getUser.mockResolvedValue(AUTHED);
    // First maybeSingle → no row; the upsert path returns the inserted row.
    const first = profileQuery({ row: null });
    mocks.from
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => profileQuery({ row: PROFILE_ROW }));
    const res = await get();
    expect(res.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect((await res.json()).profile.displayName).toBe("Jane Doe");
  });

  it("429s when the per-IP rate limit is exceeded (protects lazy upsert)", async () => {
    mocks.getUser.mockResolvedValue(AUTHED);
    const ip = { "x-forwarded-for": "10.1.1.1" }; // dedicated bucket
    // First 30 GETs pass the limiter; the 31st is rejected with 429.
    for (let i = 0; i < 30; i++) {
      const res = await get(ip);
      expect([200, 401]).toContain(res.status);
    }
    const blocked = await get(ip);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "Too many requests" });
  });
});

describe("PATCH /api/profile", () => {
  it("401s without a session", async () => {
    const res = await patch({ displayName: "Jane" });
    expect(res.status).toBe(401);
  });

  it("403s a disallowed Origin (CSRF check, F6)", async () => {
    const res = await patch(
      { displayName: "Jane" },
      { origin: "https://evil.example.com" },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden origin" });
  });

  it("does NOT reject the live deployed origin (t_34f01164 regression)", async () => {
    // Origin: https://adroit-blog-two.vercel.app must pass the CSRF check and
    // proceed to the session check (guest → 401, not 403 Forbidden origin).
    const res = await patch(
      { displayName: "Jane" },
      { origin: "https://adroit-blog-two.vercel.app" },
    );
    expect(res.status).toBe(401);
  });

  it("429s when the per-IP rate limit is exceeded", async () => {
    mocks.getUser.mockResolvedValue(AUTHED);
    const q = profileQuery({ row: PROFILE_ROW });
    mocks.from.mockImplementation(() => q);
    const ip = { "x-forwarded-for": "10.9.9.9" }; // dedicated bucket
    // First 30 PATCHes pass the limiter (they hit auth/validation);
    // the 31st is rejected with 429.
    for (let i = 0; i < 30; i++) {
      const res = await patch({ themePref: "dark" }, ip);
      expect([200, 400, 401]).toContain(res.status);
    }
    const blocked = await patch({ themePref: "dark" }, ip);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "Too many requests" });
  });

  it("rejects an empty body (no fields to update)", async () => {
    mocks.getUser.mockResolvedValue(AUTHED);
    const res = await patch({});
    expect(res.status).toBe(400);
  });

  it("rejects an invalid themePref", async () => {
    mocks.getUser.mockResolvedValue(AUTHED);
    const res = await patch({ themePref: "sepia" });
    expect(res.status).toBe(400);
  });

  it("rejects a bad username charset", async () => {
    mocks.getUser.mockResolvedValue(AUTHED);
    const res = await patch({ username: "Jane Doe!" });
    expect(res.status).toBe(400);
  });

  it("upserts valid updates and returns the profile", async () => {
    mocks.getUser.mockResolvedValue(AUTHED);
    const q = profileQuery({ row: { ...PROFILE_ROW, theme_pref: "dark" } });
    mocks.from.mockImplementation(() => q);
    const res = await patch({ themePref: "dark" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile.themePref).toBe("dark");
    // upsert receives user_id + theme_pref
    const upsertCall = q.upsert.mock.calls[0][0];
    expect(upsertCall).toMatchObject({ user_id: "u1", theme_pref: "dark" });
  });
});
