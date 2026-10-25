/**
 * src/components/BlogPost/KeepLearning.test.tsx — the post → Learn funnel gate
 * (S1, ADR-217).
 *
 * The funnel used to pass the whole static `learnSeries` dataset into
 * `resolveRecommendedSeries`, so all 21 Project Management posts prerendered a
 * card for the stealth `hermes-consultant` series (and serialized its 14-field
 * projection — including the unreleased 30-lesson curriculum size — into the
 * RSC payload). The component now takes the series list from the
 * guest-visibility seam; this test locks both directions: the stealth mapping
 * disappears, and a genuinely public mapping still renders.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BlogPost, LearningSeries } from "@/data/types";

const { visibleSeriesMock } = vi.hoisted(() => ({
  visibleSeriesMock: vi.fn(),
}));

vi.mock("@/lib/learn-visibility", () => ({
  getGuestVisibleSeries: () => visibleSeriesMock(),
}));

vi.mock("@/components/Progress/SeriesProgress", () => ({
  default: () => <div data-testid="series-progress" />,
}));
vi.mock("@/components/Progress/QuizStats", () => ({
  default: () => <div data-testid="quiz-stats" />,
}));

import KeepLearning from "./KeepLearning";

function post(slug: string, category: string): BlogPost {
  return {
    slug,
    title: `Post ${slug}`,
    excerpt: `Excerpt ${slug}`,
    category,
    categoryColor: "pm",
    categoryGradient: "",
    date: "2026-10-01",
    author: "Adroit Consulting",
    authorInitials: "AC",
    readTime: "5 min read",
    featured: false,
    tags: [category],
  };
}

function series(slug: string, name: string): LearningSeries {
  return {
    slug,
    name,
    description: `${name} description`,
    examKind: "course-completion",
    gradient: "from-navy to-navy-light",
    lessons: [],
    totalLessons: 12,
    curriculumLessons: 12,
  };
}

const salesforceSeries = series("salesforce-architect", "Salesforce Architect");
const stealthSeries = series("hermes-consultant", "Hermes Agent Consultant");

function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("a")).map(
    (a) => a.getAttribute("href") ?? "",
  );
}

describe("KeepLearning — funnel gate (S1)", () => {
  it("renders no funnel block when the mapped series is not guest-visible", async () => {
    visibleSeriesMock.mockResolvedValue([salesforceSeries]);

    const pmPost = post("pm-post", "Project Management");
    const { container } = render(
      await KeepLearning({ post: pmPost, allPosts: [pmPost] }),
    );

    expect(screen.queryByText(/keep learning/i)).toBeNull();
    expect(hrefs(container).some((h) => h.includes("/atlas/hermes-consultant"))).toBe(
      false,
    );
    expect(container.innerHTML).not.toContain("hermes-consultant");
    expect(container.innerHTML).not.toContain("Hermes Agent Consultant");
  });

  it("still renders the mapped card when the series IS guest-visible", async () => {
    visibleSeriesMock.mockResolvedValue([salesforceSeries, stealthSeries]);

    const sfPost = post("sf-post", "Salesforce");
    const { container } = render(
      await KeepLearning({ post: sfPost, allPosts: [sfPost] }),
    );

    expect(screen.getByText(/keep learning/i)).toBeTruthy();
    expect(hrefs(container)).toContain("/atlas/salesforce-architect");
    expect(
      screen.getByRole("heading", { name: /Salesforce Architect/ }),
    ).toBeTruthy();
  });

  it("keeps the related-posts row when the funnel is empty", async () => {
    visibleSeriesMock.mockResolvedValue([salesforceSeries]);

    const pmPost = post("pm-post", "Project Management");
    const other = post("pm-post-2", "Project Management");
    render(await KeepLearning({ post: pmPost, allPosts: [pmPost, other] }));

    expect(screen.getByText(/more in project management/i)).toBeTruthy();
    expect(screen.getByText(/Post pm-post-2/)).toBeTruthy();
  });

  it("never reads the raw learn dataset (seam is the only source)", async () => {
    // If this component imported `@/data/learn`, the stealth series would come
    // back regardless of what the seam returned above — asserted structurally by
    // `src/lib/client-data-imports.test.ts` and behaviourally here.
    visibleSeriesMock.mockResolvedValue([]);
    const pmPost = post("pm-post", "Project Management");
    const { container } = render(
      await KeepLearning({ post: pmPost, allPosts: [pmPost] }),
    );
    expect(screen.queryByText(/keep learning/i)).toBeNull();
    expect(hrefs(container).some((h) => h.includes("/atlas/"))).toBe(false);
  });
});
