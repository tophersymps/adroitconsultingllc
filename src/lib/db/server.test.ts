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

import {
  __resetMintCooldown,
  getSupabaseAnonymousClient,
  getSupabaseServerClient,
} from "./server";
import { resetAnonymousTokenCacheForTests, anonTokenStats } from "./anonymous-token";
import {
  DbTokenUnavailableError,
  isDbTokenUnavailable,
} from "./degraded-client";

const AUTH_BASE = "https://auth.test/neondb/auth";
const DATA_BASE = "https://data.test/neondb/rest/v1";
const SESSION_JWT = "session.jwt.token";
// A REAL JWT-shaped anonymous token: the anonymous path now PROVES the `role`
// claim (SEC-R2-5-M1), so the old non-JWT fixture ("anonymous.jwt.token")
// would legitimately degrade. `anonJwt`/`makeJwt` are hoisted declarations
// further down this file.
const ANON_JWT = anonJwt(1);

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
  // The anonymous-role token is cached across requests (R2-5), so each test
  // starts from an empty cache/suppression window.
  resetAnonymousTokenCacheForTests();
  // …and from an empty mint negative cache (t_81b09ba8): an 8 s cooldown that
  // survived between cases would make a "how many mints" assertion meaningless.
  __resetMintCooldown();
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

    // FAIL-CLOSED SEAM (contract §9): a cookieless request never touches
    // `/token` at all — the credential predicate answers from `next/headers`,
    // so guest traffic no longer spends the shared mint bucket.
    expect(captured.some((c) => c.url === `${AUTH_BASE}/token`)).toBe(false);
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

  it("degrades instead of reading as the anonymous role when the session mint refuses", async () => {
    // Expired / revoked session: Neon Auth answers 401. The read must NOT fall
    // through to the anonymous role — that is the wrong-role read this seam
    // used to serve (CWE-636/CWE-863). It degrades, classified, and issues no
    // Data API request at all.
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionToken: null, anonymousToken: ANON_JWT });

    const client = await getSupabaseServerClient();
    const { data, error } = (await client.from("user_roles").select("role")) as {
      data: unknown;
      error: unknown;
    };

    expect(data).toBeNull();
    expect(isDbTokenUnavailable(error)).toBe(true);
    expect(captured.filter((c) => c.url.startsWith(DATA_BASE))).toHaveLength(0);
    expect(
      captured.some((c) => c.url === `${AUTH_BASE}/token/anonymous`),
    ).toBe(false);
  });

  it("treats a malformed session token reply as a failed mint (never a bare request)", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      captured.push({ url, headers: requestHeaders(input, init) });
      if (url === `${AUTH_BASE}/token`) return jsonResponse({ token: "" });
      if (url === `${AUTH_BASE}/token/anonymous`) return jsonResponse({ token: ANON_JWT });
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = await getSupabaseServerClient();
    const { error } = (await client.from("user_roles").select("role")) as {
      error: unknown;
    };

    expect(isDbTokenUnavailable(error)).toBe(true);
    expect(captured.filter((c) => c.url.startsWith(DATA_BASE))).toHaveLength(0);
    // The anonymous role is not a fallback for a malformed session mint.
    expect(
      captured.some((c) => c.url === `${AUTH_BASE}/token/anonymous`),
    ).toBe(false);
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

/* -------------------------------------------------------------------------
 * R2-5 — /token/anonymous 429 must never 5xx a guest surface.
 *
 * Pinned regression (triage t_2fdc4d06): "token route returns 429 ⇒ guest data
 * page still responds 200 with the guest/empty payload".
 * ---------------------------------------------------------------------- */

/** A JWT-shaped token so the `exp` claim can drive the cache TTL. */
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64({ alg: "EdDSA" })}.${b64(payload)}.signature`;
}

/** `exp` = now + hours. */
function anonJwt(hours = 1, role = "anonymous"): string {
  const now = Math.floor(Date.now() / 1000);
  return makeJwt({ iat: now, exp: now + hours * 3600, role, has_sub: true });
}

/** fetch stub: /token always 401, /token/anonymous answers the given reply. */
function stubAnonFailure(
  reply: () => Response,
  options: { sessionToken?: string | null } = {},
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    captured.push({ url, headers: requestHeaders(input, init) });
    if (url === `${AUTH_BASE}/token`) {
      return options.sessionToken
        ? jsonResponse({ token: options.sessionToken })
        : jsonResponse({ error: "unauthenticated" }, 401);
    }
    if (url === `${AUTH_BASE}/token/anonymous`) return reply();
    if (url.startsWith(DATA_BASE)) return jsonResponse([{ role: "admin" }]);
    return jsonResponse({ error: "unexpected url " + url }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function throttled(retryAfter = 60): Response {
  return new Response(
    JSON.stringify({ message: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: { "content-type": "application/json", "x-retry-after": String(retryAfter) },
    },
  );
}

describe("R2-5: anonymous token unavailable ⇒ classified degrade, never a 500", () => {
  it("AC-1: 429 on /token/anonymous resolves the client and issues no bare Data API request", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubAnonFailure(() => throttled(60));

    // The pinned regression: this must RESOLVE, not reject.
    const client = await getSupabaseServerClient();
    const { data, error } = (await client
      .from("courses")
      .select("*")
      .eq("series_slug", "omni-studio-cert")) as {
      data: unknown;
      error: unknown;
    };

    expect(data).toBeNull();
    expect(isDbTokenUnavailable(error)).toBe(true);
    expect((error as DbTokenUnavailableError).code).toBe("TOKEN_UNAVAILABLE");

    // No Data API request at all — and certainly none without Authorization.
    const dataRequests = captured.filter((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequests).toHaveLength(0);
  });

  it("AC-2: 500, 503, empty token, non-JSON and a throwing fetch all resolve", async () => {
    const cases: Array<() => Response | Promise<Response>> = [
      () => jsonResponse({ error: "boom" }, 500),
      () => jsonResponse({ error: "unavailable" }, 503),
      () => jsonResponse({ token: "" }),
      () => new Response("not json", { status: 200 }),
      () => {
        throw new TypeError("fetch failed");
      },
    ];

    for (const reply of cases) {
      resetAnonymousTokenCacheForTests();
      captured = [];
      cookiesMock.mockResolvedValue(cookieStore([]));
      stubAnonFailure(() => {
        const r = reply();
        return r as Response;
      });

      const client = await getSupabaseServerClient();
      const { data, error } = (await client.from("courses").select("*")) as {
        data: unknown;
        error: unknown;
      };
      expect(data).toBeNull();
      expect(isDbTokenUnavailable(error)).toBe(true);
      expect(captured.filter((c) => c.url.startsWith(DATA_BASE))).toHaveLength(0);
    }
  });

  it("AC-3/AC-15: one classified warn per failed mint, with no token or cookie material", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Guest: only the anonymous mint runs (a credential-bearing request never
    // reaches /token/anonymous at all since the fail-closed seam change).
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubAnonFailure(() => throttled(60));

    await readRole("66666666-6666-6666-6666-666666666666");
    await readRole("66666666-6666-6666-6666-666666666666");

    const tokenWarns = warn.mock.calls.filter((c) => c[0] === "[db] token unavailable");
    expect(tokenWarns).toHaveLength(1);
    const payload = tokenWarns[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        "errorClass",
        "retryAfterSeconds",
        "status",
        "suppressedForMs",
        "timestamp",
        "tokenPath",
      ].sort(),
    );
    expect(payload.tokenPath).toBe("/token/anonymous");
    expect(payload.status).toBe(429);

    const serialised = JSON.stringify(warn.mock.calls);
    expect(serialised).not.toContain(SESSION_COOKIE.value);
    expect(serialised).not.toContain("Bearer");
    expect(serialised).not.toContain("Authorization");
    expect(serialised).not.toContain("Cookie");
    warn.mockRestore();
  });

  it("AC-13: five concurrent guest reads share one mint, and a later session request is not answered from it", async () => {
    const anon = anonJwt(1);
    cookiesMock.mockResolvedValue(cookieStore([]));
    const fetchMock = stubFetch({ sessionToken: null, anonymousToken: anon });

    await Promise.all([
      readRole("77777777-7777-7777-7777-777777777777"),
      readRole("77777777-7777-7777-7777-777777777777"),
      readRole("77777777-7777-7777-7777-777777777777"),
      readRole("77777777-7777-7777-7777-777777777777"),
      readRole("77777777-7777-7777-7777-777777777777"),
    ]);

    expect(
      captured.filter((c) => c.url === `${AUTH_BASE}/token/anonymous`),
    ).toHaveLength(1);

    // A signed-in request afterwards uses its own session JWT, never the cache.
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    captured = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      captured.push({ url, headers: requestHeaders(input, init) });
      if (url === `${AUTH_BASE}/token`) return jsonResponse({ token: SESSION_JWT });
      if (url.startsWith(DATA_BASE)) return jsonResponse([{ role: "admin" }]);
      return jsonResponse({ error: "unexpected" }, 500);
    });

    await readRole("88888888-8888-8888-8888-888888888888");

    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest?.headers.get("Authorization")).toBe(`Bearer ${SESSION_JWT}`);
    expect(
      captured.some((c) => c.url === `${AUTH_BASE}/token/anonymous`),
    ).toBe(false);
  });

  it("AC-12: two different session cookies produce two /token calls with their own Cookie header", async () => {
    const other = { name: "__Secure-neon-auth.session_token", value: "other-session-value" };
    // Two `cookies()` reads per request now: the credential predicate, then the
    // forwarded Cookie header. One entry per read keeps them per-request.
    cookiesMock
      .mockResolvedValueOnce(cookieStore([SESSION_COOKIE]))
      .mockResolvedValueOnce(cookieStore([SESSION_COOKIE]))
      .mockResolvedValueOnce(cookieStore([other]))
      .mockResolvedValueOnce(cookieStore([other]));
    let n = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      captured.push({ url, headers: requestHeaders(input, init) });
      if (url === `${AUTH_BASE}/token`) {
        n += 1;
        return jsonResponse({ token: `session-${n}.jwt.token` });
      }
      if (url.startsWith(DATA_BASE)) return jsonResponse([]);
      return jsonResponse({}, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await readRole("99999999-9999-9999-9999-999999999999");
    await readRole("99999999-9999-9999-9999-999999999999");

    const tokenCalls = captured.filter((c) => c.url === `${AUTH_BASE}/token`);
    expect(tokenCalls).toHaveLength(2);
    expect(tokenCalls[0]?.headers.get("Cookie")).toContain(SESSION_COOKIE.value);
    expect(tokenCalls[1]?.headers.get("Cookie")).toContain(other.value);
    expect(tokenCalls[1]?.headers.get("Cookie")).not.toContain(
      SESSION_COOKIE.value,
    );

    const auths = captured
      .filter((c) => c.url.startsWith(DATA_BASE))
      .map((c) => c.headers.get("Authorization"));
    expect(auths).toEqual(["Bearer session-1.jwt.token", "Bearer session-2.jwt.token"]);
  });

  it("AC-14: no Data API request without an Authorization header, in any failure state", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubAnonFailure(() => throttled(60));

    const client = await getSupabaseServerClient();
    await client.from("courses").select("*");
    await client.from("catalog_sections").select("*").order("sort_order");

    expect(
      captured.filter(
        (c) => c.url.startsWith(DATA_BASE) && !c.headers.get("Authorization"),
      ),
    ).toHaveLength(0);
  });

  it("getSupabaseAnonymousClient resolves (does not throw) when there is no anonymous token", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubAnonFailure(() => throttled(60));

    const client = await getSupabaseAnonymousClient();
    const { data, error } = (await client.from("courses").select("*")) as {
      data: unknown;
      error: unknown;
    };
    expect(data).toBeNull();
    expect(isDbTokenUnavailable(error)).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * SEC-R2-5-M1 / SEC-R2-5-L1 — the process-wide anonymous token must have a
 * PROVEN scope, and must be minted without any caller identity attached.
 *
 * The old assertion only ran when the payload decoded AND carried a string
 * `role`, so a role-less JWT (e.g. a user token with a `sub`) or any opaque
 * string was accepted and then cached for the whole instance. Both are now
 * `malformed` ⇒ degraded client, no Data API request, nothing cached.
 * ---------------------------------------------------------------------- */

describe("SEC-R2-5-M1: the anonymous token's scope is proven, not assumed", () => {
  /** A JWT-shaped payload with a user `sub` and NO `role` claim. */
  function rolelessJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    return makeJwt({
      sub: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      iat: now,
      exp: now + 3600,
    });
  }

  it("rejects a role-less JWT: degraded client, no Data API request, nothing cached", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubAnonFailure(() => jsonResponse({ token: rolelessJwt() }));

    const client = await getSupabaseServerClient();
    const { data, error } = (await client.from("courses").select("*")) as {
      data: unknown;
      error: unknown;
    };

    expect(data).toBeNull();
    expect(isDbTokenUnavailable(error)).toBe(true);
    expect(captured.filter((c) => c.url.startsWith(DATA_BASE))).toHaveLength(0);
    // Never entered the process-wide cache.
    expect(anonTokenStats.mints).toBe(0);
  });

  it("rejects an opaque non-JWT token the same way", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubAnonFailure(() => jsonResponse({ token: "opaque-token-not-a-jwt" }));

    const client = await getSupabaseServerClient();
    const { data, error } = (await client.from("courses").select("*")) as {
      data: unknown;
      error: unknown;
    };

    expect(data).toBeNull();
    expect(isDbTokenUnavailable(error)).toBe(true);
    expect(captured.filter((c) => c.url.startsWith(DATA_BASE))).toHaveLength(0);
    expect(anonTokenStats.mints).toBe(0);
  });

  it("never forwards a session cookie to /token/anonymous", async () => {
    const shared = anonJwt(1);
    // Guest request: the shared, identity-free mint is the only one that runs.
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubAnonFailure(() => jsonResponse({ token: shared }));

    await readRole("cccccccc-cccc-cccc-cccc-cccccccccccc");

    // The shared, identity-free mint must carry no identity at all.
    const anonCall = captured.find(
      (c) => c.url === `${AUTH_BASE}/token/anonymous`,
    );
    expect(anonCall).toBeDefined();
    expect(anonCall?.headers.get("Cookie")).toBeNull();

    // ...and the valid anonymous token is still accepted and used.
    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest?.headers.get("Authorization")).toBe(`Bearer ${shared}`);
    expect(anonTokenStats.mints).toBe(1);
  });

  it("a credential-bearing request never reaches /token/anonymous (fail-closed seam)", async () => {
    // S1 of the fail-closed contract: the anonymous mint is not a fallback for
    // a failed session mint, so it is never even attempted.
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubAnonFailure(() => throttled(60));

    const client = await getSupabaseServerClient();
    const { error } = (await client.from("user_roles").select("role")) as {
      error: unknown;
    };

    expect(isDbTokenUnavailable(error)).toBe(true);
    expect(
      captured.some((c) => c.url === `${AUTH_BASE}/token/anonymous`),
    ).toBe(false);
    expect(anonTokenStats.mints).toBe(0);
  });
});
