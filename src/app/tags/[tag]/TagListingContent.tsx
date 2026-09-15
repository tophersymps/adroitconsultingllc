"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PostCard from "@/components/BlogListing/PostCard";
import FeaturedPost from "@/components/BlogListing/FeaturedPost";
import SortToggle from "@/components/BlogListing/SortToggle";
import { sortPosts, type SortOrder } from "@/lib/sort";
import type { TagInfo } from "@/lib/tags";
import { getTagDefinition } from "@/lib/tag-vocab";

function TagPageContent({ tagInfo }: { tagInfo: TagInfo }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sortOrder = searchParams.get("sort") === "oldest" ? "oldest" : "newest";

  function handleSortChange(order: SortOrder) {
    const params = new URLSearchParams(searchParams.toString());
    if (order === "newest") {
      params.delete("sort");
    } else {
      params.set("sort", order);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const sorted = sortPosts(tagInfo.posts, sortOrder);
  const featured = sorted.find((p) => p.featured);
  const nonFeatured = sorted.filter((p) => !p.featured);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main id="main" className="flex-1">
        <div className="max-w-[1120px] mx-auto px-6 pt-14 pb-0">
          <Link
            href="/tags"
            className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-6 hover:text-navy transition-colors duration-150"
          >
            &larr; All Tags
          </Link>
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-red uppercase tracking-[0.08em] mb-[14px]">
            <span className="w-1.5 h-1.5 rounded-full bg-red" />
            Topic
          </div>
          <h1 className="text-[clamp(2rem,4.5vw,2.75rem)] font-extrabold text-navy tracking-[-0.03em] leading-[1.05] mb-3 bg-gradient-to-r from-navy to-navy-light dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            {tagInfo.tag}
          </h1>
          {getTagDefinition(tagInfo.tag) && (
            <p className="text-[0.95rem] text-gray-500 dark:text-[var(--ink-muted)] max-w-[560px] leading-relaxed mb-3">
              {getTagDefinition(tagInfo.tag)?.definition}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[1.0625rem] text-gray-500 max-w-[560px] leading-relaxed">
              {tagInfo.count} {tagInfo.count === 1 ? "post" : "posts"} tagged
              with this topic.
            </p>
            <SortToggle compact sort={sortOrder} onChange={handleSortChange} />
          </div>
        </div>

        {featured && (
          <div className="mt-8">
            <FeaturedPost post={featured} />
          </div>
        )}

        {nonFeatured.length > 0 && (
          <div className="max-w-[1120px] mx-auto px-6 py-8 pb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {nonFeatured.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function TagListingContent({ tagInfo }: { tagInfo: TagInfo }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col">
          <Header />
          <main id="main" className="flex-1 flex items-center justify-center">
            <div className="text-gray-500 text-sm">Loading posts...</div>
          </main>
          <Footer />
        </div>
      }
    >
      <TagPageContent tagInfo={tagInfo} />
    </Suspense>
  );
}
