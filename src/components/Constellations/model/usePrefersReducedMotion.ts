/**
 * usePrefersReducedMotion — bind the chart to the user's motion preference
 * (a11y). The on-course tracker and profile 2D charts disable decorative motion
 * (pulsing, page drift) when the user opts out.
 *
 * Reads `matchMedia('(prefers-reduced-motion: reduce)')` and returns a live
 * boolean. SSR-safe (returns false on the server), and re-evaluates when the
 * user toggles the OS setting while the page is open.
 */
"use client";

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the user prefers reduced motion. SSR → false. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const update = () => setReduced(mql.matches);
    update();
    // Modern browsers: addEventListener; older Safari: addListener.
    mql.addEventListener?.("change", update);
    mql.addListener?.(update);
    return () => {
      mql.removeEventListener?.("change", update);
      mql.removeListener?.(update);
    };
  }, []);

  return reduced;
}
