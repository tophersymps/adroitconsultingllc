/**
 * src/lib/atlas-disclosure.ts — the DB half of the disclosure predicate
 * (t_b4c0da5f, CWE-200).
 *
 * `mayDiscloseSeries(slug, dbLive)` in `atlas-launch.ts` owns the rule; this
 * module supplies `dbLive` from the `courses` row. It lives apart from
 * `atlas-launch.ts` so that file stays a pure static mirror (it is imported by
 * the sitemap and the degraded routes, neither of which should pull the DB
 * seam in just to read the constant).
 *
 * FAIL-CLOSED classification only: a credential-outage error yields `null`
 * (the caller falls back to the static mirror); any other loader error still
 * propagates — it is a real bug, not an outage.
 */
import { getCourseRowBySlug } from "@/lib/access";
import { isDbTokenUnavailable } from "@/lib/db/degraded-client";
import { isPubliclyLaunchedSeries, mayDiscloseSeries } from "@/lib/atlas-launch";

/**
 * Returns `true` when `courses.status = 'live'`, `false` when the row exists but
 * is not live or does not exist, and `null` when the DB could not be read.
 */
export async function isSeriesDbLive(slug: string): Promise<boolean | null> {
  try {
    const row = await getCourseRowBySlug(slug);
    return row?.status === "live";
  } catch (err) {
    if (!isDbTokenUnavailable(err)) throw err;
    return null;
  }
}

/**
 * The disclosure decision for a public surface: one call, no DB work when the
 * slug is not in the static mirror at all (a stealth slug can never be named,
 * so there is nothing to ask the database).
 */
export async function mayDiscloseSeriesLive(slug: string): Promise<boolean> {
  if (!isPubliclyLaunchedSeries(slug)) return false;
  return mayDiscloseSeries(slug, await isSeriesDbLive(slug));
}
