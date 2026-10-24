/**
 * GET /api/atlas/cards — signed-in card projection for the prerendered hub.
 *
 * WHY: `/atlas` renders statically (`dynamic = "force-static"`, no identity
 * read) so it can stay a CDN-cached public hub. The static projection is the
 * guest one, which is a false state for a signed-in visitor (A11Y-M1 on
 * t_dd870a3a: "Sign in to access courses" on accessible cards, plain-text
 * titles). `useCardGateUpgrade` reads THIS route after hydration and merges
 * the real projection back onto the cards.
 *
 * Session-gated: guests → `{ gate: "guest-locked", series: [] }` (the island
 * then keeps the prerendered markup untouched). Signed-in → `{ gate:
 * "signed-in", series: [{ slug, canAccess, lessonSlugs }] }`.
 *
 * The payload is deliberately slim: only the two fields the static card does
 * NOT have (`canAccess` from the access seam, `lessonSlugs` for
 * SeriesProgress). Name/description/org stay in the prerendered HTML — so the
 * guest hardening on this route still holds (no per-lesson METADATA ships,
 * just content slugs, which the signed-in surfaces already publish).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getCatalogForUserV2, toLearnHubCards } from "@/lib/catalog";

/** Never cache: the response is per-session. */
export const dynamic = "force-dynamic";

/**
 * Every return path is per-user/per-session, so no browser or shared
 * intermediary may store it (SEC-L2, CWE-525, t_15a53bb8). This matches the
 * header on `/api/progress/summary`.
 */
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(): Promise<Response> {
  let user;
  try {
    user = await getSessionUser();
  } catch {
    user = null; // broken auth backend → guest (reads degrade, never throw)
  }

  if (!user) {
    return NextResponse.json(
      { gate: "guest-locked", series: [] },
      { headers: NO_STORE_HEADERS },
    );
  }

  try {
    const catalog = await getCatalogForUserV2(user.id);
    const cards = toLearnHubCards(catalog.courses, { includeLessonSlugs: true });

    return NextResponse.json(
      {
        gate: "signed-in",
        series: cards.map((c) => ({
          slug: c.slug,
          canAccess: c.canAccess,
          lessonSlugs: c.lessonSlugs,
        })),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    // Catalogue read failed → 503 so the island keeps the guest baseline
    // instead of upgrading to a half-resolved (all-locked) signed-in state.
    return NextResponse.json(
      { gate: "guest-locked", series: [] },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
