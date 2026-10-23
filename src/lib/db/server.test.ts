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
  getSupabaseServerClient,
  DbAuthUnavailableError,
  __resetMintCooldown,
} from "./server";

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
  /** Force an HTTP status instead of the token/no-token answer (429, 500…). */
  sessionStatus?: number;
  anonymousStatus?: number;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const headers = requestHeaders(input, init);
    captured.push({ url, headers });

    if (url === `${AUTH_BASE}/token`) {
      if (options.sessionStatus) {
        return jsonResponse({ message: "forced" }, options.sessionStatus);
      }
      return options.sessionToken
        ? jsonResponse({ token: options.sessionToken })
        : jsonResponse({ error: "unauthenticated" }, 401);
    }
    if (url === `${AUTH_BASE}/token/anonymous`) {
      if (options.anonymousStatus) {
        return jsonResponse({ message: "forced" }, options.anonymousStatus);
      }
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

    // A guest request never mints a session token: `/token` can only 401
    // without a cookie, and every such call burns the same per-IP bucket that
    // a signed-in render needs (t_223f8b3d).
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

  it("falls back to the anonymous role when the session token endpoint refuses", async () => {
    // Expired / revoked session: Neon Auth answers 401. The read must still be
    // pinned to a role (guest surfaces keep working) instead of going out bare.
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionToken: null, anonymousToken: ANON_JWT });

    await readRole("44444444-4444-4444-4444-444444444444");

    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest?.headers.get("Authorization")).toBe(`Bearer ${ANON_JWT}`);

    // t_52f55ea7 guard: the fallback mint is issued with NO Cookie header, so
    // one identity's session credential is never presented for another
    // identity's token request.
    const anonCall = captured.find(
      (c) => c.url === `${AUTH_BASE}/token/anonymous`,
    );
    expect(anonCall).toBeDefined();
    expect(anonCall?.headers.get("Cookie")).toBeNull();
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

/* ------------------------------------------------------------------ */
/*  t_223f8b3d — no JWT at all must be a TYPED degrade, not a bare     */
/*  client whose 400 escapes the RSC render as digest 307487673.       */
/* ------------------------------------------------------------------ */

describe("credential-bridge unavailability (t_223f8b3d)", () => {
  it("rejects with DbAuthUnavailableError and issues NO bearer-less Data API call (401 + 429)", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionStatus: 401, anonymousStatus: 429 });

    await expect(readRole("66666666-6666-6666-6666-666666666666")).rejects.toBeInstanceOf(
      DbAuthUnavailableError,
    );

    // Both mints were attempted...
    expect(captured.some((c) => c.url === `${AUTH_BASE}/token`)).toBe(true);
    expect(
      captured.some((c) => c.url === `${AUTH_BASE}/token/anonymous`),
    ).toBe(true);
    // ...and nothing reached the Data API without a bearer.
    expect(captured.some((c) => c.url.startsWith(DATA_BASE))).toBe(false);
  });

  it("degrades identically when both endpoints answer 500", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionStatus: 500, anonymousStatus: 500 });

    await expect(getSupabaseServerClient()).rejects.toBeInstanceOf(
      DbAuthUnavailableError,
    );
    expect(captured.some((c) => c.url.startsWith(DATA_BASE))).toBe(false);
  });

  it("degrades for a GUEST too (the outage is not identity-dependent)", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubFetch({ anonymousStatus: 429 });

    await expect(getSupabaseServerClient()).rejects.toBeInstanceOf(
      DbAuthUnavailableError,
    );
    expect(captured.some((c) => c.url.startsWith(DATA_BASE))).toBe(false);
  });

  it("the typed error carries a stable code for callers to switch on", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubFetch({ anonymousStatus: 503 });

    await expect(getSupabaseServerClient()).rejects.toMatchObject({
      name: "DbAuthUnavailableError",
      code: "DB_AUTH_UNAVAILABLE",
    });
  });

  it("never logs a token value or the session cookie", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
      // Session mint refused, fallback succeeds → a token IS obtained; no log
      // line may contain it, nor the caller's cookie value.
      stubFetch({ sessionStatus: 429, anonymousToken: ANON_JWT });
      await readRole("77777777-7777-7777-7777-777777777777");

      const logged = [...warn.mock.calls, ...error.mock.calls]
        .map((args) => JSON.stringify(args))
        .join("\n");
      expect(logged).not.toContain(ANON_JWT);
      expect(logged).not.toContain(SESSION_JWT);
      expect(logged).not.toContain(SESSION_COOKIE.value);
      // What it MAY log: the endpoint path and the status.
      expect(logged).toContain("/token");
      expect(logged).toContain("429");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  t_81b09ba8 — a HUNG (not failing) auth backend must cost the       */
/*  render ONE bounded budget, not one per mint endpoint, and must    */
/*  not be re-paid by every concurrent render during the outage.      */
/* ------------------------------------------------------------------ */

/** Mint paths hit since the last reset, in order (e.g. ["/token"]). */
function mintCalls(): string[] {
  return captured
    .filter((c) => c.url.startsWith(`${AUTH_BASE}/token`))
    .map((c) => c.url.slice(AUTH_BASE.length));
}

/**
 * An auth backend that HANGS: every mint request stays unanswered until the
 * client's abort signal fires (the outage shape that produced 2.5 s / 5.0 s
 * TTFB — a fast 429 was already cheap at 6-25 ms).
 */
function stubHangingFetch() {
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const url = requestUrl(input);
        captured.push({ url, headers: requestHeaders(input, init) });
        const signal = init?.signal;
        if (!signal) return; // never settles — the test timeout must catch it
        const abort = () => reject(new Error("aborted"));
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("bounded total mint budget on the degraded path (t_81b09ba8)", () => {
  /** The shared budget is 800 ms; allow scheduling slack below and above. */
  const BUDGET_FLOOR_MS = 500;
  const BUDGET_CEILING_MS = 1700;

  it("a guest render spends ONE budget and issues ONE mint when auth hangs", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubHangingFetch();

    const started = Date.now();
    await expect(getSupabaseServerClient()).rejects.toBeInstanceOf(
      DbAuthUnavailableError,
    );
    const elapsed = Date.now() - started;

    // One mint for a guest (the session mint is skipped with no cookie)…
    expect(mintCalls()).toEqual(["/token/anonymous"]);
    // …bounded by the shared budget, not by a per-call 2.5 s timeout.
    expect(elapsed).toBeGreaterThanOrEqual(BUDGET_FLOOR_MS);
    expect(elapsed).toBeLessThan(BUDGET_CEILING_MS);
    // Still no bearer-less request to the Data API.
    expect(captured.some((c) => c.url.startsWith(DATA_BASE))).toBe(false);
  });

  it("a session-cookie render spends ONE budget total and does NOT retry the anonymous mint after a timeout", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubHangingFetch();

    const started = Date.now();
    await expect(getSupabaseServerClient()).rejects.toBeInstanceOf(
      DbAuthUnavailableError,
    );
    const elapsed = Date.now() - started;

    // The regression: `/token` then `/token/anonymous`, 2 x 2.5 s = 5.0 s.
    // A timed-out session mint must NOT be re-attempted on the sibling
    // endpoint — the backend that just hung is not going to answer that one.
    expect(mintCalls()).toEqual(["/token"]);
    expect(elapsed).toBeLessThan(BUDGET_CEILING_MS);
    expect(elapsed).toBeGreaterThanOrEqual(BUDGET_FLOOR_MS);
  });

  it("does not fall through to the anonymous mint when the session endpoint is already on cooldown", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubHangingFetch();

    // First render: `/token` hangs, is reported unavailable, cooldown recorded.
    await expect(getSupabaseServerClient()).rejects.toBeInstanceOf(
      DbAuthUnavailableError,
    );
    expect(mintCalls()).toEqual(["/token"]);

    // Second render inside the window: NOT `/token` again and NOT the sibling
    // `/token/anonymous` either — that second mint is what made the measured
    // session-cookie render cost 2 x 2.5 s.
    captured = [];
    const started = Date.now();
    await expect(getSupabaseServerClient()).rejects.toBeInstanceOf(
      DbAuthUnavailableError,
    );
    expect(mintCalls()).toEqual([]);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it("caches an unhealthy mint for a short window so the next renders pay nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));
      cookiesMock.mockResolvedValue(cookieStore([]));
      stubFetch({ anonymousStatus: 429 });

      await expect(getSupabaseServerClient()).rejects.toBeInstanceOf(
        DbAuthUnavailableError,
      );
      expect(mintCalls()).toEqual(["/token/anonymous"]);

      // Second render inside the cooldown window: no mint request at all, and
      // it fails over instantly instead of re-paying the budget.
      captured = [];
      const started = Date.now();
      await expect(getSupabaseServerClient()).rejects.toBeInstanceOf(
        DbAuthUnavailableError,
      );
      expect(mintCalls()).toEqual([]);
      expect(Date.now() - started).toBeLessThan(100);

      // …but the window is a cooldown, not a permanent verdict: once it
      // expires the very next render mints again and succeeds.
      captured = [];
      vi.setSystemTime(new Date("2026-10-23T12:00:09.000Z"));
      stubFetch({ anonymousToken: ANON_JWT });
      await readRole("88888888-8888-8888-8888-888888888888");

      expect(mintCalls()).toEqual(["/token/anonymous"]);
      const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
      expect(dataRequest?.headers.get("Authorization")).toBe(`Bearer ${ANON_JWT}`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keys the negative cache by endpoint: an outage on the anonymous mint does not suppress a healthy session mint", async () => {
    cookiesMock.mockResolvedValue(cookieStore([]));
    stubFetch({ anonymousStatus: 500 });
    await expect(getSupabaseServerClient()).rejects.toBeInstanceOf(
      DbAuthUnavailableError,
    );

    // A signed-in reader arrives during that cooldown window with a working
    // session mint: it must still be attempted and used (RLS as the user),
    // never downgraded to another identity's/anonymous state.
    captured = [];
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionToken: SESSION_JWT, anonymousToken: ANON_JWT });

    await readRole("99999999-9999-9999-9999-999999999999");

    expect(mintCalls()).toEqual(["/token"]);
    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest?.headers.get("Authorization")).toBe(`Bearer ${SESSION_JWT}`);
  });

  it("never puts a SUCCESSFUL mint on the negative cache (healthy path unchanged)", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionToken: SESSION_JWT, anonymousToken: ANON_JWT });

    await readRole("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const firstMints = mintCalls();
    captured = [];
    await readRole("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    const secondMints = mintCalls();

    // Both renders went to the network and both carried the session JWT.
    expect(firstMints).toEqual(["/token"]);
    expect(secondMints).toEqual(["/token"]);
    const dataRequest = captured.find((c) => c.url.startsWith(DATA_BASE));
    expect(dataRequest?.headers.get("Authorization")).toBe(`Bearer ${SESSION_JWT}`);
  });

  it("a 401 refusal is NOT a cooldown: the expired-session fallback still runs on every render", async () => {
    cookiesMock.mockResolvedValue(cookieStore([SESSION_COOKIE]));
    stubFetch({ sessionToken: null, anonymousToken: ANON_JWT });

    await readRole("cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(mintCalls()).toEqual(["/token", "/token/anonymous"]);

    captured = [];
    await readRole("dddddddd-dddd-dddd-dddd-dddddddddddd");
    // Per-identity answers are cheap; suppressing them would only starve the
    // next signed-in reader of a session mint that would have succeeded.
    expect(mintCalls()).toEqual(["/token", "/token/anonymous"]);
  });
});
