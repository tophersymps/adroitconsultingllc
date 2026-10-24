/**
 * src/lib/atlas-launch.ts — STATIC launch mirror for credential-outage
 * degrading (security t_c4eafa3b F-1/F-2, fix t_64253bbc).
 *
 * WHY THIS EXISTS
 * ---------------
 * `accessSeam.decideCourseAccess()` returns `{ kind: "unavailable" }` when the
 * Data API credential bridge cannot mint a JWT at all (t_223f8b3d). In that
 * state NO read is possible — neither the course row nor the caller's
 * entitlements — so the seam cannot tell "this series has no `courses` row
 * (stealth)" from "the bridge is down". Both look identical.
 *
 * That ambiguity must never be resolved as "public": rendering the lesson /
 * quiz / exam / certificate page under `unavailable` published gated content
 * (HIGH, CWE-285/CWE-693/CWE-200), and rendering a stealth series' syllabus
 * published the existence of an unpublished course (MEDIUM, CWE-200).
 *
 * The rule therefore is FAIL CLOSED ON CONTENT, DEGRADE ONLY ON AVAILABILITY:
 *
 *   - series this file knows is publicly launched → the page may degrade
 *     (guest/static shell, or a "temporarily unavailable, retry" notice) but
 *     NEVER renders gated content;
 *   - any other series → `notFound()`, exactly as it would 404 on a healthy
 *     read (stealth existence stays hidden).
 *
 * The list is the static mirror of the `courses` rows seeded as live by
 * `supabase/migrations/008_course_catalog.sql`. It is used ONLY on the
 * `unavailable` path; every healthy decision still comes from the DB seam.
 * `src/lib/atlas-launch.test.ts` asserts parity with that seed migration so a
 * newly seeded launch cannot silently 404 during an outage.
 *
 * WHEN A NEW COURSE LAUNCHES: add its `series_slug` here in the same PR that
 * adds its seeded `courses` row.
 *
 * Residual risk (documented in CHANGELOG): a course row created at RUNTIME
 * (admin backend, no migration) is not mirrored here, so it 404s for the
 * duration of a credential outage rather than showing its syllabus. That is
 * the fail-closed direction of the trade-off — a transient 404 on a public
 * outline, never a published paywalled lesson.
 */
export const PUBLICLY_LAUNCHED_SERIES = [
  "agentic-ai",
  "ai-at-work",
  "omni-studio-cert",
  "salesforce-architect",
] as const;

const PUBLICLY_LAUNCHED = new Set<string>(PUBLICLY_LAUNCHED_SERIES);

/**
 * True when the series is known (statically) to have a live `courses` row, so
 * an availability-only degrade of its public surface is safe. Never use this
 * for an access decision — only to choose HOW to fail when the seam already
 * said it could not decide.
 */
export function isPubliclyLaunchedSeries(slug: string): boolean {
  return PUBLICLY_LAUNCHED.has(slug);
}
