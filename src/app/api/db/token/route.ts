/**
 * GET /api/db/token — the caller's own Neon Data API JWT.
 *
 * The Managed Better Auth session cookie is `httpOnly`, so browser code cannot
 * mint a Data API token itself. This route forwards the incoming cookie to
 * Neon Auth (`GET ${NEON_AUTH_BASE_URL}/token`) server-side and returns only the
 * short-lived JWT. It is a *token* endpoint, not an authorization bypass: the
 * token is scoped to the caller's own session, is never cached, and grants
 * exactly what that user's RLS policies already allow.
 *
 * FAIL CLOSED (CWE-636/CWE-863). Being unable to authenticate someone right now
 * is NOT the same fact as "nobody is signed in", and this route must never
 * conflate them:
 *
 *   no session cookie          -> 200 { token: null }   (explicit guest)
 *   cookie, mint ok            -> 200 { token: "<jwt>" }
 *   cookie, upstream 401 / 403 -> 401 { code: "SESSION_INVALID" }
 *   cookie, any other failure  -> 503 { code: "AUTH_MINT_UNAVAILABLE" }
 *
 * `200 { token: null }` on a credential-bearing request is forbidden: the old
 * `catch { return { token: null } }` told every signed-in user whose mint was
 * rate-limited that they were a guest, and the browser silently rendered guest
 * state.
 *
 * A Data API request with NO bearer token is not "the anonymous role" — the
 * gateway answers `400 missing authentication credentials`. Guest-scoped reads
 * are server-side only (`getSupabaseAnonymousClient()`), and the anonymous JWT
 * is never minted for a browser caller.
 *
 * Contract: docs/decisions/2026-10-26-db-token-fail-closed-contract.md
 */
import { NextResponse } from "next/server";
import { getSessionTokenResult } from "@/lib/db/server";
import { hasSessionCredential } from "@/lib/session";

/** The token is derived from the caller's cookie: no store may keep a copy. */
export const dynamic = "force-dynamic";

const TOKEN_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  // Even a cache that ignores `Cache-Control` must key on the identity.
  Vary: "Cookie",
} as const;

const SESSION_INVALID = {
  error: "Your session has expired. Please sign in again.",
  code: "SESSION_INVALID",
} as const;

const TOKEN_UNAVAILABLE = {
  error: "We can't verify your session right now. Please try again in a moment.",
  code: "AUTH_MINT_UNAVAILABLE",
} as const;

/** Advertised wait bounds (`Retry-After`), per the contract. */
const MIN_RETRY_AFTER_S = 1;
const MAX_RETRY_AFTER_S = 120;

function clampRetryAfter(seconds: number | undefined): number | undefined {
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  return Math.min(Math.max(Math.round(seconds), MIN_RETRY_AFTER_S), MAX_RETRY_AFTER_S);
}

export async function GET() {
  // Guests are decided from `next/headers` alone: no cookie ⇒ no identity
  // claim ⇒ a guest answer with NO upstream call (keeps guest traffic out of
  // the `/token` rate-limit bucket shared with `/token/anonymous`).
  if (!(await hasSessionCredential())) {
    return NextResponse.json({ token: null }, { headers: TOKEN_CACHE_HEADERS });
  }

  const result = await getSessionTokenResult();

  if (result.ok) {
    return NextResponse.json(
      { token: result.token },
      { headers: TOKEN_CACHE_HEADERS },
    );
  }

  // Upstream 401/403 mean "this credential is no longer acceptable"; everything
  // else (network, timeout, cooldown, 429, 5xx, malformed, missing config) means
  // "we cannot decide right now". Never a 403 (this is not an authorization
  // decision), never a 500, never a redirect.
  const errorClass = result.errorClass ?? "http";
  const sessionInvalid =
    errorClass === "http" && (result.status === 401 || result.status === 403);
  const retryAfterSeconds = sessionInvalid
    ? undefined
    : clampRetryAfter(result.retryAfterSeconds);

  // Exactly one secret-free diagnostic per failed request. Enumerated, flat
  // fields only: never the raw error, headers, request, cookie store or token
  // material (a `fetch` error can stringify the whole URL).
  console.error("[api/db/token] auth mint failed", {
    event: sessionInvalid ? "auth_session_invalid" : "auth_mint_failed",
    tokenPath: "/token",
    errorClass,
    ...(result.status === undefined ? {} : { status: result.status }),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    ...(result.cooldownRemainingMs === undefined
      ? {}
      : { cooldownRemainingMs: result.cooldownRemainingMs }),
  });

  if (sessionInvalid) {
    return NextResponse.json(SESSION_INVALID, {
      status: 401,
      headers: TOKEN_CACHE_HEADERS,
    });
  }

  return NextResponse.json(
    {
      ...TOKEN_UNAVAILABLE,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
    {
      status: 503,
      headers: {
        ...TOKEN_CACHE_HEADERS,
        ...(retryAfterSeconds === undefined
          ? {}
          : { "Retry-After": String(retryAfterSeconds) }),
      },
    },
  );
}
