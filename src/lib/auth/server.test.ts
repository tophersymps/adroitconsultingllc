/**
 * server.test.ts — the custom Neon Auth adapter (QA F1/F2, t_ab6c1cb6).
 *
 * The SDK is mocked; what is asserted is the wiring the two findings depend on:
 *   - the request context NEVER hands the SDK an empty Origin (curl / native /
 *     server-to-server used to trigger `MISSING_OR_NULL_ORIGIN` upstream);
 *   - the context reads/writes cookies under the transport-appropriate name;
 *   - `handler()` (the `/api/auth/[...path]` mount) forwards a synthesised
 *     Origin + re-prefixed cookies upstream and adapts the Set-Cookie it gets
 *     back, so an http deployment can actually store the session.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RequestContext } from "@neondatabase/auth/server";

const { mocks } = vi.hoisted(() => {
  const handleAuthProxyRequest = vi.fn();
  const createAuthServer = vi.fn((config: unknown) => ({ config }));
  const headerBag = new Map<string, string>();
  const headersStore = { get: (name: string) => headerBag.get(name.toLowerCase()) ?? null };
  return {
    mocks: { handleAuthProxyRequest, createAuthServer, headerBag, headersStore },
  };
});

vi.mock("@neondatabase/auth/server", () => ({
  createAuthServer: mocks.createAuthServer,
  handleAuthProxyRequest: mocks.handleAuthProxyRequest,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(mocks.headersStore),
}));

import {
  __fetchWithOriginRedirectGuard,
  __resetAuthServerForTests,
  getAuthServer,
} from "./server";
import { withAuthCookies } from "./cookie-jar";

/** The mocked `createAuthServer` result exposes its config for inspection. */
function configOf(): {
  context: () => Promise<RequestContext>;
  baseUrl: string;
  cookieSecret: string;
} {
  const server = getAuthServer() as unknown as {
    config: {
      context: () => Promise<RequestContext>;
      baseUrl: string;
      cookieSecret: string;
    };
  };
  return server.config;
}

function setHeaders(init: Record<string, string>): void {
  mocks.headerBag.clear();
  for (const [name, value] of Object.entries(init)) mocks.headerBag.set(name.toLowerCase(), value);
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetAuthServerForTests();
  mocks.headerBag.clear();
  process.env.NEON_AUTH_BASE_URL = "https://auth.example.test/neondb/auth";
  process.env.NEON_AUTH_COOKIE_SECRET = "x".repeat(32);
});

afterEach(() => {
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.NEON_AUTH_COOKIE_SECRET;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("getAuthServer", () => {
  it("throws a clear error when the auth env is missing", () => {
    delete process.env.NEON_AUTH_BASE_URL;
    expect(() => getAuthServer()).toThrow(/NEON_AUTH_BASE_URL/);
  });

  it("caches one instance per process", () => {
    expect(getAuthServer()).toBe(getAuthServer());
    expect(mocks.createAuthServer).toHaveBeenCalledTimes(1);
  });

  it("passes the configured base URL and cookie secret to the SDK toolkit", () => {
    getAuthServer();
    expect(mocks.createAuthServer).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://auth.example.test/neondb/auth",
        cookieSecret: "x".repeat(32),
        context: expect.any(Function),
      }),
    );
  });

  it("synthesises a canonical origin when the caller sends none (F1)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.dev";
    setHeaders({ host: "preview.example.dev" });

    const ctx = await configOf().context();
    expect(ctx.getOrigin()).toBe("https://preview.example.dev");
  });

  it("echoes a browser Origin and reads only __Secure- cookies on https (M2)", async () => {
    setHeaders({
      origin: "https://adroit.io",
      "x-forwarded-proto": "https",
      cookie:
        "neon-auth.session_token=ATTACKER; __Secure-neon-auth.session_token=tok",
    });

    const ctx = await configOf().context();
    expect(ctx.getOrigin()).toBe("https://adroit.io");
    // The planted plain name is dropped, not up-converted (CWE-384).
    expect(ctx.getCookies()).toBe("__Secure-neon-auth.session_token=tok");
  });

  it("maps an inbound plain cookie name back for upstream", async () => {
    setHeaders({ host: "192.168.1.20:3111", cookie: "neon-auth.session_token=tok" });

    const ctx = await configOf().context();
    expect(ctx.getCookies()).toBe("__Secure-neon-auth.session_token=tok");
  });
});

describe("request context cookie writes", () => {
  it("records cookies for the response jar instead of the dropped cookies() path", async () => {
    setHeaders({
      origin: "https://adroit.io",
      "x-forwarded-proto": "https",
      cookie: "neon-auth.session_token=tok",
    });

    const ctx = await configOf().context();
    const response = await withAuthCookies(async () => {
      await ctx.setCookie("__Secure-neon-auth.session_token", "fresh", {
        path: "/",
        maxAge: 60,
        secure: true,
        httpOnly: true,
        sameSite: "lax",
      });
      return new Response(null, { status: 200 });
    });

    // The adapter maps names + flags; `withAuthCookies` replays them. Over
    // https the SDK's hardened form is kept as-is.
    expect(response.headers.getSetCookie()).toEqual([
      "__Secure-neon-auth.session_token=fresh; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  it("writes the plain cookie name without Secure on plain http (F2)", async () => {
    setHeaders({ host: "192.168.1.20:3111" });

    const ctx = await configOf().context();
    const response = await withAuthCookies(async () => {
      await ctx.setCookie("__Secure-neon-auth.session_token", "fresh", {
        path: "/",
        maxAge: 60,
        secure: true,
        httpOnly: true,
        sameSite: "lax",
      });
      return new Response(null, { status: 200 });
    });

    const [setCookie] = response.headers.getSetCookie();
    expect(setCookie).toContain("neon-auth.session_token=fresh");
    expect(setCookie).not.toContain("Secure");
  });
});

describe("handler() proxy mount", () => {
  const ctx = { params: Promise.resolve({ path: ["get-session"] }) };

  it("forwards a synthesised Origin and re-prefixed cookies, then adapts Set-Cookie", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://adroit.io";
    mocks.handleAuthProxyRequest.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: {
          "set-cookie": "__Secure-neon-auth.session_token=fresh; Path=/; Secure; HttpOnly",
        },
      }),
    );

    const handlers = getAuthServer().handler();
    const response = await handlers.GET(
      new Request("http://192.168.1.20:3111/api/auth/get-session", {
        headers: { host: "192.168.1.20:3111", cookie: "neon-auth.session_token=old" },
      }),
      ctx,
    );

    const upstream = mocks.handleAuthProxyRequest.mock.calls[0][0];
    expect(upstream.path).toBe("get-session");
    expect(upstream.request.headers.get("origin")).toBe("https://adroit.io");
    expect(upstream.request.headers.get("cookie")).toBe(
      "__Secure-neon-auth.session_token=old",
    );
    // http → the refreshed cookie is stored unprefixed and without Secure.
    expect(response.headers.getSetCookie()).toEqual([
      "neon-auth.session_token=fresh; Path=/; HttpOnly",
    ]);
  });

  it("keeps the hardened cookie form over https", async () => {
    mocks.handleAuthProxyRequest.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "set-cookie": "__Secure-neon-auth.session_token=fresh; Path=/; Secure" },
      }),
    );

    const handlers = getAuthServer().handler();
    const response = await handlers.GET(
      new Request("https://adroit.io/api/auth/get-session", {
        headers: { host: "adroit.io", "x-forwarded-proto": "https", origin: "https://adroit.io" },
      }),
      ctx,
    );

    expect(response.headers.getSetCookie()).toEqual([
      "__Secure-neon-auth.session_token=fresh; Path=/; Secure",
    ]);
  });

  it("refuses a cross-origin redirect and answers a fixed 502 (QA F1)", async () => {
    const realFetch = globalThis.fetch;
    const fetchStub = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/landed" },
        }),
    );
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    try {
      // The SDK helper does exactly this: fetch() the configured baseUrl.
      mocks.handleAuthProxyRequest.mockImplementationOnce(
        async (config: { baseUrl: string; path: string }) =>
          fetch(`${config.baseUrl}/${config.path}`),
      );

      const handlers = getAuthServer().handler();
      const response = await handlers.GET(
        new Request("https://adroit.io/api/auth/get-session"),
        ctx,
      );

      // The redirect was resolved manually, never chased.
      expect(fetchStub).toHaveBeenCalledTimes(1);
      expect(fetchStub.mock.calls[0][1]).toMatchObject({ redirect: "manual" });

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toEqual({ error: "Auth service unavailable. Please try again later." });
    } finally {
      __resetAuthServerForTests();
      globalThis.fetch = realFetch;
    }
  });

  it("still follows a redirect that stays on the configured origin", async () => {
    const realFetch = globalThis.fetch;
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/neondb/auth/landed" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ session: null }, { status: 200 }));
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    try {
      mocks.handleAuthProxyRequest.mockImplementationOnce(
        async (config: { baseUrl: string; path: string }) =>
          fetch(`${config.baseUrl}/${config.path}`),
      );

      const handlers = getAuthServer().handler();
      const response = await handlers.GET(
        new Request("https://adroit.io/api/auth/get-session"),
        ctx,
      );

      expect(fetchStub).toHaveBeenCalledTimes(2);
      expect(fetchStub.mock.calls[1][0]).toBe(
        "https://auth.example.test/neondb/auth/landed",
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ session: null });
    } finally {
      __resetAuthServerForTests();
      globalThis.fetch = realFetch;
    }
  });

  it("exposes the same handler for every proxied method", () => {
    const handlers = getAuthServer().handler();
    for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"] as const) {
      expect(typeof handlers[method]).toBe("function");
    }
  });
});

describe("origin-locked fetch that the proxy mount installs", () => {
  const origin = "https://auth.example.test";
  const guard = () => ({ allowedOrigin: origin, blocked: false });

  it("returns a non-redirect upstream response untouched", async () => {
    const state = guard();
    const fetchStub = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ session: null }),
    );

    const response = await __fetchWithOriginRedirectGuard(
      fetchStub as unknown as typeof fetch,
      state,
      `${origin}/neondb/auth/get-session`,
    );

    expect(response.status).toBe(200);
    expect(state.blocked).toBe(false);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("blocks a redirect to another host without fetching it", async () => {
    const state = guard();
    const fetchStub = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );

    const response = await __fetchWithOriginRedirectGuard(
      fetchStub as unknown as typeof fetch,
      state,
      `${origin}/neondb/auth/get-session`,
    );

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
    expect(state.blocked).toBe(true);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("blocks a protocol-relative redirect that leaves the origin", async () => {
    const state = guard();
    const fetchStub = vi.fn(
      async () =>
        new Response(null, {
          status: 307,
          headers: { location: "//evil.example/landed" },
        }),
    );

    const response = await __fetchWithOriginRedirectGuard(
      fetchStub as unknown as typeof fetch,
      state,
      `${origin}/neondb/auth/get-session`,
    );

    expect(response.status).toBe(502);
    expect(state.blocked).toBe(true);
  });

  it("follows same-origin hops and stops at the first successful response", async () => {
    const state = guard();
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "/neondb/auth/one" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "/neondb/auth/two" } }),
      )
      .mockResolvedValueOnce(Response.json({ session: null }));

    const response = await __fetchWithOriginRedirectGuard(
      fetchStub as unknown as typeof fetch,
      state,
      `${origin}/neondb/auth/get-session`,
    );

    expect(response.status).toBe(200);
    expect(state.blocked).toBe(false);
    expect(fetchStub.mock.calls.map((call) => call[0])).toEqual([
      `${origin}/neondb/auth/get-session`,
      `${origin}/neondb/auth/one`,
      `${origin}/neondb/auth/two`,
    ]);
  });

  it("blocks a same-origin redirect loop instead of spinning", async () => {
    const state = guard();
    const fetchStub = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: "/neondb/auth/loop" } }),
    );

    const response = await __fetchWithOriginRedirectGuard(
      fetchStub as unknown as typeof fetch,
      state,
      `${origin}/neondb/auth/get-session`,
    );

    expect(response.status).toBe(502);
    expect(state.blocked).toBe(true);
    expect(fetchStub.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("leaves a fetch to a non-auth origin completely alone", async () => {
    const state = guard();
    const fetchStub = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 302, headers: { location: `${origin}/x` } }),
    );

    const response = await __fetchWithOriginRedirectGuard(
      fetchStub as unknown as typeof fetch,
      state,
      "https://data.example.test/rest/v1/items",
      { redirect: "follow" },
    );

    // Original init forwarded unchanged: no manual-mode coercion, no guard hit.
    expect(fetchStub.mock.calls[0][1]).toMatchObject({ redirect: "follow" });
    expect(response.status).toBe(302);
    expect(state.blocked).toBe(false);
  });
});
