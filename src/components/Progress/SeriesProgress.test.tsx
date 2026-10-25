/**
 * SeriesProgress — loading-shape contract (PERF-M2, t_c54f6999).
 *
 * The prerendered /atlas HTML shows this island before its summary lands. It
 * used to render a bare 6px pulse bar (~6px tall) and then the full indicator
 * (~28px) after hydration, growing every signed-in card and shifting the rows
 * below it (CLS). The loading state must therefore already be the FINAL
 * height — the same ProgressIndicator, at 0%.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import SeriesProgress from "./SeriesProgress";
import { invalidateProgressSummary } from "@/lib/hooks/useProgressSummary";

const realFetch = globalThis.fetch;

beforeEach(() => {
  invalidateProgressSummary();
  // Never resolves → the component stays in its loading state.
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = realFetch;
  invalidateProgressSummary();
});

describe("SeriesProgress loading shape (PERF-M2)", () => {
  it("reserves the final height: label row + bar, not a bare 6px pulse strip", () => {
    const { container } = render(
      <SeriesProgress lessonSlugs={["l1", "l2", "l3"]} showPercent />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();

    // The old placeholder was a single h-1.5 div used AS the root element; the
    // reserved shape contains the label row and the progress track instead.
    expect(root.className).not.toMatch(/(^|\s)h-1\.5(\s|$)/);
    expect(root.textContent).toContain("0 of 3 complete");
    expect(root.querySelector('[role="progressbar"]')).not.toBeNull();
    // Percentage readout is part of the loaded layout too.
    expect(root.textContent).toContain("0%");
  });
});
