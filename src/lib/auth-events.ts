/**
 * auth-events — the window event name broadcast on every identity transition.
 *
 * Extracted from `useAuth` (PERF-CACHE-M1, t_5f03a8f7) so module caches that
 * must be dropped on an identity change can import the event name without
 * importing `useAuth` itself. That matters because `useAuth` now imports the
 * progress-summary invalidator: keeping the constant in `useAuth` would have
 * created the cycle `useAuth → useProgressSummary → useAuth`.
 *
 * `useAuth` re-exports the constant, so existing importers are unaffected.
 */
export const AUTH_CHANGED_EVENT = "adroit-blog:auth-changed";
