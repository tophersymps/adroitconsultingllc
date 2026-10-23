/**
 * auth-events — the window event name broadcast on every identity transition.
 *
 * Extracted from `useAuth` (SEC cross-tab focus path, t_2dd0e9f9) so module
 * caches that must be dropped on an identity change can import the event name
 * without importing `useAuth` itself. That matters because `useAuth` now calls
 * `invalidateProgressSummary()` on every identity transition (including the
 * cross-tab `focus` path): keeping the constant in `useAuth` would create the
 * cycle `useAuth → useProgressSummary → useAuth`.
 *
 * `useAuth` re-exports the constant, so existing importers are unaffected.
 */
export const AUTH_CHANGED_EVENT = "adroit-blog:auth-changed";
