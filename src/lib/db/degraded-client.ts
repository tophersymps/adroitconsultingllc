/**
 * src/lib/db/degraded-client.ts — the "no Data API token" state (R2-5).
 *
 * When `/token/anonymous` is rate-limited (429) or unreachable, there is no
 * JWT to send. The old code either issued a header-less Data API request
 * (answered 400 "missing authentication credentials", which `access.ts`
 * rethrows as a page 500) or threw outright. Both are now impossible:
 *
 *   - `createDbClient` requires a non-empty JWT, so a header-less request can
 *     no longer be constructed;
 *   - this module supplies a client that answers every query with a CLASSIFIED
 *     error (`DbTokenUnavailableError`, code `TOKEN_UNAVAILABLE`) without
 *     touching the network.
 *
 * The error is classified rather than an empty result (S-11): surfaces can
 * tell "we could not authorize" apart from "you have no rows", and a real
 * Data API / RLS failure is never masked as a graceful empty page (R-6).
 *
 * `auth.getUser()` keeps its real meaning: identity is resolved by
 * `/get-session`, which is NOT part of the rate-limited token bucket, so
 * authenticated gates still answer 307/401/403 instead of 500.
 */
import "server-only";
import type { DbClient } from "./server";

/** Classified "the Data API token could not be resolved" sentinel. */
export class DbTokenUnavailableError extends Error {
  readonly code = "TOKEN_UNAVAILABLE";
  /** Correlation tag so a plain PostgREST error can never be mistaken for it. */
  readonly correlation = "r2-5-token-unavailable";

  constructor(readonly tokenPath?: string) {
    super("Neon Data API token is unavailable");
    this.name = "DbTokenUnavailableError";
  }
}

/** Branded check on our own error class — never a message-string match. */
export function isDbTokenUnavailable(
  err: unknown,
): err is DbTokenUnavailableError {
  return (
    err instanceof DbTokenUnavailableError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { code?: unknown }).code === "TOKEN_UNAVAILABLE" &&
      (err as { correlation?: unknown }).correlation ===
        "r2-5-token-unavailable")
  );
}

/** The `{ data, error }` reply every degraded query resolves to. */
export function degradedResult(): {
  data: null;
  error: DbTokenUnavailableError;
  count: null;
  status: 0;
  statusText: string;
} {
  return {
    data: null,
    error: new DbTokenUnavailableError("/token/anonymous"),
    count: null,
    status: 0,
    statusText: "token-unavailable",
  };
}

/**
 * Every builder method PostgREST clients chain on. Each returns the chain so
 * `.from().select().eq().maybeSingle()` still type-checks and runs; the
 * thenable resolves once, to the classified error. Keeping the list explicit
 * matters: a method that is missing would throw `undefined is not a function`
 * inside a page instead of degrading.
 */
const BUILDER_METHODS = [
  "select",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "not",
  "or",
  "order",
  "limit",
  "range",
  "match",
  "filter",
  "contains",
  "containedBy",
  "overlaps",
  "textSearch",
  "single",
  "maybeSingle",
  "csv",
  "geojson",
  "explain",
  "returns",
  "abortSignal",
  "insert",
  "update",
  "upsert",
  "delete",
] as const;

/** A thenable query stand-in that never issues a request. */
function createDegradedChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const method of BUILDER_METHODS) {
    chain[method] = () => chain;
  }
  chain.then = (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(degradedResult()).then(onFulfilled, onRejected);
  chain.catch = (onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(degradedResult()).catch(onRejected);
  chain.finally = (onFinally?: () => void) =>
    Promise.resolve(degradedResult()).finally(onFinally);
  return chain;
}

/**
 * A `DbClient` whose reads resolve to `DbTokenUnavailableError` and whose
 * `auth.getUser()` still resolves the real session.
 *
 * `getUser` is injected to avoid a module cycle with server.ts.
 */
export function createTokenUnavailableClient(
  getUser: () => Promise<{
    data: { user: { id: string; email: string } | null };
    error: Error | null;
  }>,
): DbClient {
  const client = {
    from: () => createDegradedChain(),
    rpc: () => createDegradedChain(),
    schema: () => createDegradedChain(),
    auth: { getUser },
  };
  return client as unknown as DbClient;
}
