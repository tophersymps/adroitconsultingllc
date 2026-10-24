/**
 * KeepLearning — stealth-series disclosure regression (security t_0071d4a0,
 * CWE-200 / OWASP A01).
 *
 * The funnel block renders on every public blog post and hands the series
 * record to `PathCard` as a prop, so anything the resolver returns is
 * serialised into the prerendered HTML / RSC flight payload. Before this fix
 * `KeepLearning` passed the FULL `@/data/learn` dataset to
 * `resolveRecommendedSeries`, so all 21 `Project Management` posts shipped the
 * stealth-granted `hermes-consultant` name, description and `/atlas/...` link.
 *
 * These tests assert on the REAL dataset and the REAL component:
 *   1. every stealth slug is gone from the markup of all 21 previously
 *      affected posts;
 *   2. the props handed to `PathCard` (the serialisation surface) only ever
 *      carry a publicly launched series, for every post in the blog;
 *   3. the launched funnel still renders for a non-stealth category
 *      (positive control — no layout/ordering regression);
 *   4. the filter is load-bearing: the same resolver over the unfiltered
 *      dataset still selects the stealth series, so removing the filter in
 *      `KeepLearning` re-breaks test 1 rather than silently passing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { posts } from "@/data/posts";
import { learnSeries } from "@/data/learn";
import { PUBLICLY_LAUNCHED_SERIES, isPubliclyLaunchedSeries } from "@/lib/atlas-launch";
import { resolveRecommendedSeries } from "@/lib/funnel";
import type { LearnCardSeries } from "@/data/types";

/** Every stealth identifier the original audit (t_b85134f7) grepped for. */
const STEALTH_SLUGS = [
  "hermes-consultant",
  "hermes-consultant-intermediate",
  "hermes-consultant-advanced",
  "ai-power-user",
  "ai-adoption",
  "salesforce-sharing-visibility-architect",
  "salesforce-data-architect",
  "sf-omni-consultant",
] as const;

const STEALTH_FIXTURES = [
  "hermes-consultant",
  "Hermes Agent Consultant",
  "A path to becoming an agent-implementation consultant",
  "Turn the delivery discipline this post describes into a repeatable engagement",
  "AI Power User",
  "AI Adoption",
] as const;

/** Captured props of every PathCard render — the serialisation surface. */
const pathCardProps: { series: LearnCardSeries }[] = [];

vi.mock("@/components/Learn/PathCard", () => ({
  default: (props: { series: LearnCardSeries }) => {
    pathCardProps.push(props);
    return <div data-testid="path-card">{props.series.slug}</div>;
  },
}));

vi.mock("@/components/BlogListing/PostCard", () => ({
  default: ({ post }: { post: { slug: string } }) => (
    <div data-testid="post-card">{post.slug}</div>
  ),
}));

import KeepLearning from "./KeepLearning";

const render = (postSlug: string) => {
  const post = posts.find((p) => p.slug === postSlug);
  if (!post) throw new Error(`fixture post missing: ${postSlug}`);
  return renderToStaticMarkup(<KeepLearning post={post} allPosts={posts} />);
};

const stealthPosts = posts.filter((p) => p.category === "Project Management");

beforeEach(() => {
  pathCardProps.length = 0;
});

describe("KeepLearning — stealth series never reaches the markup or props", () => {
  it("covers the 21 previously affected Project Management posts", () => {
    // Guards the fixture set itself: if the category empties out, the
    // disclosure assertions below would pass vacuously.
    expect(stealthPosts).toHaveLength(21);
  });

  it("renders no stealth identifier for any Project Management post", () => {
    for (const post of stealthPosts) {
      const html = render(post.slug);
      for (const fixture of STEALTH_FIXTURES) {
        expect(html, `${post.slug} leaked "${fixture}"`).not.toContain(fixture);
      }
      for (const slug of STEALTH_SLUGS) {
        expect(html, `${post.slug} leaked /atlas/${slug}`).not.toContain(
          `/atlas/${slug}`,
        );
      }
    }
  });

  it("passes only publicly launched series to PathCard, for every post", () => {
    for (const post of posts) {
      render(post.slug);
    }
    // The funnel still fires for the categories that map to a launched series,
    // otherwise this assertion would be vacuous.
    expect(pathCardProps.length).toBeGreaterThan(0);
    for (const props of pathCardProps) {
      expect(
        isPubliclyLaunchedSeries(props.series.slug),
        `PathCard received non-launched series "${props.series.slug}"`,
      ).toBe(true);
      expect(STEALTH_SLUGS).not.toContain(props.series.slug);
    }
  });
});

describe("KeepLearning — launched funnel is unchanged (positive control)", () => {
  it("still recommends the launched Salesforce series on a Salesforce post", () => {
    const post = posts.find((p) => p.category === "Salesforce");
    expect(post).toBeDefined();
    const html = render(post!.slug);

    expect(html).toContain("Keep learning");
    expect(html).toContain("/atlas/salesforce-architect");
    expect(pathCardProps).toHaveLength(1);
    expect(pathCardProps[0].series.slug).toBe("salesforce-architect");
    // The full series record still renders: name + real curriculum size.
    const series = learnSeries.find((s) => s.slug === "salesforce-architect")!;
    expect(html).toContain(series.name);
    expect(pathCardProps[0].series.lessonCount).toBe(
      series.lessons.filter((l) => Boolean(l.slug)).length,
    );
  });
});

describe("KeepLearning — the filter is load-bearing", () => {
  it("would select the stealth series from the unfiltered dataset", () => {
    // Documents the defect: the resolver itself has no visibility knowledge,
    // so filtering the collection at the call site is what removes the leak.
    // If `KeepLearning` ever reverts to passing `learnSeries`, the tests above
    // fail — this one proves they are not passing for an unrelated reason.
    const stealthPost = stealthPosts[0];
    const unfiltered = resolveRecommendedSeries(stealthPost, learnSeries);
    expect(unfiltered?.series.slug).toBe("hermes-consultant");

    const filtered = learnSeries.filter((s) => isPubliclyLaunchedSeries(s.slug));
    expect(resolveRecommendedSeries(stealthPost, filtered)).toBeUndefined();
    expect(filtered.map((s) => s.slug).sort()).toEqual(
      [...PUBLICLY_LAUNCHED_SERIES].sort(),
    );
  });
});
