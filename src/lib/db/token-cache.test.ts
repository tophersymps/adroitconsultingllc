/**
 * src/lib/db/token-cache.test.ts — the identity-change token cache, extracted
 * out of ./client by perf-P1 (PR #361).
 *
 * Two things are covered:
 *   1. Behaviour: the cache/TTL/invalidate semantics must not change now that
 *      the code lives in its own module (client.test.ts covers the same paths
 *      through the re-export).
 *   2. The regression itself: `Header`, the login page and `useAuth` are on
 *      public routes and must import the cache from a module that carries no
 *      Neon SDK. If one of them goes back to `@/lib/db/client`, every route
 *      that renders `Header` (/, /atlas, /tags) ships the ~270 KB Neon chunk
 *      again. This test bites on exactly that import.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  getToken,
  invalidateDbToken,
  resetDbTokenCache,
} from "./token-cache";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  invalidateDbToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(token: string | null): void {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ token }) });
}

describe("db token cache", () => {
  it("fetches /api/db/token once and reuses the token within the TTL", async () => {
    respondWith("jwt-user");

    await expect(getToken()).resolves.toBe("jwt-user");
    await expect(getToken()).resolves.toBe("jwt-user");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/db/token",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("collapses concurrent reads into one fetch", async () => {
    respondWith("jwt-user");

    await expect(Promise.all([getToken(), getToken()])).resolves.toEqual([
      "jwt-user",
      "jwt-user",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops the cache on invalidateDbToken (sign-in / sign-out)", async () => {
    respondWith(null);
    await expect(getToken()).resolves.toBeNull();

    invalidateDbToken();
    respondWith("jwt-user");
    await expect(getToken()).resolves.toBe("jwt-user");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps resetDbTokenCache as the same operation", async () => {
    expect(resetDbTokenCache).toBe(invalidateDbToken);

    respondWith("jwt-user");
    await expect(getToken()).resolves.toBe("jwt-user");

    resetDbTokenCache();
    respondWith(null);
    await expect(getToken()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a failed token response as a guest instead of throwing", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(getToken()).resolves.toBeNull();
  });
});

describe("token-cache is SDK-free (perf-P1 bundle guard)", () => {
  const root = resolve(__dirname, "../..");

  /** Every source file on a route that renders Header, or signs in/out. */
  const cacheConsumers = [
    "components/Header.tsx",
    "app/login/page.tsx",
    "lib/hooks/useAuth.ts",
  ];

  it("token-cache.ts imports nothing (so it cannot pull the Neon SDK)", () => {
    const source = readFileSync(resolve(__dirname, "token-cache.ts"), "utf8");
    const imports = source.match(/^\s*import\s.+$/gm) ?? [];
    expect(imports).toEqual([]);
    expect(source).not.toMatch(/from\s*["']@neondatabase\/neon-js["']/);
    expect(source).not.toMatch(/require\(\s*["']@neondatabase\/neon-js["']/);
  });

  for (const file of cacheConsumers) {
    it(`${file} imports the cache from @/lib/db/token-cache, not the Neon client`, () => {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).toContain('from "@/lib/db/token-cache"');
      expect(source).not.toMatch(
        /import\s*\{[^}]*invalidateDbToken[^}]*\}\s*from\s*"@\/lib\/db\/client"/,
      );
    });
  }

  it("./client still re-exports the cache surface for existing call sites", async () => {
    // vi.mock keeps the Neon SDK out of the test graph; only the re-export
    // identity is under test here.
    vi.doMock("@neondatabase/neon-js", () => ({ createClient: vi.fn() }));
    const client = await import("./client");
    expect(client.invalidateDbToken).toBe(invalidateDbToken);
    expect(client.getToken).toBe(getToken);
    expect(client.resetDbTokenCache).toBe(invalidateDbToken);
    vi.doUnmock("@neondatabase/neon-js");
  });
});
