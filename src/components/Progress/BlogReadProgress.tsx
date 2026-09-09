/**
 * BlogReadProgress — reading progress bar for the blog listing (client).
 *
 * Counts how many of the given post slugs the user has marked read
 * (localStorage + Supabase summary merge), rendering the "N of M posts read"
 * bar from mockup-progress-blog.html.
 */
"use client";

import { useMemo } from "react";
import { useProgressSummary } from "@/lib/hooks/useProgressSummary";
import ProgressIndicator from "@/components/Progress/ProgressIndicator";

interface BlogReadProgressProps {
  /** Bare post slugs (no `blog/` prefix). */
  postSlugs: string[];
}

export default function BlogReadProgress({ postSlugs }: BlogReadProgressProps) {
  // Canonical read keys: MarkAsRead stores `blog/<slug>` (localStorage read
  // prefix + DB content_slug), so the summary merge uses the same form.
  const readKeys = useMemo(
    () => postSlugs.map((slug) => `blog/${slug}`),
    [postSlugs],
  );

  const { merge, isLoading } = useProgressSummary(readKeys, []);

  const readCount = useMemo(
    () => postSlugs.filter((slug) => merge.read.has(`blog/${slug}`)).length,
    [postSlugs, merge.read],
  );

  if (postSlugs.length === 0) return null;

  if (isLoading && readCount === 0) {
    return (
      <div className="max-w-[1120px] mx-auto px-6 pt-5 mb-6">
        <div className="h-1.5 rounded-full bg-gray-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-[1120px] mx-auto px-6 pt-5 mb-6">
      <ProgressIndicator
        current={readCount}
        total={postSlugs.length}
        label={`${readCount} of ${postSlugs.length} posts read`}
        showPercent
      />
    </div>
  );
}
