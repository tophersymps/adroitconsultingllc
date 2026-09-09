/**
 * HubbleFieldLab — the star chart lab.
 *
 * This was once a four-study WebGL sandbox (star material, deep field, volume
 * atlas, warp). Those studies were built, reviewed, and rejected: faithful to
 * Hubble, unreadable as a progress surface. They have been deleted rather than
 * left to rot — `docs/implementation-plan-hubble-field.md` §0 records why, and
 * git history has them if the reasoning ever needs revisiting.
 *
 * The study that won is now production. So the lab renders the *production*
 * `StarChart` against synthetic fixtures rather than keeping its own copy of
 * the renderer: two copies of a 700-line SVG component would have drifted
 * within a week, and the only thing the lab actually needs to own is data a
 * reviewer can see without a session.
 *
 * What that buys: the seven courses sit at deliberately uneven completion, so
 * every visual state — untouched, part-way, complete, exam-passed — is on
 * screen at once, which no real account reliably shows.
 */
"use client";

import { useMemo, useState } from "react";
import { buildChartFigures } from "@/lib/chart";
import { StarChart } from "../chart/StarChart";
import { labProfileSky } from "./field-fixtures";

export function HubbleFieldLab() {
  const [focusSlug, setFocusSlug] = useState<string | null>(
    "salesforce-architect",
  );
  const figures = useMemo(() => buildChartFigures(labProfileSky()), []);

  return (
    <div
      data-testid="hubble-field-lab"
      /*
       * The chart is a square that centres itself inside whatever it is given.
       * On /profile the surrounding section supplies the sky; the lab has no
       * page around it, so without this the plate floats on default white and
       * reads as broken rather than as a bounded hero.
       */
      style={{
        minHeight: "100vh",
        background: "#02030a",
        display: "grid",
        placeItems: "center",
      }}
    >
      <StarChart
        figures={figures}
        focusSlug={focusSlug}
        onFocusChange={setFocusSlug}
        // The lab has nowhere to navigate to; the CTA is omitted on purpose.
      />
    </div>
  );
}

export default HubbleFieldLab;
