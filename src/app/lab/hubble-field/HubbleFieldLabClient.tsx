"use client";

/**
 * Client boundary for the Hubble Field lab.
 * The page is a Server Component (metadata); dynamic(ssr:false) must live here.
 *
 * The sky and the full pin registry are computed on the server
 * (`src/app/lab/hubble-field/page.tsx`) and arrive as props, because
 * `field-fixtures.ts` and `figure-pins.server.ts` are server-only: their real
 * (partly unpublished) slugs must not be compiled into a client chunk. See the
 * page header for the doctrine.
 */
import dynamic from "next/dynamic";
import type { ProfileSky } from "@/shared/contracts-constellations";

const HubbleFieldLab = dynamic(
  () =>
    import("@/components/Constellations/lab/HubbleFieldLab").then(
      (m) => m.HubbleFieldLab,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          minHeight: "100vh",
          background: "#02030a",
          color: "#9aa8c0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Charting the field…
      </div>
    ),
  },
);

export interface HubbleFieldLabClientProps {
  sky: ProfileSky;
  /** The full server-side registry — the lab reviews every authored course. */
  pins: Readonly<Record<string, string>>;
}

export function HubbleFieldLabClient({ sky, pins }: HubbleFieldLabClientProps) {
  return <HubbleFieldLab sky={sky} pins={pins} />;
}
