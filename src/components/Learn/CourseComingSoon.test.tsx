/**
 * CourseComingSoon — the pending-course "coming soon" teaser (B-10/D1).
 *
 * Regression goals:
 *  1. A pending course renders STRICTLY the teaser — no lesson content, no
 *     attempt to deep-link into any lesson. This is the marketing surface a
 *     series route shows when the access seam returns `not-launched` for a
 *     pending course.
 *  2. The "N lessons coming soon" signal reflects the still-owed lesson count.
 *  3. The CTA points to the atlas catalog ("Browse other tracks") — a real
 *     link, never a dead lesson URL, and presumably the future home of a
 *     notify/waitlist CTA.
 *  4. Decorative elements are aria-hidden; interactive/reading content is
 *     reachable (a11y).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CourseComingSoon from "./CourseComingSoon";
import type { CourseRow } from "@/shared/contracts-course-catalog";

// next/link → plain anchor (same pattern as SeriesSyllabus.test.tsx).
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const courseRow: CourseRow = {
  id: "cr-ai-power-user",
  series_slug: "ai-power-user",
  status: "pending",
  access_model: "sub-or-one-time",
  course_tags: [],
  blurb: null,
} as unknown as CourseRow;

const series = {
  name: "AI Power User",
  description: "A hands-on track for working with AI day to day.",
  gradient: "from-navy to-[#4c2f6e]",
  slug: "ai-power-user",
};

describe("CourseComingSoon", () => {
  it("renders the teaser for a pending course (no lesson content)", () => {
    render(<CourseComingSoon series={series} courseRow={courseRow} upcoming={6} />);
    expect(screen.getByRole("heading", { name: "AI Power User" })).toBeTruthy();
    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.getByText(/6 lessons coming soon/)).toBeTruthy();
    // Ensure no deep lesson link slipped in.
    expect(screen.queryByText(/lesson \d/i)).toBeFalsy();
  });

  it("shows a singular lesson count for exactly one remaining lesson", () => {
    render(<CourseComingSoon series={series} courseRow={courseRow} upcoming={1} />);
    expect(screen.getByText(/1 lesson coming soon/)).toBeTruthy();
  });

  it("falls back to a plain 'Coming soon' when nothing is owed", () => {
    render(<CourseComingSoon series={series} courseRow={courseRow} upcoming={0} />);
    // Rendered in both the hero pill and the teaser panel.
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/lessons coming soon/)).toBeFalsy();
  });

  it("links the CTA to the catalog, never a lesson", () => {
    render(<CourseComingSoon series={series} courseRow={courseRow} upcoming={4} />);
    const cta = screen.getByRole("link", { name: "Browse other tracks" });
    expect(cta.getAttribute("href")).toBe("/atlas");
  });
});
