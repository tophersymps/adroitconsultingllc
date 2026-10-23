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

import { getSupabaseClient, invalidateDbToken } from "./client";

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
});
