/**
 * src/lib/db/server.test.ts — the session-JWT bridge (t_f34aebeb, HIGH).
 *
 * Regression guard for the defect filed by val-el on t_cd36c47c: after the
 * auth swap the data client was built from an anon key and *nothing* ever
 * presented the caller's Neon Auth session, so every RLS-scoped read ran as
 * Postgres role `anonymous`, returned 0 rows, `loadRole()` came back null and
 * every `/api/admin/*` route answered 403 to a real imported admin.
 *
 * The contract these tests pin down:
 *
 *   no session cookie   -> Authorization: Bearer <anonymous JWT>
 *   session cookie      -> Authorization: Bearer <session JWT>   (RLS as the user)
 *   /token refuses      -> falls back to the anonymous role, never to "no header"
 *   missing endpoint env-> throws (fail closed, never a silent empty read)
 *
 * Serialization only: these tests run with no credentials and assert on the
 * outgoing wire request. The live half of the same claim — anonymous sees 0
 * rows from user_roles while the session JWT sees the caller's role row — is
 * `scripts/verify-data-api-session-bridge.py` (needs NEON_* + DATABASE_URL).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { getSupabaseServerClient } from "./server";

const AUTH_BASE = "https://auth.test/neondb/auth";
const DATA_BASE = "https://data.test/neondb/rest/v1";
const SESSION_JWT = "session.jwt.token";
const ANON_JWT = "anonymous.jwt.token";

type Captured = { url: string; headers: Headers };

let captured: Captured[];

/** A Response-shaped reply good enough for postgrest-js to parse. */
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

/**
 * Wires the two token endpoints the way Neon Auth answers them and records the
 * Data API request so the test can assert on the Authorization header.
 */
function stubFetch(options: {
  sessionToken?: string | null;
  anonymousToken?: string | null;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const headers = requestHeaders(input, init);
    captured.push({ url, headers });

    if (url === `${AUTH_BASE}/token`) {
      return options.sessionToken
        ? jsonResponse({ token: options.sessionToken })
        : jsonResponse({ error: "unauthenticated" }, 401);
    }
    if (url === `${AUTH_BASE}/token/anonymous`) {
      return options.anonymousToken
        ? jsonResponse({ token: options.anonymousToken })
        : jsonResponse({ error: "no anonymous role" }, 401);
    }
    if (url.startsWith(DATA_BASE)) {
      return jsonResponse([{ role: "admin" }]);
    }
    return jsonResponse({ error: "unexpected url " + url }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

const SESSION_COOKIE = {
  name: "__Secure-neon-auth.session_token",
  value: "signed-session-cookie-value",
};

/** Issue one real query through the client so a request actually goes out. */
async function readRole(userId: string) {
  const client = await getSupabaseServerClient();
  return client.from("user_roles").select("role").eq("user_id", userId);
}

beforeEach(() => {
  process.env.NEON_AUTH_BASE_URL = AUTH_BASE;
  process.env.NEON_DATA_API_URL = DATA_BASE;
  captured = [];
  cookiesMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.NEON_DATA_API_URL;
});

describe("Neon session JWT bridge to the Data API client", () => {
  it("sends the anonymous role JWT when the request has no session", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubFetch({ sessionToken: null, anonymousToken: ANON_JWT });

    await readRole("11111111-1111-1111-1111-111111111111");

    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest).toBeDefined();
    // The bug this guards: an unauthenticated data request, i.e. no
    // Authorization at all, which PostgREST answers as role `anonymous` too —
    // but with no JWT the gateway is an implicit, unpinnable role. We pin it.
    expect(dataRequest?.headers.get("Authorization")).toBe(`Bearer ${ANON_JWT}`);

    // The session endpoint is tried first and carries no cookie.
    const sessionCall = captured.find((c) => c.url === `${AUTH_BASE}/token`);
    expect(sessionCall).toBeDefined();
    expect(sessionCall?.headers.get("Cookie")).toBeNull();
  });

  it("sends the caller's session JWT, and forwards the httpOnly cookie, when signed in", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionToken: SESSION_JWT, anonymousToken: ANON_JWT });

    await readRole("22222222-2222-2222-2222-222222222222");

    // 1. The token is resolved server-side from the cookie-only endpoint; the
    //    browser never sees or supplies a JWT (the cookie is httpOnly).
    const sessionCall = captured.find((c) => c.url === `${AUTH_BASE}/token`);
    expect(sessionCall).toBeDefined();
    expect(sessionCall?.headers.get("Cookie")).toContain(
      `${SESSION_COOKIE.name}=${SESSION_COOKIE.value}`,
    );

    // 2. That JWT — not the anonymous one — is what the Data API sees, so RLS
    //    runs as the signed-in user (loadRole can return 'admin').
    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest?.headers.get("Authorization")).toBe(
      `Bearer ${SESSION_JWT}`,
    );

    // 3. The guest fallback is not consulted at all when a session exists.
    expect(
      captured.some((c) => c.url === `${AUTH_BASE}/token/anonymous`),
    ).toBe(false);
  });

  it("keeps the query shape intact while carrying the token", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionToken: SESSION_JWT, anonymousToken: ANON_JWT });

    await readRole("33333333-3333-3333-3333-333333333333");

    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest?.url).toBe(
      `${DATA_BASE}/user_roles?select=role&user_id=eq.33333333-3333-3333-3333-333333333333`,
    );
  });

  it("falls back to the anonymous role when the session token endpoint refuses", async () => {
    // Expired / revoked session: Neon Auth answers 401. The read must still be
    // pinned to a role (guest surfaces keep working) instead of going out bare.
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionToken: null, anonymousToken: ANON_JWT });

    await readRole("44444444-4444-4444-4444-444444444444");

    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest?.headers.get("Authorization")).toBe(`Bearer ${ANON_JWT}`);
  });

  it("treats a malformed token reply as no token (never a bare request)", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      captured.push({ url, headers: requestHeaders(input, init) });
      if (url === `${AUTH_BASE}/token`) return jsonResponse({ token: "" });
      if (url === `${AUTH_BASE}/token/anonymous`) return jsonResponse({ token: ANON_JWT });
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await readRole("55555555-5555-5555-5555-555555555555");

    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest?.headers.get("Authorization")).toBe(`Bearer ${ANON_JWT}`);
  });

  it("fails closed when the Data API env is missing", async () => {
    delete process.env.NEON_DATA_API_URL;
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubFetch({ sessionToken: null, anonymousToken: ANON_JWT });

    await expect(getSupabaseServerClient()).rejects.toThrow(
      "NEON_DATA_API_URL is required",
    );
  });

  it("fails closed when the auth env is missing", async () => {
    delete process.env.NEON_AUTH_BASE_URL;
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionToken: SESSION_JWT, anonymousToken: ANON_JWT });

    await expect(getSupabaseServerClient()).rejects.toThrow(
      "NEON_AUTH_BASE_URL is required",
    );
  });
});
