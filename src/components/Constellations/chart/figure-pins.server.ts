/**
 * figure-pins.server.ts — the FULL course→constellation registry, server-side.
 *
 * WHY THIS IS A SEPARATE MODULE (t_af115dd1 / t_5fdeb918)
 * ------------------------------------------------------
 * The editorial registry pins all twelve authored courses to a constellation.
 * That registry used to live in `figure-assignment.ts`, which is a *client*
 * module: `/atlas/[series]` (SeriesStarChart) and `/profile` (FullSkySection)
 * both render the chart in the browser. So every stealth series slug — and the
 * constellation it owns — was compiled into a public chunk under
 * `.next/static`, readable with no session and no outage. CWE-200.
 *
 * The doctrine, settled in t_af115dd1 §1:
 *
 *   **a client chunk is a published artifact; a per-request RSC payload of an
 *   env-gated noindex non-prod route is not.**
 *
 * Therefore the *client* map (`FIGURE_PINS` in `figure-assignment.ts`) ships
 * only the launched projection — the four series in `PUBLICLY_LAUNCHED_SERIES`.
 * The full registry lives here, behind `server-only`, and is used for:
 *
 *   - the Hubble Field lab, which is env-gated, noindex, unlinked, non-prod and
 *     delivered as a per-request payload (never a static artifact) because its
 *     page is `force-dynamic`;
 *   - the constellation pool (`constellation-pool.ts`), so a reserved figure is
 *     never recommended for a new course because the client map forgot it;
 *   - tests (`chart.test.ts`), which exercise the whole registry.
 *
 * Do not import this from a Client Component. `import "server-only"` fails the
 * build if you do — that is the point, and `server-only-guard.test.ts` pins it.
 *
 * Drift is impossible in both directions: `chart.test.ts` asserts
 * `FIGURE_PINS` deep-equals `publicPins()` and that the client map's keys are
 * exactly `PUBLICLY_LAUNCHED_SERIES`. A stealth pin added to the client map
 * fails, and so does a launch that forgets its client pin.
 */
import "server-only";

import { PUBLICLY_LAUNCHED_SERIES } from "@/lib/atlas-launch";

/**
 * Every authored course pinned to the constellation it owns — the full
 * editorial contract, verbatim from the pre-t_5fdeb918 client map.
 *
 * Exclusivity is enforced by `assignFigures` (a claimed figure cannot be taken
 * twice) and by the registry suite in `chart.test.ts` (no two courses may share
 * a pin). Adding a course means pinning it to an unused constellation; the
 * pool in `constellation-pool.ts` says which ones are still free.
 */
export const FIGURE_PINS_ALL: Readonly<Record<string, string>> = {
  "salesforce-architect": "Centaurus",
  "agentic-ai": "Cetus",
  "omni-studio-cert": "Hydra",
  "ai-at-work": "Virgo",
  "ai-power-user": "Taurus",
  "ai-adoption": "Auriga",
  "hermes-consultant": "Hercules",
  "hermes-consultant-intermediate": "Draco",
  "hermes-consultant-advanced": "Eridanus",
  "salesforce-sharing-visibility-architect": "Scorpius",
  "salesforce-data-architect": "Ophiuchus",
  "sf-omni-consultant": "Gemini",
};

/**
 * The published projection: only series named in the static launch mirror.
 *
 * This is what `FIGURE_PINS` (client) must equal. It is derived, not
 * hand-copied, so a launch only has to be added to `PUBLICLY_LAUNCHED_SERIES`
 * and its pin is published automatically — while a series that is pinned here
 * but not launched stays out of every client bundle.
 */
export function publicPins(): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const slug of PUBLICLY_LAUNCHED_SERIES) {
    const pin = FIGURE_PINS_ALL[slug];
    if (pin) out[slug] = pin;
  }
  return out;
}
