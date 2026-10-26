/**
 * route.degraded.test.ts — R2-5 pinned regression at the API surface
 * (t_34b0e6c3, triage t_2fdc4d06).
 *
 * The real `src/lib/db/server.ts` and the real route handler run here; only
 * `fetch` and `next/headers` are stubbed, so the 429 travels the whole path:
 *
 *   /token → 429, /token/anonymous → 429, /get-session → a user
 *     ⇒ no JWT ⇒ the classified degraded client ⇒ access gate rethrows the
 *       sentinel ⇒ the route answers its GUEST payload at 200.
 *
 * Contract (lois t_32c1c4ea §2.1 / §2.3):
 *   GET  /api/progress/quiz/run  → 200 {"bestScore":0,"attempts":0}
 *   POST /api/progress/quiz/run  → 200 {"status":"unauthenticated"}   (no write)
 * and, always: zero Data API requests without an Authorization header, zero
 * writes of any kind.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { cookiesMock, writeMocks } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  writeMocks: { insertQuizRun: vi.fn(), upsertQuizAttempts: vi.fn() },
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

// Never let a degraded path reach the privileged direct-SQL writer.
vi.mock("@/lib/db/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/service")>()),
  insertQuizRun: writeMocks.insertQuizRun,
  upsertQuizAttempts: writeMocks.upsertQuizAttempts,
}));

import { GET, POST } from "./route";
import { resetAnonymousTokenCacheForTests } from "@/lib/db/anonymous-token";

const AUTH_BASE = "https://auth.test/neondb/auth";
const DATA_BASE = "https://data.test/neondb/rest/v1";
const QUIZ = "omni-studio-cert:check:1";

type Captured = { url: string; method: string; headers: Headers };
let captured: Captured[] = [];

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

/** Every token route 429s with the service's non-standard `x-retry-after`. */
function stubThrottledAuth() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      captured.push({ url, method, headers: requestHeaders(input, init) });

      if (url === `${AUTH_BASE}/token` || url === `${AUTH_BASE}/token/anonymous`) {
        return new Response(JSON.stringify({ message: "Too many requests." }), {
          status: 429,
          headers: { "content-type": "application/json", "x-retry-after": "60" },
        });
      }
      if (url === `${AUTH_BASE}/get-session`) {
        // Identity resolution is NOT part of the rate-limited bucket.
        return jsonResponse({ user: { id: "user-1", email: "learner@test.dev" } });
      }
      if (url.startsWith(DATA_BASE)) {
        throw new Error(`unexpected Data API request: ${method} ${url}`);
      }
      return jsonResponse({ error: `unexpected url ${url}` }, 500);
    }),
  );
}

function withSessionCookie() {
  cookiesMock.mockResolvedValue({
    getAll: () => [{ name: "__Secure-neon-auth.session_token", value: "cookie-value" }],
    get: () => ({ name: "__Secure-neon-auth.session_token", value: "cookie-value" }),
    has: () => true,
    set: () => undefined,
    delete: () => undefined,
  });
}

/** A cookieless guest: the credential predicate decides from `next/headers`. */
function withoutSessionCookie() {
  cookiesMock.mockResolvedValue({
    getAll: () => [],
    get: () => undefined,
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  });
}

function get() {
  return GET(
    new NextRequest(
      `http://localhost:3000/api/progress/quiz/run?quizName=${encodeURIComponent(QUIZ)}`,
    ),
  );
}

function post() {
  return POST(
    new NextRequest("http://localhost:3000/api/progress/quiz/run", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.10" },
      body: JSON.stringify({ quizName: QUIZ, correct: 15, total: 15 }),
    }),
  );
}

beforeEach(() => {
  process.env.NEON_AUTH_BASE_URL = AUTH_BASE;
  process.env.NEON_DATA_API_URL = DATA_BASE;
  captured = [];
  cookiesMock.mockReset();
  writeMocks.insertQuizRun.mockReset();
  writeMocks.upsertQuizAttempts.mockReset();
  resetAnonymousTokenCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.NEON_DATA_API_URL;
});

describe("GET /api/progress/quiz/run under /token/anonymous 429 (R2-5)", () => {
  it("answers the guest payload at 200 instead of 500", async () => {
    withSessionCookie();
    stubThrottledAuth();

    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bestScore: 0, attempts: 0 });
  });

  it("issues no Data API request — never a header-less one", async () => {
    withSessionCookie();
    stubThrottledAuth();

    await get();

    const dataCalls = captured.filter((c) => c.url.startsWith(DATA_BASE));
    expect(dataCalls).toHaveLength(0);
  });
});

describe("POST /api/progress/quiz/run under /token/anonymous 429 (R2-5)", () => {
  it("answers 200 {status:'unauthenticated'} — the guest identity contract", async () => {
    withSessionCookie();
    stubThrottledAuth();

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "unauthenticated" });
  });

  it("attempts no write — reads never become writes on a token failure", async () => {
    withSessionCookie();
    stubThrottledAuth();

    await post();

    expect(writeMocks.insertQuizRun).not.toHaveBeenCalled();
    expect(writeMocks.upsertQuizAttempts).not.toHaveBeenCalled();
    const nonGet = captured.filter(
      (c) => c.method !== "GET" || c.url.startsWith(DATA_BASE),
    );
    expect(nonGet).toHaveLength(0);
  });

  it("logs the degradation once, with no token or cookie material", async () => {
    // Guest: only the shared anonymous mint runs. (Since the fail-closed seam
    // change a credential-bearing request never reaches /token/anonymous, so
    // its degradation is logged by the /api/db/token route instead.)
    withoutSessionCookie();
    stubThrottledAuth();

    await post();

    const warns = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const tokenWarns = warns.filter((c) => c[0] === "[db] token unavailable");
    expect(tokenWarns.length).toBeGreaterThanOrEqual(1);
    const serialised = JSON.stringify(tokenWarns);
    expect(serialised).not.toContain("cookie-value");
    expect(serialised).not.toContain("__Secure-neon-auth");
    expect(serialised).not.toMatch(/authorization/i);
    // The payload is a whitelist — no token value, only its path/status/class.
    const payload = tokenWarns[0][1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "errorClass",
      "retryAfterSeconds",
      "status",
      "suppressedForMs",
      "timestamp",
      "tokenPath",
    ]);
    expect(serialised).not.toMatch(/ey[A-Za-z0-9_-]{10,}\./); // JWT-shaped
  });
});
