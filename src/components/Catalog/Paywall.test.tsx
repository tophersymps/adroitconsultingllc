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
});
