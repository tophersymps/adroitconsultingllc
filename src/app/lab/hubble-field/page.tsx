import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FIGURE_PINS_ALL } from "@/components/Constellations/chart/figure-pins.server";
import { labProfileSky } from "@/components/Constellations/lab/field-fixtures";
import { HubbleFieldLabClient } from "./HubbleFieldLabClient";

/**
 * Hubble Field lab — the star chart against synthetic fixtures.
 *
 * Since the Phase 2 port this renders the *production* chart, not a mockup of
 * it. What the lab still buys is data: seven courses at deliberately uneven
 * completion, so every visual state is on screen at once without a session and
 * without a database.
 *
 * Gated: development by default. Production returns 404 unless
 * ALLOW_HUBBLE_LAB=1 is set (staging review only). noindex + /lab/ robots.
 *
 * dynamic(ssr:false) lives in HubbleFieldLabClient — App Router forbids
 * that option on Server Components.
 *
 * SERVER-ONLY DATA (t_af115dd1 / t_5fdeb918). The fixture set names real
 * series slugs, three of them unpublished, and the full pin registry
 * (`FIGURE_PINS_ALL`) names every stealth course's constellation. Neither may be
 * compiled into a client chunk — `.next/static` is a public artifact and the
 * ALLOW_HUBBLE_LAB gate protects the route, not the artifact. So this page
 * computes the sky and passes it, with the full pin map, as props: the data
 * crosses the wire per request and never enters a bundle.
 *
 * `force-dynamic` is load-bearing, not a preference: a staging build with
 * ALLOW_HUBBLE_LAB=1 must not bake this payload into a prerendered
 * `.next/server` html/rsc file.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hubble Field Lab — Adroit",
  description:
    "Internal review surface for the constellation star chart, on synthetic progress.",
  robots: { index: false, follow: false },
};

function labAllowed(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.ALLOW_HUBBLE_LAB === "1";
}

export default function HubbleFieldLabPage() {
  if (!labAllowed()) notFound();
  return <HubbleFieldLabClient sky={labProfileSky()} pins={FIGURE_PINS_ALL} />;
}
