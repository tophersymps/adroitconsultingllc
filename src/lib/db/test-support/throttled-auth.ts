/**
 * src/lib/db/test-support/throttled-auth.ts — shared fixture for the R2-5
 * forced-429 regression tests (t_ffe32443).
 *
 * The production failure mode: `${NEON_AUTH_BASE_URL}/token` and
 * `/token/anonymous` share one rate-limit bucket, so guest traffic can lock the
 * token route out for 60s (`x-retry-after`). This fixture reproduces ONLY that:
 *
 *   - /token and /token/anonymous → 429 `{message:"Too many requests."}`
 *   - /get-session → the caller's identity (NOT part of the throttled bucket)
 *   - the Data API → any request is a hard failure (a token-less Data API call
 *     is the `400 missing authentication credentials` bug this whole change is
 *     about, so the test must never let one through silently)
 *
 * Not a test file (it matches no `*.test.ts`), so it is never collected by
 * vitest; it exists because eleven degraded-surface suites need the same
 * fixture and a divergent copy in each is how a regression test stops meaning
 * what it says.
 */
import { vi } from "vitest";
import { __resetMintCooldown } from "../server";

export const AUTH_BASE = "https://auth.test/neondb/auth";
export const DATA_BASE = "https://data.test/neondb/rest/v1";

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  return new Headers(init?.headers ?? (input as Request)?.headers ?? undefined);
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface ThrottledAuthOptions {
  /** What GET /get-session answers. Null (default) = a guest. */
  sessionUser?: { id: string; email: string } | null;
  /** Handler for any URL the fixture does not recognise (default: 500). */
  onUnknown?: (url: string) => Response;
}

/**
 * Install the forced-429 `fetch` stub. Returns the live capture array, so a
 * test can assert that no Data API request (header-less or otherwise) was
 * attempted after the token route refused.
 */
export function installThrottledAuth(
  options: ThrottledAuthOptions = {},
): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  const sessionUser = options.sessionUser ?? null;
  // The mint negative cache (t_81b09ba8) is module scope: without this, case 2
  // of a suite would skip the token route entirely and its request-count
  // assertions would silently stop meaning what they say.
  __resetMintCooldown();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const method = init?.method ?? "GET";
      captured.push({ url, method, headers: requestHeaders(input, init) });

      if (
        url === `${AUTH_BASE}/token` ||
        url === `${AUTH_BASE}/token/anonymous`
      ) {
        return new Response(JSON.stringify({ message: "Too many requests." }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "x-retry-after": "60",
          },
        });
      }
      if (url === `${AUTH_BASE}/get-session`) {
        return jsonResponse({ user: sessionUser });
      }
      if (url.startsWith(DATA_BASE)) {
        throw new Error(`unexpected Data API request: ${method} ${url}`);
      }
      return (
        options.onUnknown?.(url) ?? jsonResponse({ error: `unexpected url ${url}` }, 500)
      );
    }),
  );

  return captured;
}

/** The token/Data API endpoints every degraded surface must be pointed at. */
export function applyThrottledAuthEnv(): void {
  process.env.NEON_AUTH_BASE_URL = AUTH_BASE;
  process.env.NEON_DATA_API_URL = DATA_BASE;
}

export function clearThrottledAuthEnv(): void {
  delete process.env.NEON_AUTH_BASE_URL;
  delete process.env.NEON_DATA_API_URL;
}

/** A `next/headers` cookie store carrying a Better Auth session cookie. */
export function sessionCookieStore(value = "cookie-value") {
  const cookie = { name: "__Secure-neon-auth.session_token", value };
  return {
    getAll: () => [cookie],
    get: () => cookie,
    has: () => true,
    set: () => undefined,
    delete: () => undefined,
  };
}

/** A `next/headers` cookie store for a cookieless guest. */
export function guestCookieStore() {
  return {
    getAll: () => [],
    get: () => undefined,
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  };
}

/** Requests to the Data API seen by the fixture (must always be empty). */
export function dataApiRequests(captured: CapturedRequest[]): CapturedRequest[] {
  return captured.filter((c) => c.url.startsWith(DATA_BASE));
}

/** Non-GET requests seen by the fixture (must always be empty). */
export function nonGetRequests(captured: CapturedRequest[]): CapturedRequest[] {
  return captured.filter((c) => c.method !== "GET");
}
