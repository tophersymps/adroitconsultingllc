"use client";

/**
 * Client boundary for the Hubble Field lab.
 * The page is a Server Component (metadata); dynamic(ssr:false) must live here.
 */
import dynamic from "next/dynamic";

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

export function HubbleFieldLabClient() {
  return <HubbleFieldLab />;
}
