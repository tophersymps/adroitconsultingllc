import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Paywall, { DEGRADED_PAYWALL_MESSAGE } from "@/components/Catalog/Paywall";
import type { PaywallView } from "@/shared/contracts-course-catalog";

function view(peek: string | null): PaywallView {
  return {
    courseName: "Test Course",
    gradient: "",
    peekLessonSlug: peek,
    options: [{ model: "subscription", label: "Subscribe for access", actionable: true }],
  };
}

describe("Paywall preview link (ADR-221)", () => {
  it("links to the dedicated preview route with reworded text", () => {
    render(<Paywall view={view("lesson-1")} seriesSlug="test-series" />);
    const link = screen.getByRole("link", { name: /preview first lesson/i });
    expect(link).toHaveAttribute("href", "/atlas/test-series/preview");
    expect(link.textContent).not.toContain("Preview this course");
  });

  it("renders no preview link when there is no peek lesson (null guard)", () => {
    render(<Paywall view={view(null)} seriesSlug="test-series" />);
    expect(screen.queryByRole("link", { name: /preview/i })).toBeNull();
  });
});

describe("Paywall degraded status region (A11Y-M1, t_8d1638a7)", () => {
  it("announces a polite live status region with the degraded copy", () => {
    render(<Paywall view={view("lesson-1")} seriesSlug="test-series" degraded />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.textContent).toBe(DEGRADED_PAYWALL_MESSAGE);
    // Text, not colour, distinguishes the degraded state (WCAG 1.4.1).
    expect(status.textContent).toMatch(/temporarily unavailable/i);
    // The ordinary paywall UI is still there — announced IN ADDITION.
    expect(screen.getByText(/this course is locked for you right now/i)).toBeTruthy();
    expect(screen.getByText("Members-only content")).toBeTruthy();
  });

  it("renders no status region on an ordinary locked paywall", () => {
    render(<Paywall view={view("lesson-1")} seriesSlug="test-series" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/temporarily unavailable/i)).toBeNull();
  });

  // A11Y-C1 (t_01ffc1ea). The status block is white-on-panel by design:
  // text-white over bg-white/[0.08] works on .paywall-panel (#132D54,
  // measured 13.5:1 in Chromium) but is invisible on the page background
  // (#F7F8FA, measured 1.05:1) — and light is the default theme. Pinning it
  // to the panel is the thing that keeps it legible; a DOM/CSS move outside
  // the panel regresses WCAG 1.4.3 without touching role/aria-live/text,
  // which is why the earlier assertions all passed while it was unreadable.
  it("paints the degraded message inside the navy paywall panel (AA contrast)", () => {
    render(<Paywall view={view("lesson-1")} seriesSlug="test-series" degraded />);

    const status = screen.getByRole("status");
    expect(status.closest(".paywall-panel")).not.toBeNull();
    // The panel is what provides the contrast — bail loudly if that pairing
    // ever changes without a matching colour fix.
    expect(status.className).toContain("text-white");
  });

  it("keeps the ordinary (non-degraded) paywall DOM unchanged", () => {
    const { container: degraded } = render(
      <Paywall view={view("lesson-1")} seriesSlug="test-series" />
    );
    // No status block, and the panel's first painted child is still the
    // members-only lock row (nothing inserted for the non-degraded case).
    expect(degraded.querySelector('[role="status"]')).toBeNull();
    const panel = degraded.querySelector(".paywall-panel");
    expect(panel).not.toBeNull();
    const inner = panel!.querySelector(".relative");
    expect(inner!.firstElementChild!.textContent).toContain("Members-only content");
  });
});
