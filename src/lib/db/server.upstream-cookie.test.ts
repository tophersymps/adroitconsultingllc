/**
 * server.upstream-cookie.test.ts — the SSR session read must agree with the
 * WRITE path's transport decision (t_c03fea8a).
 *
 * The defect: over plain http the browser stores the session under the plain
 * `neon-auth.*` names (the transport module's insecure form), but
 * `getNeonSessionUser()` forwarded the raw `Cookie:` header to `/get-session`
 * untouched. The Managed Better Auth service only reads the
 * `__Secure-neon-auth.*` names, so it answered "no user" and every gated
 * server component rendered as a guest: `/profile` showed its locked-sky
 * teaser and `/settings` bounced to `/login?next=/settings` for a signed-in
 * developer at `http://localhost:3000`.
 *
 * What is pinned here:
 *   plain cookie + insecure request  -> the upstream hop carries the
 *                                       `__Secure-` name and identity resolves
 *   prefixed cookie + secure request -> the header is byte-for-byte unchanged
 *   no session cookie                -> no `/get-session` call at all
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, headersMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock, headers: headersMock }));

import { __resetMintCooldown, getNeonSessionUser } from "./server";
import { resetAnonymousTokenCacheForTests } from "./anonymous-token";

const AUTH_BASE = "https://auth.test/neondb/auth";
const USER = {
  id: "3f1e7c2a-0000-4000-8000-000000000001",
  email: "signed-in@example.com",
};

type Captured = { url: string; headers: Headers };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  return new Headers(init?.headers ?? (input as Request)?.headers ?? undefined);
}

/** Record every outbound request; answer `/get-session` the way the service does. */
function stubFetch(): Captured[] {
  const captured: Captured[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const headers = requestHeaders(input, init);
      captured.push({ url, headers });
      if (url === `${AUTH_BASE}/get-session`) {
        // The service only recognises the SDK's `__Secure-` wire name: a plain
        // `neon-auth.session_token` (or no auth cookie) is "unauthenticated".
        const sent = (headers.get("Cookie") ?? "")
          .split(";")
          .map((pair) => pair.trim());
        const hasSession = sent.some((pair) =>
          pair.startsWith("__Secure-neon-auth.session_token="),
        );
        return hasSession
          ? jsonResponse({ user: USER })
          : jsonResponse({ error: "unauthenticated" }, 401);
      }
      return jsonResponse({ error: "unexpected url " + url }, 500);
    }),
  );
  return captured;
}

/** A `next/headers` cookie store holding the given cookies. */
function cookieStore(cookies: { name: string; value: string }[]) {
  return {
    getAll: () => cookies,
    get: (name: string) => cookies.find((c) => c.name === name),
    has: (name: string) => cookies.some((c) => c.name === name),
    set: () => undefined,
    delete: () => undefined,
  };
}

function requestHeaderStore(init: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(init)) h.set(k, v);
  return h;
}

const PLAIN_SESSION_COOKIE = {
  name: "neon-auth.session_token",
  value: "plain-session-token",
};
const SECURE_SESSION_COOKIE = {
  name: "__Secure-neon-auth.session_token",
  value: "secure-session-token",
};

/** The dev server: loopback host, `x-forwarded-proto: http` (verified real). */
const DEV_LOOPBACK_HEADERS = {
  host: "localhost:3000",
  "x-forwarded-proto": "http",
  "x-forwarded-host": "localhost:3000",
  origin: "http://localhost:3000",
};

/** A LAN staging box: plain http on a non-loopback host. */
const LAN_HTTP_HEADERS = {
  host: "192.168.1.20:3111",
  "x-forwarded-proto": "http",
  origin: "http://192.168.1.20:3111",
};

/** Production: https. */
const HTTPS_HEADERS = {
  host: "adroit.io",
  "x-forwarded-proto": "https",
  origin: "https://adroit.io",
};

function getSessionCall(captured: Captured[]) {
  return captured.find((c) => c.url === `${AUTH_BASE}/get-session`);
}

beforeEach(() => {
  process.env.NEON_AUTH_BASE_URL = AUTH_BASE;
  cookiesMock.mockReset();
  headersMock.mockReset();
  resetAnonymousTokenCacheForTests();
  __resetMintCooldown();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEON_AUTH_BASE_URL;
});

describe("SSR session read on an insecure transport (t_c03fea8a)", () => {
  it("re-labels the plain http cookie for the upstream and resolves the identity", async () => {
    const captured = stubFetch();
    cookiesMock.mockResolvedValue(cookieStore([PLAIN_SESSION_COOKIE]));
    headersMock.mockResolvedValue(requestHeaderStore(LAN_HTTP_HEADERS));

    const user = await getNeonSessionUser();

    expect(user).toEqual({ id: USER.id, email: USER.email });
    // THE FIX: the auth service only knows the `__Secure-` wire name, so the
    // plain storage name is translated on the way upstream. Before the fix this
    // header carried `neon-auth.session_token=...`, the service answered "no
    // user", and every gated server component rendered as a guest.
    expect(getSessionCall(captured)?.headers.get("Cookie")).toBe(
      "__Secure-neon-auth.session_token=plain-session-token",
    );
  });

  it("resolves the identity for a dev server on loopback (host localhost + x-forwarded-proto http)", async () => {
    // `next dev` answers `x-forwarded-proto: http` for http://localhost:3000,
    // which IS a secure context — so `isSecureRequest()` consults the loopback
    // host first, the write path stores the SDK's prefixed name, and the raw
    // `__Secure-` cookie must reach the upstream untouched.
    const captured = stubFetch();
    cookiesMock.mockResolvedValue(cookieStore([SECURE_SESSION_COOKIE]));
    headersMock.mockResolvedValue(requestHeaderStore(DEV_LOOPBACK_HEADERS));

    const user = await getNeonSessionUser();

    expect(user).toEqual({ id: USER.id, email: USER.email });
    expect(getSessionCall(captured)?.headers.get("Cookie")).toBe(
      "__Secure-neon-auth.session_token=secure-session-token",
    );
  });
});

describe("SSR session read over https (production behaviour unchanged)", () => {
  it("forwards the cookie header byte-for-byte", async () => {
    const captured = stubFetch();
    cookiesMock.mockResolvedValue(
      cookieStore([
        { name: "adroit_cookie_consent", value: "granted" },
        SECURE_SESSION_COOKIE,
      ]),
    );
    headersMock.mockResolvedValue(requestHeaderStore(HTTPS_HEADERS));

    const user = await getNeonSessionUser();

    expect(user).toEqual({ id: USER.id, email: USER.email });
    expect(getSessionCall(captured)?.headers.get("Cookie")).toBe(
      "adroit_cookie_consent=granted; __Secure-neon-auth.session_token=secure-session-token",
    );
  });

  it("never up-converts a planted plain cookie into a session on https (M2, CWE-384)", async () => {
    const captured = stubFetch();
    cookiesMock.mockResolvedValue(cookieStore([PLAIN_SESSION_COOKIE]));
    headersMock.mockResolvedValue(requestHeaderStore(HTTPS_HEADERS));

    await getNeonSessionUser();

    // Unchanged: still a plain name the auth service does not read as a
    // session, so the session-fixation vector stays closed.
    expect(getSessionCall(captured)?.headers.get("Cookie")).toBe(
      "neon-auth.session_token=plain-session-token",
    );
  });
});

describe("SSR session read without a session cookie", () => {
  it("makes no upstream call when the request carries no cookies at all", async () => {
    const captured = stubFetch();
    cookiesMock.mockResolvedValue(cookieStore([]));
    headersMock.mockResolvedValue(requestHeaderStore(DEV_LOOPBACK_HEADERS));

    expect(await getNeonSessionUser()).toBeNull();
    expect(captured).toHaveLength(0);
  });

  it("resolves to null (never an identity) when only non-auth cookies are present", async () => {
    const captured = stubFetch();
    cookiesMock.mockResolvedValue(
      cookieStore([{ name: "adroit_cookie_consent", value: "granted" }]),
    );
    headersMock.mockResolvedValue(requestHeaderStore(DEV_LOOPBACK_HEADERS));

    expect(await getNeonSessionUser()).toBeNull();
    expect(getSessionCall(captured)?.headers.get("Cookie")).toBe(
      "adroit_cookie_consent=granted",
    );
  });
});
