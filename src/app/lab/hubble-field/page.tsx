import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
 */
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
  return <HubbleFieldLabClient />;
}
