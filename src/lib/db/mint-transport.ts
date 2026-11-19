/**
 * src/lib/db/mint-transport.ts — the transport the token mint talks through,
 * plus the classification of Next's static-render control-flow signals
 * (t_72f9d850).
 *
 * WHY THIS EXISTS
 * ---------------
 * `next build` replaces `globalThis.fetch` with Next's instrumented fetch. For
 * a `cache: "no-store"` request issued while a page is being prerendered, that
 * instrumented fetch reports a dynamic access, and the legacy prerender store
 * bails out of static generation by THROWING `DynamicServerError`:
 *
 *   "Route /field-notes/<slug> couldn't be rendered statically because it used
 *    revalidate: 0 fetch"          (`revalidate: 0` == `cache: "no-store"`)
 *
 * The auth mint is NOT page data:
 *   - its `no-store` means "never cache a credential", not "this render is
 *     stale", and
 *   - its result is already deliberately cached process-wide
 *     (./anonymous-token).
 *
 * So the mint must not participate in the render's fetch tracking at all. While
 * it did, the throw landed in the mint's generic `catch {}`, was classified as
 * a **network** failure, armed the process-wide mint cooldown, and every later
 * DB read in that build process degraded to the launch mirror — which is how
 * `/atlas` (force-static + ISR 3600) baked its "graceful empty hub" and
 * shipped 0 courses.
 *
 * Two layers, both needed:
 *
 *  1. `mintFetch` opts the request out of Next's instrumentation with the flag
 *     Next itself uses for internal requests — `init.next.internal` — for which
 *     patch-fetch returns the ORIGINAL fetch untouched:
 *
 *       if (isInternal) return originFetch(input, init)
 *       — node_modules/next/dist/server/lib/patch-fetch.js
 *
 *     No render scope is marked dynamic, no fetch-cache entry is written, and
 *     `cache: "no-store"` keeps its plain HTTP meaning (undici). `no-store`
 *     semantics, the caller's `AbortSignal` timeout and the 800 ms mint budget
 *     are unchanged.
 *
 *  2. If a dynamic-usage signal still reaches the mint anyway,
 *     `isNextDynamicUsageError` lets the caller RETHROW it instead of
 *     classifying it: it is Next asking the route to render dynamically, not
 *     the endpoint failing. Belt-and-braces — with (1) this fetch does not
 *     raise it — but it keeps the mint honest if Next's opt-out ever changes.
 */
import "server-only";

/**
 * `next.internal` is not part of Next's public `NextFetchRequestConfig`
 * (`next/types/global.d.ts` declares `revalidate` and `tags` only), but
 * patch-fetch reads exactly this key, so the init is typed locally.
 */
type MintRequestInit = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[]; internal?: boolean };
};

/**
 * Fetch for the auth mint / session lookup: never tracked by Next's
 * static-render fetch instrumentation, so a prerendered route can still read
 * the DB instead of bailing out (or baking a degraded page).
 */
export function mintFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const opts: MintRequestInit = {
    ...init,
    next: { ...init.next, internal: true },
  };
  return fetch(input, opts);
}

/**
 * The `digest` Next's `DynamicServerError` carries
 * (`next/dist/client/components/hooks-server-context.js`).
 */
const DYNAMIC_SERVER_USAGE = "DYNAMIC_SERVER_USAGE";

/**
 * True for Next's static-render bail-out signal. It is a CONTROL-FLOW
 * instruction, not a data-layer failure: swallowing it turns "this route
 * cannot be prerendered" into "the credential endpoint is down", which is the
 * misclassification t_72f9d850 fixed.
 */
export function isNextDynamicUsageError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { digest?: unknown }).digest === DYNAMIC_SERVER_USAGE
  );
}
