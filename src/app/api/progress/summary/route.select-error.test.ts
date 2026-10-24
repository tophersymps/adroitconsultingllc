/**
 * route.select-error.test.ts — CWE-778 / CWE-209 regression for
 * GET /api/progress/summary (t_601ef414, LOW from val-el's re-verify).
 *
 * Regression being pinned: the three progress selects were awaited and only
 * `res.data` was read. A PostgREST reply with HTTP 503 (Data API down), 401
 * (expired JWT) or 403 (RLS denial) is NOT thrown by the client — it comes back
 * as `{ data: null, error }` — so the handler fell through and answered
 * `200 {"readContent":{"blog":[],"lesson":[]},"completedLessons":[],"quizStats":{}}`,
 * i.e. an outage was indistinguishable from "this learner has done nothing",
 * and nothing was logged.
 *
 * Contract after the fix:
 *
 *   Data API error (non-token) -> 503 + `private, no-store` + a status/code log
 *   R2-5 token unavailable     -> 200 empty (unchanged guest contract, see
 *                                 route.degraded.test.ts)
 *
 * Only `fetch` is stubbed; the real route, the real `db/server.ts` and the real
 * access seam run.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({ cookiesMock: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { GET } from "./route";
import { resetAnonymousTokenCacheForTests } from "@/lib/db/anonymous-token";
import {
  applyThrottledAuthEnv,
  clearThrottledAuthEnv,
  DATA_BASE,
  sessionCookieStore,
} from "@/lib/db/test-support/throttled-auth";

const AUTH_BASE = "https://auth.test/neondb/auth";

const EMPTY_SUMMARY = {
  readContent: { blog: [], lesson: [] },
  completedLessons: [],
  quizStats: {},
};

/** A JWT-shaped session token: `db/server.ts` decodes it for `exp`. */
function sessionJwt(): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "EdDSA" })}.${b64({
    sub: "user-1",
    role: "authenticated",
    exp: now + 3600,
  })}.signature`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

/**
 * Stub `fetch` for a healthy auth backend and a Data API that answers every
 * select with `reply()`. This is the exact shape val-el reproduced: the token
 * mint works, the session resolves, the Data API is the broken hop.
 */
function installDataApiOutage(reply: () => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === `${AUTH_BASE}/token`) return jsonResponse({ token: sessionJwt() });
      if (url === `${AUTH_BASE}/token/anonymous`) {
        // Must never be reached: the session mint succeeded.
        return jsonResponse({ error: "unexpected anonymous mint" }, 401);
      }
      if (url === `${AUTH_BASE}/get-session`) {
        return jsonResponse({ user: { id: "user-1", email: "learner@test.dev" } });
      }
      if (url.startsWith(DATA_BASE)) return reply();
      return jsonResponse({ error: `unexpected url ${url}` }, 500);
    }),
  );
}

beforeEach(() => {
  applyThrottledAuthEnv();
  cookiesMock.mockReset();
  cookiesMock.mockResolvedValue(sessionCookieStore());
  resetAnonymousTokenCacheForTests();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearThrottledAuthEnv();
});

describe("GET /api/progress/summary — Data API select errors (t_601ef414)", () => {
  it("answers 503 (never an empty 200) when every select fails with a 503", async () => {
    installDataApiOutage(() =>
      jsonResponse({ message: "upstream connect error", code: "XX000" }, 503),
    );

    const res = await GET();

    // The defect: this used to be a 200 carrying an empty summary.
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual(EMPTY_SUMMARY);
  });

  it("logs the failure status and code, and nothing about the rows or the user", async () => {
    installDataApiOutage(() =>
      jsonResponse({ message: "upstream connect error", code: "XX000" }, 503),
    );

    await GET();

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [message, context] = consoleError.mock.calls[0] as [string, unknown];
    expect(message).toBe("[progress/summary] select failed");
    // postgrest-js exposes the SQLSTATE/PostgREST `code` but not the HTTP
    // status on the error object, so the log carries the code and adds
    // `status` only when the shape actually has one.
    expect(context).toEqual({ code: "XX000" });
    // No PII and no row payload in the log line.
    expect(JSON.stringify(context)).not.toContain("user-1");
    expect(JSON.stringify(context)).not.toContain("learner@test.dev");
  });

  it.each([401, 403])(
    "treats an HTTP %i from the Data API as an outage, not as an empty account",
    async (status) => {
      installDataApiOutage(() =>
        jsonResponse({ message: "permission denied", code: "42501" }, status),
      );

      const res = await GET();

      expect(res.status).toBe(503);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.json()).toEqual(EMPTY_SUMMARY);
    },
  );

  it("fails closed: a partial failure never leaks the rows that did answer", async () => {
    // read_progress answers 200 with a blog read, lesson_completion 403.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url === `${AUTH_BASE}/token`) return jsonResponse({ token: sessionJwt() });
        if (url === `${AUTH_BASE}/get-session`) {
          return jsonResponse({ user: { id: "user-1", email: "learner@test.dev" } });
        }
        if (url.startsWith(DATA_BASE)) {
          if (url.includes("read_progress")) {
            return jsonResponse([
              { content_type: "blog", content_slug: "blog/hello-world" },
            ]);
          }
          return jsonResponse({ message: "permission denied", code: "42501" }, 403);
        }
        return jsonResponse({ error: `unexpected url ${url}` }, 500);
      }),
    );

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(EMPTY_SUMMARY);
  });

  it("still answers 200 with the real rows when every select succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url === `${AUTH_BASE}/token`) return jsonResponse({ token: sessionJwt() });
        if (url === `${AUTH_BASE}/get-session`) {
          return jsonResponse({ user: { id: "user-1", email: "learner@test.dev" } });
        }
        if (url.startsWith(DATA_BASE)) {
          if (url.includes("read_progress")) {
            return jsonResponse([
              { content_type: "blog", content_slug: "blog/hello-world" },
            ]);
          }
          return jsonResponse([]);
        }
        return jsonResponse({ error: `unexpected url ${url}` }, 500);
      }),
    );

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const json = await res.json();
    expect(json.readContent.blog).toEqual(["blog/hello-world"]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
