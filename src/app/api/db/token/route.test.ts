/**
 * route.test.ts — GET /api/db/token fail-closed contract (t_142d2334).
 *
 * Contract: docs/decisions/2026-10-26-db-token-fail-closed-contract.md
 *
 * The defect these tests close: a signed-in caller whose `/token` mint failed
 * was answered `200 { token: null }` — byte-identical to a guest — because the
 * route's bare `catch` (and, before it, `mintSessionJwt`) collapsed every
 * failure into "nobody is signed in". The browser then rendered guest state for
 * a signed-in user.
 *
 * Only `fetch` is stubbed; the real route, the real `db/server.ts` and the real
 * session predicate run. Fixtures come from `@/lib/db/test-support/throttled-auth`
 * (the shared R2-5 fixture) so the two suites cannot drift.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { GET } from "./route";
import { __resetMintCooldown } from "@/lib/db/server";
import {
  AUTH_BASE,
  applyThrottledAuthEnv,
  clearThrottledAuthEnv,
  guestCookieStore,
  sessionCookieStore,
  type CapturedRequest,
} from "@/lib/db/test-support/throttled-auth";

const SESSION_VALUE = "signed-session-cookie-value";
const SESSION_JWT = "session.jwt.token";
/** Distinct from SESSION_JWT so a guest-role token can never pass as a session one. */
const ANON_JWT = "anonymous.role.jwt.token";
const TOKEN_CACHE_CONTROL = "private, no-store, no-cache, must-revalidate";

let captured: CapturedRequest[] = [];
let consoleError: ReturnType<typeof vi.spyOn>;

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * Install a `fetch` stub whose `/token` behaviour is `reply`, and record every
 * upstream request. The Data API must never be reached from this route.
 */
function stubMint(
  reply: (url: string) => Response | Promise<Response>,
): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      requests.push({
        url,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers as HeadersInit),
      });
      if (url === `${AUTH_BASE}/token`) return reply(url);
      if (url === `${AUTH_BASE}/token/anonymous`) {
        // Deliberately HEALTHY. `/token` and `/token/anonymous` share a bucket
        // but not a fate: in production the guest mint can be answering fine
        // while the session mint is throttled. If this stub failed, a
        // regression that fell back to the guest role would still be answered
        // 503 by accident and the suite would go green over the exact defect
        // it exists to catch. It succeeds, and the tests assert it is never
        // asked for and never returned.
        return jsonResponse({ token: ANON_JWT });
      }
      if (url === `${AUTH_BASE}/get-session`) {
        return jsonResponse({ user: { id: "user-1", email: "learner@test.dev" } });
      }
      return jsonResponse({ error: `unexpected url ${url}` }, 500);
    }),
  );
  return requests;
}

function mintRequests(requests: CapturedRequest[], path = "/token") {
  return requests.filter((r) => r.url === `${AUTH_BASE}${path}`);
}

/**
 * Guest-role mints. A credential-bearing request must never produce one: the
 * guest role is a LOWER privilege than the caller's own session, so serving it
 * to a signed-in user is the same class of bug as answering `{token:null}`.
 */
function anonymousMints(requests: CapturedRequest[]) {
  return mintRequests(requests, "/token/anonymous");
}

/** Assertions every branch must satisfy (§6). */
function expectTokenHeaders(res: Response) {
  expect(res.headers.get("cache-control")).toBe(TOKEN_CACHE_CONTROL);
  expect(res.headers.get("vary")).toContain("Cookie");
}

beforeEach(() => {
  applyThrottledAuthEnv();
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(sessionCookieStore(SESSION_VALUE));
  __resetMintCooldown();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("GET /api/db/token — guests (R2)", () => {
  it("G1: a cookieless request gets 200 {token:null}, no upstream call, no log", async () => {
    cookiesMock.mockResolvedValue(guestCookieStore());
    captured = stubMint(() => jsonResponse({ token: SESSION_JWT }));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: null });
    expectTokenHeaders(res);
    // Decided from `next/headers` alone: guest traffic no longer spends the
    // shared /token rate-limit bucket.
    expect(captured).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("G12: a guest issues neither /token nor /get-session", async () => {
    cookiesMock.mockResolvedValue(guestCookieStore());
    captured = stubMint(() => jsonResponse({ token: SESSION_JWT }));

    await GET();

    expect(mintRequests(captured)).toHaveLength(0);
    expect(captured.some((r) => r.url === `${AUTH_BASE}/get-session`)).toBe(false);
  });
});

describe("GET /api/db/token — signed in", () => {
  it("G2: mint ok returns 200 {token:<jwt>} with §6 headers and no log", async () => {
    captured = stubMint(() => jsonResponse({ token: SESSION_JWT }));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: SESSION_JWT });
    expectTokenHeaders(res);
    expect(consoleError).not.toHaveBeenCalled();
    // The caller's cookie is what the mint is made from.
    expect(mintRequests(captured)[0]?.headers.get("cookie")).toContain(
      `__Secure-neon-auth.session_token=${SESSION_VALUE}`,
    );
  });

  it("G3: upstream 401 returns 401 SESSION_INVALID, leaks nothing, logs once", async () => {
    captured = stubMint(() =>
      jsonResponse({ message: "invalid session for user learner@test.dev" }, 401),
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({
      error: "Your session has expired. Please sign in again.",
      code: "SESSION_INVALID",
    });
    expectTokenHeaders(res);
    expect(res.headers.get("www-authenticate")).toBeNull();

    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("learner@test.dev");
    expect(serialised).not.toContain(AUTH_BASE);
    expect(serialised).not.toContain("401");

    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("G4: upstream 403 is normalised to 401 (never a 403)", async () => {
    captured = stubMint(() => jsonResponse({ message: "forbidden" }, 403));

    const res = await GET();

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("SESSION_INVALID");
  });

  it("G5: upstream 429 + x-retry-after advertises Retry-After and a mirror in the body", async () => {
    captured = stubMint(() =>
      jsonResponse({ message: "Too many requests." }, 429, { "x-retry-after": "30" }),
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe("AUTH_MINT_UNAVAILABLE");
    expect(body.retryAfterSeconds).toBe(30);
    expect(res.headers.get("retry-after")).toBe("30");
    expectTokenHeaders(res);
    // Opaque: no upstream rate-limit copy, no status, no endpoint.
    expect(JSON.stringify(body)).not.toContain("Too many requests");
    expect(JSON.stringify(body)).not.toContain("429");
    expect(JSON.stringify(body)).not.toContain("neonauth");
  });

  it("G6: a 5xx / network failure answers 503 without a Retry-After it cannot justify", async () => {
    captured = stubMint(() => jsonResponse({ message: "upstream down" }, 500));
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("AUTH_MINT_UNAVAILABLE");
    expect(res.headers.get("retry-after")).toBeNull();
    expectTokenHeaders(res);

    __resetMintCooldown();
    captured = stubMint(() => {
      throw new TypeError("fetch failed: https://auth.test/neondb/auth/token");
    });
    const offline = await GET();
    expect(offline.status).toBe(503);
    expect((await offline.json()).code).toBe("AUTH_MINT_UNAVAILABLE");
  });

  it("G7: a malformed 200 is a failed mint, never a guest answer", async () => {
    for (const body of [{}, { token: "" }, { token: 42 }]) {
      __resetMintCooldown();
      captured = stubMint(() => jsonResponse(body));

      const res = await GET();
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json.code).toBe("AUTH_MINT_UNAVAILABLE");
      expect(json.token).toBeUndefined();
      expectTokenHeaders(res);
    }
  });

  it("G8: a missing NEON_AUTH_BASE_URL is an opaque 503 and a config log line", async () => {
    delete process.env.NEON_AUTH_BASE_URL;
    captured = stubMint(() => jsonResponse({ token: SESSION_JWT }));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.code).toBe("AUTH_MINT_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("NEON_AUTH_BASE_URL");
    expect(JSON.stringify(body)).not.toContain("neonauth");

    const payload = consoleError.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      event: "auth_mint_failed",
      tokenPath: "/token",
      errorClass: "config",
    });
  });

  it("G9: a cooldown short-circuits to 503 with Retry-After and no second upstream attempt", async () => {
    captured = stubMint(() =>
      jsonResponse({ message: "Too many requests." }, 429, { "x-retry-after": "60" }),
    );

    const first = await GET();
    expect(first.status).toBe(503);

    const second = await GET();
    const body = await second.json();

    expect(second.status).toBe(503);
    expect(body.code).toBe("AUTH_MINT_UNAVAILABLE");
    const retryAfter = Number(second.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(120);
    // The point of the cooldown: it is not re-asked, and it is not answered as
    // a guest either.
    expect(mintRequests(captured)).toHaveLength(1);
    expect(body.token).toBeUndefined();
  });

  it("G10: invariant sweep — a cookie-bearing request never gets 200 {token:null}", async () => {
    const replies: Array<() => Response | Promise<Response>> = [
      () => jsonResponse({ token: SESSION_JWT }),
      () => jsonResponse({ message: "unauthorized" }, 401),
      () => jsonResponse({ message: "forbidden" }, 403),
      () => jsonResponse({ message: "slow down" }, 429, { "x-retry-after": "5" }),
      () => jsonResponse({ message: "boom" }, 503),
      () => jsonResponse({}, 200),
      () => jsonResponse({ token: "" }, 200),
      () => jsonResponse({ token: "not-a-jwt" }, 200),
      () => {
        throw new TypeError("network down");
      },
    ];

    for (const reply of replies) {
      __resetMintCooldown();
      cookiesMock.mockResolvedValue(sessionCookieStore(SESSION_VALUE));
      captured = stubMint(reply);

      const res = await GET();
      const body = await res.json();

      const gotGuestAnswer = res.status === 200 && body?.token === null;
      expect(gotGuestAnswer).toBe(false);
      if (res.status === 200) {
        expect(typeof body.token).toBe("string");
        expect(body.token.length).toBeGreaterThan(0);
      } else {
        expect([401, 503]).toContain(res.status);
      }
      expectTokenHeaders(res);
    }
  });

  it("G11: log hygiene — one secret-free line per failure", async () => {
    captured = stubMint(() =>
      jsonResponse({ message: "too many requests for learner@test.dev" }, 429, {
        "x-retry-after": "12",
      }),
    );

    const res = await GET();
    expect(res.status).toBe(503);

    expect(consoleError).toHaveBeenCalledTimes(1);
    const serialised = JSON.stringify(consoleError.mock.calls);

    expect(serialised).not.toContain(SESSION_VALUE);
    expect(serialised).not.toContain(SESSION_JWT);
    expect(serialised).not.toContain("learner@test.dev");
    expect(serialised).not.toContain("https://");
    expect(serialised).not.toContain("cookie=");
    expect(serialised).not.toContain("Bearer");

    const payload = consoleError.mock.calls[0]?.[1] as Record<string, unknown>;
    // Enumerated, flat fields only — nothing that could carry a secret.
    expect(Object.keys(payload).sort()).toEqual(
      ["errorClass", "event", "retryAfterSeconds", "status", "tokenPath"].sort(),
    );
    expect(payload).toMatchObject({
      event: "auth_mint_failed",
      tokenPath: "/token",
      errorClass: "http",
      status: 429,
      retryAfterSeconds: 12,
    });
  });

  it("R1: a failed mint neither mints nor returns the guest role (no guest degradation)", async () => {
    // Every failure mode, one assertion set: a signed-in caller whose own mint
    // failed must not be served the LOWER-privilege guest role either. This is
    // the `mintSessionJwt() ?? getAnonymousJwt()` shape the change removed —
    // and the stub's /token/anonymous ANSWERS 200 here, so a regression that
    // reintroduces the fallback would be observed, not masked.
    const replies: Array<() => Response | Promise<Response>> = [
      () => jsonResponse({ message: "unauthorized" }, 401),
      () => jsonResponse({ message: "forbidden" }, 403),
      () => jsonResponse({ message: "slow down" }, 429, { "x-retry-after": "5" }),
      () => jsonResponse({ message: "boom" }, 500),
      () => jsonResponse({ message: "boom" }, 503),
      () => jsonResponse({}, 200),
      () => jsonResponse({ token: "" }, 200),
      () => {
        throw new TypeError("network down");
      },
    ];

    for (const reply of replies) {
      __resetMintCooldown();
      captured = stubMint(reply);

      const res = await GET();
      const body = await res.json();

      expect(anonymousMints(captured)).toHaveLength(0);
      expect(JSON.stringify(body)).not.toContain(ANON_JWT);
      expect(body.token).toBeUndefined();
      expect([401, 503]).toContain(res.status);
    }
  });

  it("R2: a signed-in mint failure is distinguishable from the guest answer", async () => {
    // The defect, stated as a test: the old route answered a signed-in caller
    // whose mint failed with the byte-identical body a guest gets. Compare the
    // two branches directly so a future collapse to "guest" cannot pass.
    cookiesMock.mockResolvedValue(guestCookieStore());
    captured = stubMint(() => jsonResponse({ message: "boom" }, 500));
    const guest = await GET();
    const guestBody = await guest.json();

    __resetMintCooldown();
    cookiesMock.mockResolvedValue(sessionCookieStore(SESSION_VALUE));
    captured = stubMint(() => jsonResponse({ message: "boom" }, 500));
    const signedInFailure = await GET();
    const signedInBody = await signedInFailure.json();

    expect(guest.status).toBe(200);
    expect(guestBody).toEqual({ token: null });

    expect(signedInFailure.status).toBe(503);
    expect(signedInBody).not.toEqual(guestBody);
    expect(signedInBody.code).toBe("AUTH_MINT_UNAVAILABLE");
    expect(signedInBody.token).toBeUndefined();
    expectTokenHeaders(signedInFailure);
  });

  it("R3: an invalid session advertises no Retry-After and no token field", async () => {
    captured = stubMint(() => jsonResponse({ message: "unauthorized" }, 401));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    // Re-signing in is the fix; waiting is not. Advertising a wait would be a lie.
    expect(res.headers.get("retry-after")).toBeNull();
    expect(body.retryAfterSeconds).toBeUndefined();
    expect(body.token).toBeUndefined();
    expectTokenHeaders(res);
  });
});
