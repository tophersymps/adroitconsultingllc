/**
 * star-chart.test.tsx — the chart's interaction and accessibility contract.
 *
 * These are the behaviours that break silently. A `role="img"` on the wrapper
 * hides every figure button from assistive tech while leaving them
 * keyboard-reachable, and nothing about the page looks wrong.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StarChart } from "./StarChart";
import { buildChartFigure, buildChartFigures } from "@/lib/chart";
import type { ConstellationState } from "@/shared/contracts-constellations";

function course(
  seriesSlug: string,
  litStars: number,
  totalStars: number,
  name = "A Course",
  curriculumLessons = totalStars,
): ConstellationState {
  return {
    courseId: `c-${seriesSlug}`,
    seriesSlug,
    name,
    gradient: "from-blue-500 to-purple-500",
    totalStars,
    curriculumLessons,
    litStars,
    complete: totalStars > 0 && litStars === totalStars,
    // Real per-lesson stars: lighting is per-lesson, not proportional.
    stars: Array.from({ length: totalStars }, (_, i) => ({
      lessonSlug: `${seriesSlug}-lesson-${i + 1}`,
      index: i + 1,
      label: `Lesson ${i + 1}`,
      lit: i < litStars,
    })),
  };
}

/*
 * Built through `buildChartFigures` rather than one at a time, because assignment
 * is a decision across the whole sky — called individually, two courses could be
 * handed the same constellation.
 */
const SKY = buildChartFigures({
  stats: {
    streakDays: 0,
    longestStreakDays: 0,
    rank: null,
    coursesCompleted: 0,
    tracksCompleted: 0,
  },
  constellations: [
    course("salesforce-architect", 29, 29, "Architect Primer"),
    course("agentic-ai", 6, 10, "Agentic AI Path"),
    course("omni-studio-cert", 0, 12, "OmniStudio Cert"),
  ],
  chronicle: [],
  isGuest: false,
});

/** The constellation a fixture course ends up drawn as. */
const figureNameOf = (seriesSlug: string) =>
  SKY.find((f) => f.seriesSlug === seriesSlug)!.figureName!;

function renderSky(over: Partial<React.ComponentProps<typeof StarChart>> = {}) {
  const onFocusChange = vi.fn();
  const onOpenCourse = vi.fn();
  const utils = render(
    <StarChart
      figures={SKY}
      focusSlug={null}
      onFocusChange={onFocusChange}
      onOpenCourse={onOpenCourse}
      {...over}
    />,
  );
  return { onFocusChange, onOpenCourse, ...utils };
}

describe("StarChart — sky variant", () => {
  it("renders one figure per course", () => {
    renderSky();
    for (const slug of ["salesforce-architect", "agentic-ai", "omni-studio-cert"]) {
      expect(screen.getByTestId(`cxc-figure-${slug}`)).toBeInTheDocument();
    }
  });

  /*
   * The regression this file exists for: `role="img"` makes the subtree
   * presentational, so the figure buttons would vanish from the accessibility
   * tree while still being tab stops.
   */
  it("does not hide its figures behind a presentational role", () => {
    renderSky();
    const svg = document.querySelector(".cxc-svg")!;
    expect(svg.getAttribute("role")).not.toBe("img");
    expect(screen.getAllByRole("button", { name: /constellation/i }).length).toBe(3);
  });

  it("labels each figure with its constellation, course and progress", () => {
    renderSky();
    const drawn = figureNameOf("agentic-ai");
    expect(
      screen.getByRole("button", {
        name: new RegExp(`${drawn} constellation — Agentic AI Path, 60% complete`),
      }),
    ).toBeInTheDocument();
  });

  it("focuses a figure on click without navigating", () => {
    const { onFocusChange, onOpenCourse } = renderSky();
    fireEvent.click(screen.getByTestId("cxc-figure-agentic-ai"));
    expect(onFocusChange).toHaveBeenCalledWith("agentic-ai");
    expect(onOpenCourse).not.toHaveBeenCalled();
  });

  it("clears focus when the focused figure is clicked again", () => {
    const { onFocusChange } = renderSky({ focusSlug: "agentic-ai" });
    fireEvent.click(screen.getByTestId("cxc-figure-agentic-ai"));
    expect(onFocusChange).toHaveBeenCalledWith(null);
  });

  it("focuses on Enter and Space, so figures are operable from the keyboard", () => {
    for (const key of ["Enter", " "]) {
      const { onFocusChange, unmount } = renderSky();
      fireEvent.keyDown(screen.getByTestId("cxc-figure-omni-studio-cert"), { key });
      expect(onFocusChange, `${key} did not focus`).toHaveBeenCalledWith("omni-studio-cert");
      unmount();
    }
  });

  it("clears focus on Escape", () => {
    const { onFocusChange } = renderSky({ focusSlug: "agentic-ai" });
    fireEvent.keyDown(screen.getByTestId("cxc-star-chart"), { key: "Escape" });
    expect(onFocusChange).toHaveBeenCalledWith(null);
  });

  it("makes every figure a tab stop", () => {
    renderSky();
    for (const slug of ["salesforce-architect", "agentic-ai", "omni-studio-cert"]) {
      expect(screen.getByTestId(`cxc-figure-${slug}`)).toHaveAttribute("tabindex", "0");
    }
  });

  it("opens the course only from the inspect CTA", () => {
    const { onOpenCourse } = renderSky({ focusSlug: "agentic-ai" });
    fireEvent.click(screen.getByRole("button", { name: /continue course/i }));
    expect(onOpenCourse).toHaveBeenCalledWith("agentic-ai");
  });

  it("offers review rather than continue once a course is finished", () => {
    renderSky({ focusSlug: "salesforce-architect" });
    expect(screen.getByRole("button", { name: /review course/i })).toBeInTheDocument();
  });

  it("withholds the CTA from guests", () => {
    renderSky({ focusSlug: "agentic-ai", isGuest: true });
    expect(screen.queryByRole("button", { name: /continue course/i })).not.toBeInTheDocument();
    // The panel itself still describes the course.
    expect(screen.getByTestId("cxc-inspect")).toHaveTextContent("Agentic AI Path");
  });

  it("shows no inspect panel until something is focused", () => {
    renderSky();
    expect(screen.queryByTestId("cxc-inspect")).not.toBeInTheDocument();
  });

  /*
   * Completion must not be carried by colour alone. The closed ring is SVG and
   * invisible to a text assertion, so the label is what is checked here.
   */
  it("states completion in text, not only in gold", () => {
    renderSky({ focusSlug: "salesforce-architect" });
    const svg = document.querySelector(".cxc-svg")!;
    expect(svg.textContent).toContain("Course complete");
    expect(svg.textContent).toContain("60% learned");
  });

  it("marks the decorative backdrop layers as hidden", () => {
    renderSky();
    expect(document.querySelector(".cxc-par-far")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".cxc-par-mid")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".cxc-vignette")).toHaveAttribute("aria-hidden", "true");
  });

  /*
   * `url(#id)` resolves document-wide, so two charts sharing filter ids would
   * mean the second one silently restyles the first.
   */
  it("scopes its SVG ids per instance", () => {
    render(
      <>
        <StarChart figures={SKY} focusSlug={null} onFocusChange={() => {}} />
        <StarChart figures={SKY} focusSlug={null} onFocusChange={() => {}} />
      </>,
    );
    const ids = [...document.querySelectorAll("filter[id], mask[id], radialGradient[id]")].map(
      (n) => n.id,
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("StarChart — single variant", () => {
  const single = [buildChartFigure(course("agentic-ai", 6, 10, "Agentic AI Path"))];
  const singleFigureName = single[0]!.figureName!;

  function renderSingle() {
    return render(
      <StarChart
        figures={single}
        variant="single"
        focusSlug={null}
        onFocusChange={() => {}}
      />,
    );
  }

  /*
   * The page already *is* the course, so there is nothing to select. A
   * `role="button"` that does nothing is worse than no control.
   */
  it("exposes no controls, since there is nothing to select", () => {
    renderSingle();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByTestId("cxc-figure-agentic-ai")).not.toHaveAttribute("tabindex");
  });

  it("draws the fine lesson path between the main stars", () => {
    renderSingle();
    const figure = document.querySelector('[data-testid="cxc-figure-agentic-ai"]')!;
    // A 10-lesson course over a ≥17★ figure (single assign) → sparse segments,
    // so it renders individual path nodes, not dense rails.
    const nodes = Array.from(figure.querySelectorAll(".cxc-path-node"));
    expect(nodes.length).toBeGreaterThan(0);
    // Every one of the 10 lessons should sit on the path as a node.
    expect(nodes.length).toBeGreaterThanOrEqual(8);
  });

  it("describes the course and its progress on the image itself", () => {
    renderSingle();
    expect(
      screen.getByRole("img", {
        name: new RegExp(
          `Agentic AI Path drawn as ${singleFigureName} — 6 of 10 lessons done, 60% complete`,
        ),
      }),
    ).toBeInTheDocument();
  });

  it("drops the legend and the inspect panel", () => {
    renderSingle();
    expect(document.querySelector(".cxc-legend")).toBeNull();
    expect(screen.queryByTestId("cxc-inspect")).not.toBeInTheDocument();
  });

  it("shows a coming-soon caption when the curriculum outruns published lessons", () => {
    // curriculum 30, published 10 → 20 lessons still owed.
    const gap = [
      buildChartFigure(course("agentic-ai", 6, 10, "Agentic AI Path", 30)),
    ];
    render(
      <StarChart
        figures={gap}
        variant="single"
        focusSlug={null}
        onFocusChange={() => {}}
      />,
    );
    const caption = screen.getByTestId("chart-coming-soon");
    expect(caption).toBeInTheDocument();
    expect(caption.textContent).toContain("20 more lessons");
  });

  it("hides the coming-soon caption when the course is fully published", () => {
    renderSingle(); // curriculum == totalStars
    expect(screen.queryByTestId("chart-coming-soon")).not.toBeInTheDocument();
  });
});

describe("StarChart — degraded data", () => {
  it("renders a course with no assigned figure as label and progress only", () => {
    const orphan = [
      buildChartFigure(course("unlucky", 2, 8, "Unmapped Course"), { figure: null }),
    ];
    render(<StarChart figures={orphan} focusSlug={null} onFocusChange={() => {}} />);
    const svg = document.querySelector(".cxc-svg")!;
    expect(svg.textContent).toContain("Unmapped Course");
    expect(svg.textContent).toContain("25% learned");
    // No artwork, and critically no <image> with a missing src.
    expect(document.querySelectorAll("image")).toHaveLength(0);
  });

  it("renders nothing rather than throwing on an empty sky", () => {
    render(<StarChart figures={[]} focusSlug={null} onFocusChange={() => {}} />);
    expect(screen.getByTestId("cxc-star-chart")).toBeInTheDocument();
  });
});
