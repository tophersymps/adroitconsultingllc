/**
 * src/lib/learn-visibility.ts — THE guest-visibility seam for learn data
 * (ADR-217 … ADR-221, task t_4b6e3daa).
 *
 * WHY THIS EXISTS
 * ---------------
 * Learn *content* (`src/data/learn.ts`, 1,010 lessons) and Learn *visibility*
 * (`courses.status` / `courses.access_model` in Postgres) are two sources of
 * truth. Every public surface that read the first without the second leaked
 * "stealth" series — a `courses` row with `status='live'` AND
 * `access_model='granted'`, which `decideCourseAccessFromInput` resolves to
 * `not-launched` and `/atlas/[series]` turns into a 404 for a guest. The class
 * recurred three times (sitemap SEO-L1 t_018620c9, the site-wide search chunk,
 * the post funnel), so this module is now the ONE place that answers it.
 *
 * RULES (do not re-litigate — see docs/system-architecture-guest-learn-visibility.md)
 * ---------------------------------------------------------------------------------
 *  1. The predicate is `isGuestVisibleCourse` (src/lib/access.ts). No second
 *     stealth list, no free-slug allowlist, no per-surface copy of the rule.
 *  2. The read is the ANONYMOUS, session-less Data API client. Not the
 *     service-role key (least privilege) and not the cookie-bound client: that
 *     one calls `cookies()`, which would opt all 155 prerendered post pages
 *     into dynamic rendering because the funnel reads this seam.
 *  3. FAIL CLOSED on failure. A DB/token failure degrades to the already
 *     ratified static launch mirror (`PUBLICLY_LAUNCHED_SERIES` /
 *     `isPubliclyLaunchedSeries`) — never to "every content series", which is
 *     the fail-open leak this replaces.
 *  4. Filtering happens BEFORE any value reaches `toLearnCardSeries`, a client
 *     component prop, or the search index. Nothing downstream re-filters.
 *
 * STATIC RENDERING: this module reads no request API (no `cookies()`, no
 * `headers()`), so consuming it from a server component keeps that route
 * prerenderable. `cache()` memoises per render, so one page render performs at
 * most one `courses` read.
 */

import { cache } from "react";
import { getSupabaseAnonymousClient } from "@/lib/db/server";
import { isGuestVisibleCourse } from "@/lib/access";
import { PUBLICLY_LAUNCHED_SERIES } from "@/lib/atlas-launch";
import { getAllSeries, toLearnCardSeries } from "@/lib/learn";
import { buildSearchDocs } from "@/lib/search-docs";
import type { LearnCardSeries, LearningSeries } from "@/data/types";
import type {
  AccessModel,
  CourseStatus,
} from "@/shared/contracts-course-catalog";
import type { SearchDoc } from "@/shared/contracts-search";

/** The three columns the visibility question needs — nothing else is read. */
export interface GuestVisibilityRow {
  series_slug: string;
  status: CourseStatus;
  access_model: AccessModel;
}

export interface GuestVisibilityResult {
  /** Series slugs a logged-out visitor can resolve. */
  slugs: ReadonlySet<string>;
  /** True when the DB read failed and the static launch mirror was used. */
  degraded: boolean;
}

/**
 * Pure core: which series slugs are guest-visible, given `courses` rows.
 *
 * Empty in ⇒ empty out. Admins are NOT considered (this is the guest
 * projection); a stealth row is dropped by `isGuestVisibleCourse`.
 */
export function guestVisibleSlugsFromRows(
  rows: readonly GuestVisibilityRow[],
): Set<string> {
  const slugs = new Set<string>();
  for (const row of rows) {
    if (!row?.series_slug) continue;
    if (isGuestVisibleCourse(row)) slugs.add(row.series_slug);
  }
  return slugs;
}

/* ------------------------------------------------------------------ */
/*  Loader                                                            */
/* ------------------------------------------------------------------ */

// Warn ONCE per process, not per page. A token outage during `next build`
// would otherwise print 155 identical lines into the deploy log. Tests that
// assert the degradation use `__resetLearnVisibilityWarningForTests()`.
let warnedAboutDegradation = false;

function warnDegraded(err: unknown): void {
  if (warnedAboutDegradation) return;
  warnedAboutDegradation = true;
  console.warn(
    "[learn-visibility] courses read failed — degrading learn visibility to the static launched-series mirror",
    err,
  );
}

/** Test hook only — the warn-once latch is process-wide by design. */
export function __resetLearnVisibilityWarningForTests(): void {
  warnedAboutDegradation = false;
}

/**
 * Per-render cached read of the guest-visible slug set. Never throws: any
 * failure (missing token, degraded client, RLS/network error) degrades to the
 * static launch mirror and is warned once.
 */
const loadSeam = cache(async (): Promise<GuestVisibilityResult> => {
  try {
    const supabase = await getSupabaseAnonymousClient();
    // No `.eq("status", "live")` — the predicate owns the rule, so the read
    // stays one indexed select of every live row (RLS: live or admin).
    const { data, error } = await supabase
      .from("courses")
      .select("series_slug, status, access_model");
    if (error) throw error;
    return {
      slugs: guestVisibleSlugsFromRows(
        (data ?? []) as GuestVisibilityRow[],
      ),
      degraded: false,
    };
  } catch (err) {
    warnDegraded(err);
    // FAIL CLOSED: the static launch mirror is an allowlist of the four
    // publicly launched series — the same degraded contract every /atlas route
    // and the sitemap already use (t_0194c233 F-2). Never `learnSeries`.
    return { slugs: new Set<string>(PUBLICLY_LAUNCHED_SERIES), degraded: true };
  }
});

/** Slugs a guest can resolve. FAIL-CLOSED to the static launch mirror. */
export async function getGuestVisibleSeriesSlugs(): Promise<
  ReadonlySet<string>
> {
  const { slugs } = await loadSeam();
  return slugs;
}

/** Whether the seam is currently degraded (telemetry/logging only). */
export async function isLearnVisibilityDegraded(): Promise<boolean> {
  const { degraded } = await loadSeam();
  return degraded;
}

/**
 * Content series filtered by the seam, in hub order (`getAllSeries()` order) so
 * the funnel card and the hub card stay identical.
 */
export async function getGuestVisibleSeries(): Promise<LearningSeries[]> {
  const slugs = await getGuestVisibleSeriesSlugs();
  return getAllSeries().filter((s) => slugs.has(s.slug));
}

/**
 * The card projection, already filtered — the only shape a component may
 * accept from this seam (ADR-221: `shortLabel` is resolved server-side).
 */
export async function getGuestVisibleCardSeries(): Promise<LearnCardSeries[]> {
  const series = await getGuestVisibleSeries();
  return series.map((s) => toLearnCardSeries(s));
}

/**
 * Body-free search documents: public posts + visible series + their lessons
 * (title / excerpt / slug / series / tags only). Consumed by
 * `GET /api/search`; never shipped as a prop.
 */
export async function getGuestSearchDocs(): Promise<SearchDoc[]> {
  return buildSearchDocs(await getGuestVisibleSeries());
}
