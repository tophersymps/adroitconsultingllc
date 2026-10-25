import { describe, it, expect } from "vitest";
import type { BlogPost, LearningSeries } from "@/data/types";
import {
  getFunnelRecommendation,
  CATEGORY_FUNNEL,
  getRelatedPosts,
  resolveRecommendedSeries,
} from "@/lib/funnel";
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";

const post = (over: Partial<BlogPost> = {}): BlogPost => ({
  slug: "a-post",
  title: "A post",
  excerpt: "",
  category: "Salesforce",
  categoryColor: "sf",
  categoryGradient: "",
  date: "2026-09-01",
  author: "Adroit Consulting",
  authorInitials: "AC",
  readTime: "5 min read",
  featured: false,
  tags: [],
  ...over,
});

const series = (over: Partial<LearningSeries> = {}): LearningSeries => ({
  slug: "salesforce-architect",
  name: "Salesforce System Architect Primer",
  description: "desc",
  examKind: "course-completion",
  gradient: "from-sky to-blue-600",
  lessons: [],
  totalLessons: 28,
  curriculumLessons: 28,
  ...over,
});

describe("funnel — CATEGORY_FUNNEL", () => {
  it("maps each known category to a series + reason", () => {
    for (const rec of Object.values(CATEGORY_FUNNEL)) {
      expect(rec.seriesSlug).toBeTruthy();
      expect(rec.reason.length).toBeGreaterThan(10);
    }
  });

  it("getFunnelRecommendation returns a recommendation for a mapped category", () => {
    expect(getFunnelRecommendation("Salesforce")?.seriesSlug).toBe(
      "salesforce-architect",
    );
  });

  it("returns undefined for an unmapped category", () => {
    expect(getFunnelRecommendation("Unmapped Category")).toBeUndefined();
  });

  // t_b4c0da5f, CWE-200: "Project Management" used to map to
  // `hermes-consultant`, which is NOT in the launch mirror — 21 public posts
  // named an unpublished series and linked to a 404 route.
  it("has no Project Management entry (its old target was a stealth series)", () => {
    expect(getFunnelRecommendation("Project Management")).toBeUndefined();
  });

  it("only ever maps categories to publicly launched series", () => {
    for (const rec of Object.values(CATEGORY_FUNNEL)) {
      expect(isPubliclyLaunchedSeries(rec.seriesSlug)).toBe(true);
    }
  });
});

describe("funnel — resolveRecommendedSeries disclosure gate", () => {
  const stealthSeries = series({
    slug: "hermes-consultant",
    name: "Hermes Consultant Track",
    description: "Unpublished stealth syllabus.",
  });

  it("renders no pitch card for Project Management posts (its mapping was removed)", () => {
    const pmPost = post({ category: "Project Management" });
    expect(resolveRecommendedSeries(pmPost, [stealthSeries])).toBeUndefined();
  });

  it("returns undefined for a mapped series that is not publicly launched", () => {
    // Simulate a stale/injected mapping (an admin panel could write one).
    CATEGORY_FUNNEL["Injected Category"] = {
      seriesSlug: "hermes-consultant",
      reason: "This would name an unpublished series.",
    };
    try {
      const injected = post({ category: "Injected Category" });
      expect(resolveRecommendedSeries(injected, [stealthSeries])).toBeUndefined();
    } finally {
      delete CATEGORY_FUNNEL["Injected Category"];
    }
  });

  it("still resolves a launched series", () => {
    const sfPost = post({ category: "Salesforce" });
    const live = series({ slug: "salesforce-architect" });
    const rec = resolveRecommendedSeries(sfPost, [live]);
    expect(rec?.series.slug).toBe("salesforce-architect");
  });
});

describe("funnel — getRelatedPosts", () => {
  const sameCat = post({ slug: "b", category: "Salesforce" });
  const diffCat = post({ slug: "c", category: "AI & Consulting" });
  const self = post({ slug: "a-post", category: "Salesforce" });

  it("returns same-category posts, excluding the post itself", () => {
    const related = getRelatedPosts(self, [self, sameCat, diffCat]);
    expect(related.map((p) => p.slug)).toEqual(["b"]);
  });

  it("caps results at the limit (default 3)", () => {
    const many = [
      post({ slug: "1", category: "Salesforce" }),
      post({ slug: "2", category: "Salesforce" }),
      post({ slug: "3", category: "Salesforce" }),
      post({ slug: "4", category: "Salesforce" }),
    ];
    expect(getRelatedPosts(self, [...many, self])).toHaveLength(3);
  });

  it("returns empty array when no related posts exist", () => {
    expect(getRelatedPosts(self, [self])).toEqual([]);
  });
});

describe("funnel — resolveRecommendedSeries", () => {
  it("resolves the mapped series from a series list", () => {
    const res = resolveRecommendedSeries(
      post({ category: "Salesforce" }),
      [series()],
    );
    expect(res?.series.slug).toBe("salesforce-architect");
    expect(res?.reason).toBeTruthy();
  });

  it("returns undefined when the series slug is missing", () => {
    const res = resolveRecommendedSeries(post({ category: "Salesforce" }), [
      series({ slug: "some-other-series" }),
    ]);
    expect(res).toBeUndefined();
  });

  it("returns undefined for an unmapped category", () => {
    const res = resolveRecommendedSeries(post({ category: "Nope" }), [series()]);
    expect(res).toBeUndefined();
  });
});
