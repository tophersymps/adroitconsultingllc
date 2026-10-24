import Link from "next/link";
import type { BlogPost } from "@/data/types";
import { learnSeries } from "@/data/learn";
import { isPubliclyLaunchedSeries } from "@/lib/atlas-launch";
import { toLearnCardSeries } from "@/lib/learn";
import {
  getRelatedPosts,
  resolveRecommendedSeries,
} from "@/lib/funnel";
import PathCard from "@/components/Learn/PathCard";
import PostCard from "@/components/BlogListing/PostCard";

interface KeepLearningProps {
  post: BlogPost;
  allPosts: BlogPost[];
}

/**
 * B-20 — Post → Learn funnel block rendered at the bottom of a blog post.
 *
 * Two parts:
 *  1. The context-aware "Keep learning" pitch: the category's recommended
 *     Learn series (reusing the hub series-card / PathCard) with a one-line
 *     "why this fits" reason.
 *  2. A lightweight related-posts row (same category, 3 cards).
 *
 * Server component: resolves the recommendation from the static learn dataset
 * and renders the same card component the /atlas hub uses (no divergence).
 *
 * DISCLOSURE BOUNDARY (security t_0071d4a0, CWE-200): the collection is
 * filtered to the static launch mirror BEFORE it reaches the resolver, so a
 * stealth series is never selected in the first place. Filtering the input
 * (not merely skipping the render) is what keeps the series record out of the
 * RSC flight payload: `PathCard` receives the series as a prop, so anything
 * the resolver returns is serialised into the prerendered HTML. Doctrine
 * (t_0194c233 / t_2cc94bb7): a series may be named publicly iff
 * `isPubliclyLaunchedSeries(slug)` — do not add an unfiltered fallback.
 */
export default function KeepLearning({ post, allPosts }: KeepLearningProps) {
  const launchedSeries = learnSeries.filter((s) => isPubliclyLaunchedSeries(s.slug));
  const rec = resolveRecommendedSeries(post, launchedSeries);
  const related = getRelatedPosts(post, allPosts);

  return (
    <section aria-label="Keep learning" className="max-w-[720px] mx-auto px-6 pb-8">
      {rec && (
        <div className="border-t border-gray-100 dark:border-[var(--border-subtle)] pt-8">
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] mb-3"
            style={{ color: "var(--accent, #C8102E)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
            Keep learning
          </div>
          <p className="text-[14px] text-gray-500 dark:text-[var(--ink-muted)] leading-relaxed mb-5 max-w-[560px]">
            {rec.reason}
          </p>
          {/* Reuse the hub series-card component */}
          <PathCard
            series={toLearnCardSeries(rec.series)}
            gate="signed-in"
            loginNext={`/atlas/${rec.series.slug}`}
          />
          <Link
            href={`/atlas/${rec.series.slug}`}
            className="inline-flex items-center gap-1.5 mt-3 text-[12.5px] font-semibold no-underline hover:underline"
            style={{ color: "var(--accent, #C8102E)" }}
          >
            Go to {rec.series.name} <span aria-hidden>&rarr;</span>
          </Link>
        </div>
      )}

      {related.length > 0 && (
        <div className="border-t border-gray-100 dark:border-[var(--border-subtle)] pt-8 mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-gray-900 dark:text-[var(--ink-primary)] tracking-tight">
              More in {post.category}
            </h2>
            <Link
              href="/field-notes"
              className="text-[12px] font-semibold no-underline hover:underline"
              style={{ color: "var(--accent, #C8102E)" }}
            >
              View all posts <span aria-hidden>&rarr;</span>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {related.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
