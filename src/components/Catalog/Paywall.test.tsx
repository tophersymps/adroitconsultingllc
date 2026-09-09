import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Paywall from "@/components/Catalog/Paywall";
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
    expect(link).toHaveAttribute("href", "/learn/test-series/preview");
    expect(link.textContent).not.toContain("Preview this course");
  });

  it("renders no preview link when there is no peek lesson (null guard)", () => {
    render(<Paywall view={view(null)} seriesSlug="test-series" />);
    expect(screen.queryByRole("link", { name: /preview/i })).toBeNull();
  });
});
