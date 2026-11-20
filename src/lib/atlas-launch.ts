/**
 * src/lib/atlas-launch.ts — STATIC launch snapshot: the fail-closed outage
 * fallback and the source of the client chart pins (t_47183b5b).
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
 * THE CONTRACT (rewritten for t_47183b5b — do not re-litigate)
 * -----------------------------------------------------------
 * The DB is the sole DISCLOSURE authority **whenever it is readable**. This
 * list is a hand-maintained SNAPSHOT, and a snapshot can never track a
 * runtime-writable table: every `/admin` launch between t_b4c0da5f
 * (2026-10-23) and t_47183b5b was `live` + non-stealth yet absent from the
 * four-slug mirror, so the crawler-visible surfaces silently dropped it. That
 * drift is structural, not a matter of discipline.
 *
 * `PUBLICLY_LAUNCHED_SERIES` is therefore consumed on exactly TWO paths:
 *
 *   1. the FAIL-CLOSED fallback used only when the `courses` row cannot be
 *      read (credential outage) — the degraded contract every `/atlas` route
 *      and the sitemap use; and
 *   2. `publicPins()` (`figure-pins.server.ts`), which derives the client chart
 *      map from it.
 *
 * It is explicitly NOT load-bearing for healthy-path disclosure. A stale
 * mirror can no longer hide a live, non-stealth course; the disclosure verdict
 * comes from `isGuestVisibleCourse` (`access.ts`) via the DB seam.
 * `src/lib/atlas-launch.test.ts` pins both directions so a stealth series
 * cannot be added here and a seeded launch cannot silently 404 during an
 * outage.
 *
 * WHEN A NEW COURSE LAUNCHES: on the healthy path, nothing is required — the
 * DB already discloses it. Adding its `series_slug` here is only needed for
 * the outage fallback and for its client chart pin, so do it in the same PR as
 * the seeded `courses` row (or the pin will be missing).
 *
 * Residual risk (documented in CHANGELOG): a course row created at RUNTIME
 * (admin backend, no migration) is not mirrored here, so it 404s for the
 * duration of a credential outage rather than showing its syllabus. That is
 * the fail-closed direction of the trade-off — a transient 404 on a public
 * outline, never a published paywalled lesson.
 */
export const PUBLICLY_LAUNCHED_SERIES = [
  "agentic-ai",
  "ai-adoption",
  "ai-at-work",
  "ai-power-user",
  "omni-studio-cert",
  "salesforce-architect",
  "salesforce-data-architect",
  "salesforce-sharing-visibility-architect",
  "sf-agentforce-sales-consultant",
  "sf-data360-consultant",
  "sf-omni-consultant",
] as const;

const PUBLICLY_LAUNCHED = new Set<string>(PUBLICLY_LAUNCHED_SERIES);

/**
 * True when the series is known (statically) to have a live `courses` row, so
 * an availability-only degrade of its public surface is safe. Never use this
 * for an access decision — only to choose HOW to fail when the seam already
 * said it could not decide.
 *
 * Consumed as the outage fallback and as the source of `publicPins()`; NOT the
 * healthy-path disclosure rule (t_47183b5b).
 */
export function isPubliclyLaunchedSeries(slug: string): boolean {
  return PUBLICLY_LAUNCHED.has(slug);
}

/**
 * DISCLOSURE predicate. The DB is the sole disclosure authority when it is
 * readable; this list only answers the outage case:
 *
 *   mayDiscloseSeries(slug, guestVisible)
 *
 * `guestVisible` is the DB verdict for "would a guest resolve this series?" —
 * i.e. `isGuestVisibleCourse(row)` (live && access_model !== "granted"), the
 * single stealth rule in `access.ts` — or `null` when the DB could not be read:
 *   - `true`  → the row is live and non-stealth: DISCLOSE (t_47183b5b — no
 *               mirror intersection; intersecting could only ever drop
 *               non-stealth rows, which is how every `/admin` launch since
 *               t_b4c0da5f became undiscoverable);
 *   - `false` → the row is stealth, delisted, or absent: do not disclose;
 *   - `null`  → credential outage: fail closed to the static launch mirror,
 *               exactly as the routes do on `unavailable`.
 *
 * `access.ts` imports nothing from this module, so this predicate can never
 * change an access decision (`DISCLOSURE_NEVER_GRANTS_ACCESS`).
 */
export function mayDiscloseSeries(
  slug: string,
  /** The DB verdict for "would a guest resolve this series?", or `null` when
   *  the DB could not be read. Must come from `isGuestVisibleCourse`, so the
   *  stealth rule is applied exactly once, in `access.ts`. */
  guestVisible: boolean | null,
): boolean {
  // DB unreadable → fail closed to the static launch mirror.
  if (guestVisible === null) return isPubliclyLaunchedSeries(slug);
  // DB readable → the DB is the sole disclosure authority (t_47183b5b).
  // There is no mirror intersection here by design: the DB predicate already
  // excludes stealth, and intersecting could only drop NON-stealth rows —
  // how every /admin launch since t_b4c0da5f became undiscoverable.
  return guestVisible;
}
