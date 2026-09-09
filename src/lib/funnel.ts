/**
 * B-20 — Post → Learn funnel (discovery/consolidated-backlog.md).
 *
 * The context-aware "Keep learning" pitch: a blog post's category maps to a
 * recommended Learn series + a one-line "why this fits" reason, rendered as a
 * hub series-card (PathCard) at the bottom of the post. Plus a lightweight
 * related-posts row (same category, 3 cards).
 *
 * The map is the "ad-card pitch" wiring point: when a new course lands, add or
 * repoint an entry here (or a future admin panel writes it) — no component
 * change needed.
 */

import type { BlogPost, LearningSeries } from "@/data/types";

export interface FunnelRecommendation {
  /** Recommended Learn series slug (route /learn/<slug>). */
  seriesSlug: string;
  /** One-line "why this fits" for the reader. */
  reason: string;
}

/**
 * Blog category → recommended Learn series + reason. Keyed by the blog post's
 * `category` display string (the same value the <Tag> pill shows). Only
 * categories with a genuinely matching course are listed — a post whose
 * category has no entry renders no pitch card (no forced mismatch).
 */
export const CATEGORY_FUNNEL: Record<string, FunnelRecommendation> = {
  Salesforce: {
    seriesSlug: "salesforce-architect",
    reason:
      "Flow, Apex, and platform architecture — go from this post to hands-on lessons that scale your Salesforce practice.",
  },
  "AI & Consulting": {
    seriesSlug: "agentic-ai",
    reason:
      "The agent patterns behind this article, taught as a hands-on curriculum from prototype to multi-agent orchestration.",
  },
  "React & Web Dev": {
    seriesSlug: "agentic-ai",
    reason:
      "Build the agentic systems the modern web stack is converging on — a practitioner's path from single-agent to multi-agent.",
  },
  "Project Management": {
    seriesSlug: "hermes-consultant",
    reason:
      "Turn the delivery discipline this post describes into a repeatable engagement — the agent-consultant track.",
  },
  "UI/UX": {
    seriesSlug: "ai-at-work",
    reason:
      "Adopt AI in the day-to-day work behind great interface design — a vendor-agnostic primer for any team.",
  },
};

/**
 * Look up the recommended series for a blog category. Returns undefined when
 * the category has no mapped course (caller renders no funnel block).
 */
export function getFunnelRecommendation(
  category: string,
): FunnelRecommendation | undefined {
  return CATEGORY_FUNNEL[category];
}

/**
 * Related posts: same category as `post`, excluding the post itself, newest
 * first (source order is already newest-first), capped at `limit` (3).
 */
export function getRelatedPosts(
  post: BlogPost,
  allPosts: BlogPost[],
  limit = 3,
): BlogPost[] {
  return allPosts.filter(
    (p) => p.category === post.category && p.slug !== post.slug,
  ).slice(0, limit);
}

/**
 * Resolve the recommended series object for a blog post (server-side only —
 * imports the full LearningSeries dataset). Returns undefined when the
 * category has no mapped course OR the series slug doesn't exist.
 */
export function resolveRecommendedSeries(
  post: BlogPost,
  seriesList: LearningSeries[],
): { series: LearningSeries; reason: string } | undefined {
  const rec = getFunnelRecommendation(post.category);
  if (!rec) return undefined;
  const series = seriesList.find((s) => s.slug === rec.seriesSlug);
  if (!series) return undefined;
  return { series, reason: rec.reason };
}
