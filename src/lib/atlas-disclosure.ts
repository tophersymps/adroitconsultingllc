/**
 * src/lib/atlas-disclosure.ts — the DB half of the disclosure predicate
 * (t_b4c0da5f, CWE-200; DB becomes the disclosure authority in t_47183b5b).
 *
 * `mayDiscloseSeries(slug, guestVisible)` in `atlas-launch.ts` owns the rule;
 * this module supplies `guestVisible` from the `courses` row, folded through
 * the single stealth rule `isGuestVisibleCourse` (`access.ts`). It lives apart
 * from `atlas-launch.ts` so that file stays a pure static snapshot (it is
 * imported by the sitemap and the degraded routes, neither of which should
 * pull the DB seam in just to read the constant).
 *
 * FAIL-CLOSED classification only: a credential-outage error yields `null`
 * (the caller falls back to the static launch mirror); any other loader error
 * still propagates — it is a real bug, not an outage.
 */
import { getCourseRowBySlug, isGuestVisibleCourse } from "@/lib/access";
import { isDbTokenUnavailable } from "@/lib/db/degraded-client";
import { mayDiscloseSeries } from "@/lib/atlas-launch";

/**
 * Returns the DB verdict for "would a guest resolve this series?":
 * `true` when the row is `live` and non-stealth, `false` when the row exists
 * but is stealth/delisted or does not exist at all, and `null` when the DB
 * could not be read (credential outage → caller falls back to the mirror).
 */
export async function isSeriesGuestVisible(
  slug: string,
): Promise<boolean | null> {
  try {
    const row = await getCourseRowBySlug(slug);
    if (!row) return false; // no row → stealth; a guest would 404
    return isGuestVisibleCourse(row); // live && access_model !== "granted"
  } catch (err) {
    if (!isDbTokenUnavailable(err)) throw err;
    return null; // credential outage → caller falls back to the mirror
  }
}

/**
 * The disclosure decision for a public surface: the DB is the authority when
 * it is readable, and the static launch mirror only answers the outage case.
 *
 * There is deliberately NO mirror short-circuit: a DB-live non-stealth series
 * must be disclosable even when it has never been added to
 * `PUBLICLY_LAUNCHED_SERIES` (t_47183b5b).
 */
export async function mayDiscloseSeriesLive(slug: string): Promise<boolean> {
  return mayDiscloseSeries(slug, await isSeriesGuestVisible(slug));
}
