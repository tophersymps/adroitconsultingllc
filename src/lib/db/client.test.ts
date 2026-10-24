/**
 * src/lib/db/client.test.ts — browser Data API client (t_51f9ebfb).
 *
 * Covers the token cache: /api/db/token is fetched at most once per TTL and
 * therefore must be invalidated explicitly when the identity changes (login /
 * logout). Without that, a guest `null` token survived up to 60 s after
 * sign-in and the previous user's JWT survived up to 60 s after sign-out.
 *
 * neon-js itself is mocked — this test is about our token provider, not about
 * PostgREST.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@neondatabase/neon-js", () => ({ createClient: createClientMock }));

import { getSupabaseClient, invalidateDbToken, resetDbTokenCache } from "./client";
import { notifyAuthChanged } from "@/lib/hooks/useAuth";

type TokenResponse = { ok: boolean; json: () => Promise<{ token: string | null }> };

let fetchMock: ReturnType<typeof vi.fn>;

/**
 * getSupabaseClient() builds the client singleton only once per module, so the
 * captured getToken comes from the FIRST createClient() call and stays valid
 * across tests (invalidateDbToken only clears the token cache).
 */
function tokenProvider(): () => Promise<string | null> {
  getSupabaseClient();
  const [config] = createClientMock.mock.calls[0] as [
    { dataApi: { getToken: () => Promise<string | null> } },
  ];
  return config.dataApi.getToken;
}

/**
 * The transport wrapper handed to neon-js (SEC-R2-2-M3(c)). It is the only hook
 * neon-js gives us between a Data API response and our module state, so the 401
 * test drives it directly.
 */
function dataApiFetch(): typeof fetch {
  getSupabaseClient();
  const [config] = createClientMock.mock.calls[0] as [
    { dataApi: { options: { global: { fetch: typeof fetch } } } },
  ];
  return config.dataApi.options.global.fetch;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_NEON_DATA_API_URL =
    "https://ep-test.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1";

  createClientMock.mockImplementation(() => ({}));

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  invalidateDbToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
});

function respondWith(token: string | null): void {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ token }),
  } satisfies TokenResponse);
}

describe("Data API token provider", () => {
  it("fetches /api/db/token once and reuses the token within the TTL", async () => {
    respondWith("jwt-user");
    const provider = tokenProvider();

    await expect(provider()).resolves.toBe("jwt-user");
    await expect(provider()).resolves.toBe("jwt-user");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/db/token",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("collapses concurrent requests into a single fetch", async () => {
    respondWith("jwt-user");
    const provider = tokenProvider();

    const [a, b] = await Promise.all([provider(), provider()]);
    expect([a, b]).toEqual(["jwt-user", "jwt-user"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops a cached guest token on invalidate (sign-in path)", async () => {
    respondWith(null);
    const provider = tokenProvider();

    await expect(provider()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Sign-in happened: the next request must re-read the new session cookie.
    invalidateDbToken();
    respondWith("jwt-user");
    await expect(provider()).resolves.toBe("jwt-user");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops a cached user token on invalidate (sign-out path)", async () => {
    respondWith("jwt-user");
    const provider = tokenProvider();

    await expect(provider()).resolves.toBe("jwt-user");

    // Sign-out happened: the previous user's JWT must not keep flowing.
    invalidateDbToken();
    respondWith(null);
    await expect(provider()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a non-OK token response as a guest (null) rather than throwing", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const provider = tokenProvider();

    await expect(provider()).resolves.toBeNull();
  });

  it("exposes resetDbTokenCache as the review-named alias of the same reset", async () => {
    expect(resetDbTokenCache).toBe(invalidateDbToken);

    respondWith("jwt-user");
    const provider = tokenProvider();
    await expect(provider()).resolves.toBe("jwt-user");

    resetDbTokenCache();
    respondWith(null);
    await expect(provider()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops the cached token when the Data API answers 401 (revoked/rotated JWT)", async () => {
    respondWith("jwt-user");
    const provider = tokenProvider();
    await expect(provider()).resolves.toBe("jwt-user");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Transport rejects the token we just sent: the session was revoked.
    fetchMock.mockResolvedValueOnce({ status: 401, ok: false, json: async () => ({}) });
    const doomed = await dataApiFetch()(
      "https://ep-test.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1/atlas_progress",
      { method: "GET" },
    );
    expect(doomed.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The very next read must go back to /api/db/token, not replay the dead JWT.
    respondWith(null);
    await expect(provider()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("leaves the cache alone for a successful Data API response", async () => {
    respondWith("jwt-user");
    const provider = tokenProvider();
    await expect(provider()).resolves.toBe("jwt-user");

    fetchMock.mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({}) });
    await dataApiFetch()("https://data.example/rest/v1/x", { method: "GET" });

    respondWith("jwt-user");
    await expect(provider()).resolves.toBe("jwt-user");
    // 1 token fetch + 1 passthrough — no refetch of the token.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops the cached token on an auth-changed broadcast (sign-out in another tab)", async () => {
    respondWith("jwt-user");
    const provider = tokenProvider();
    await expect(provider()).resolves.toBe("jwt-user");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // notifyAuthChanged() is what sign-out/login/account-switch call.
    notifyAuthChanged();

    respondWith(null);
    await expect(provider()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
