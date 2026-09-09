"use client";

/**
 * BlogListingClient — the interactive blog listing "island".
 *
 * B-08 (ride-along): the /blog route is a server component that resolves the
 * 48 KB `posts.ts` dataset server-side only, keeping it out of the client JS
 * bundle, and passes it here as a serialized RSC prop. The page also threads
 * the URL `searchParams` into this island as a plain prop, so the island does
 * NOT call `useSearchParams()` — that call was what forced the client tree up
 * to the nearest Suspense boundary to be client-rendered during static
 * prerendering (BAILOUT_TO_CLIENT_SIDE_RENDERING), leaving only a "Loading
 * posts…" fallback in the initial HTML. With the params threaded as props, the
 * island renders fully on the server: the first page of post cards is present
 * in the initial document (fixes LCP / INP / CWV, Brainiac #3 + #9).
 *
 * This component owns the interactive state (category pills, read filter, sort
 * toggle, pagination) and writes `?category=` / `?read=` / `?sort=` back to the
 * URL via `router.replace` so filter choices stay shareable and survive refresh.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BlogPost } from "@/data/types";
import FeaturedPost from "@/components/BlogListing/FeaturedPost";
import PostCardWithRead from "@/components/BlogListing/PostCardWithRead";
import ReadFilter, { type ReadFilterValue } from "@/components/BlogListing/ReadFilter";
import SortToggle from "@/components/BlogListing/SortToggle";
import { sortPosts, type SortOrder } from "@/lib/sort";
import MarkAsRead from "@/components/Progress/MarkAsRead";
import BlogReadProgress from "@/components/Progress/BlogReadProgress";
import { useProgressSummary } from "@/lib/hooks/useProgressSummary";
import { useAuth } from "@/lib/hooks/useAuth";

const categories = [
  { key: "all", label: "All Posts" },
  { key: "sf", label: "Salesforce" },
  { key: "react", label: "React & Web Dev" },
  { key: "ai", label: "AI & Consulting" },
  { key: "mkt", label: "Marketing" },
  { key: "ux", label: "UI/UX" },
  { key: "pm", label: "Project Management" },
];

/** The server-threaded page `searchParams` shape (values may be repeated). */
type SearchParams = { [key: string]: string | string[] | undefined };

/** Read a single value for a key (first value when repeated). */
function getParam(searchParams: SearchParams, key: string): string | null {
  const v = searchParams[key];
  if (v === undefined) return null;
  return Array.isArray(v) ? v[0] : v;
}

/** Rebuild a URLSearchParams preserving every param (used when rewriting the URL). */
function toSearchParams(searchParams: SearchParams): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => usp.append(key, v));
    else usp.append(key, value);
  }
  return usp;
}

interface BlogListingClientProps {
  /** Full published post dataset, server-serialized into the RSC payload. */
  posts: BlogPost[];
  /** URL query params threaded from the server page (non-reactive by design). */
  searchParams: SearchParams;
}

function BlogListingContent({
  posts,
  searchParams,
}: BlogListingClientProps) {
  const router = useRouter();

  const categoryFromUrl = getParam(searchParams, "category") || "all";
  const normalized =
    categories.some((c) => c.key === categoryFromUrl) ? categoryFromUrl : "all";
  const [activeCategory, setActiveCategory] = useState(normalized);
  const [currentPage, setCurrentPage] = useState(1);
  // B-08: bump 4/page -> 8/page.
  const postsPerPage = 8;

  const [sortOrder, setSortOrder] = useState<SortOrder>(
    getParam(searchParams, "sort") === "oldest" ? "oldest" : "newest",
  );

  // Read filter from ?read=all|unread|read (design brief §4.2)
  const readParam = getParam(searchParams, "read");
  const [readFilter, setReadFilter] = useState<ReadFilterValue>(
    readParam === "unread" || readParam === "read" ? readParam : "all",
  );

  const filtered = posts.filter((post) => {
    if (activeCategory === "all") return true;
    return post.categoryColor === activeCategory;
  });

  // Canonical read keys for the visible category set (cheap — ≤13 posts)
  const readKeys = filtered.map((post) => `blog/${post.slug}`);

  const { merge } = useProgressSummary(readKeys, []);

  // Apply the read filter against the REAL merged read state
  const readFiltered = useMemo(() => {
    if (readFilter === "all") return filtered;
    return filtered.filter((post) => {
      const isRead = merge.read.has(`blog/${post.slug}`);
      return readFilter === "read" ? isRead : !isRead;
    });
  }, [filtered, readFilter, merge.read]);

  // Defensive sort — never trust generated array order in a view.
  const sorted = sortPosts(readFiltered, sortOrder);
  const featured = sorted.find((p) => p.featured);
  const nonFeatured = sorted.filter((p) => !p.featured);

  const totalPages = Math.max(
    1,
    Math.ceil(nonFeatured.length / postsPerPage),
  );
  const startIdx = (currentPage - 1) * postsPerPage;
  const paginatedPosts = nonFeatured.slice(startIdx, startIdx + postsPerPage);

  function handleCategoryClick(key: string) {
    setActiveCategory(key);
    setCurrentPage(1);
    const params = toSearchParams(searchParams);
    if (key === "all") {
      params.delete("category");
    } else {
      params.set("category", key);
    }
    const qs = params.toString();
    router.replace(qs ? `/blog?${qs}` : "/blog", { scroll: false });
  }

  function handleReadFilterChange(value: ReadFilterValue) {
    setReadFilter(value);
    setCurrentPage(1);
    const params = toSearchParams(searchParams);
    if (value === "all") {
      params.delete("read");
    } else {
      params.set("read", value);
    }
    const qs = params.toString();
    router.replace(qs ? `/blog?${qs}` : "/blog", { scroll: false });
  }

  function handleSortChange(order: SortOrder) {
    setSortOrder(order);
    const params = toSearchParams(searchParams);
    if (order === "newest") {
      params.delete("sort");
    } else {
      params.set("sort", order);
    }
    const qs = params.toString();
    router.replace(qs ? `/blog?${qs}` : "/blog", { scroll: false });
  }

  const { user, isLoading: authLoading } = useAuth();

  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Ambient brand glow — subtle depth behind the hero */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(60% 120% at 12% -10%, rgba(200,16,46,0.07) 0%, transparent 60%), radial-gradient(50% 100% at 88% -20%, rgba(11,29,58,0.08) 0%, transparent 55%)",
          }}
        />
        <div className="max-w-[1120px] mx-auto px-6 pt-14 pb-0 relative hero-fade-in">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-red uppercase tracking-[0.08em] mb-[14px]">
            <span className="w-1.5 h-1.5 rounded-full bg-red" />
            Adroit Consulting &mdash; Field Notes
          </div>
          <h1 className="text-[clamp(2.25rem,5vw,3rem)] font-extrabold text-navy tracking-[-0.03em] leading-[1.05] mb-3 bg-gradient-to-r from-navy to-navy-light dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Adroit Consulting Blog
          </h1>
          <p className="text-[1.0625rem] text-gray-500 max-w-[560px] leading-relaxed">
            Insights on Salesforce, React, AI, and digital transformation to
            help your business scale smarter.
          </p>
          <a
            href="/feed.xml"
            className="inline-flex items-center gap-2 text-xs text-gray-500 mt-3 hover:text-navy transition-colors duration-150 no-underline group"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="w-6 h-6 rounded-md border border-gray-200 bg-white flex items-center justify-center text-[0.65rem] text-gray-500 group-hover:border-red group-hover:text-red transition-colors duration-150">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="4" cy="20" r="3" />
                <path d="M4 11a9 9 0 0 1 9 9h3a12 12 0 0 0-12-12v3z" />
                <path d="M4 4a16 16 0 0 1 16 16h3a19 19 0 0 0-19-19v3z" />
              </svg>
            </span>
            RSS Feed
          </a>

          {/* Category Pills + Read Filter + Sort */}
          <div className="flex flex-wrap items-center gap-2 mt-7 pb-8 border-b border-gray-200">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const count =
                  cat.key === "all"
                    ? posts.length
                    : posts.filter((p) => p.categoryColor === cat.key)
                        .length;
                const active = activeCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => handleCategoryClick(cat.key)}
                    aria-pressed={active}
                    className={`group inline-flex items-center gap-1.5 pl-4 pr-1.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer no-underline transition-all duration-150 active:scale-[0.98] ${
                      active
                        ? "bg-navy text-white shadow-md shadow-navy/20"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:-translate-y-px dark:bg-[var(--surface-card)] dark:text-[var(--ink-body)] dark:border-[var(--border-default)] dark:hover:bg-[var(--surface-card-soft)] dark:hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {cat.label}
                    <span
                      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full font-mono text-[10.5px] font-bold tabular-nums transition-colors duration-150 ${
                        active
                          ? "bg-white/15 text-white"
                          : "bg-gray-100 text-gray-600 group-hover:bg-gray-200 group-hover:text-gray-700 dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-muted)] dark:group-hover:bg-[var(--surface-sunken)] dark:group-hover:text-[var(--ink-body)]"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Read Filter + Sort — wrap on narrow viewports so the
                controls never clip off the right edge (390px QA finding) */}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <ReadFilter
                readKeys={readKeys}
                value={readFilter}
                onChange={handleReadFilterChange}
              />
              <SortToggle sort={sortOrder} onChange={handleSortChange} />
            </div>
          </div>
        </div>
      </div>

      {/* Featured Post */}
      {featured && activeCategory === "all" && readFilter === "all" && (
        <div className="mt-8">
          <FeaturedPost post={featured} />
        </div>
      )}

      {/* Reading progress — real merged read count across the listing */}
      <BlogReadProgress postSlugs={filtered.map((p) => p.slug)} />

      {/* Sign-in prompt — per-user cross-device sync (design brief §4.3) */}
      {!authLoading && !user && (
        <div className="max-w-[1120px] mx-auto px-6 mb-6">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3">
            <p className="text-[12.5px] text-gray-500 leading-relaxed">
              Progress is saved on this device.{" "}
              <span className="hidden sm:inline">Sign in to sync across devices.</span>
            </p>
            <Link
              href="/login?next=/blog"
              className="flex-shrink-0 text-[12px] font-bold text-navy underline underline-offset-2 decoration-red/40 hover:decoration-red no-underline transition-colors duration-150"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      {/* Post Cards Grid */}
      <div className="max-w-[1120px] mx-auto px-6 pb-24">
        {paginatedPosts.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white/60 px-6 py-12 text-center dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]">
            <p className="text-[14.5px] font-semibold text-gray-700">
              {readFilter === "unread"
                ? "No unread posts in this category."
                : readFilter === "read"
                  ? "No read posts in this category yet."
                  : "No posts in this category yet."}
            </p>
            <p className="text-[12.5px] text-gray-500 mt-1.5">
              {readFilter !== "all" ? (
                <>
                  Try the{" "}
                  <button
                    onClick={() => handleReadFilterChange("all")}
                    className="font-semibold text-navy underline underline-offset-2 decoration-red/40 hover:decoration-red cursor-pointer bg-none border-none"
                  >
                    All
                  </button>{" "}
                  filter to see everything.
                </>
              ) : (
                "Check back soon for new posts."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {paginatedPosts.map((post) => (
              <div key={post.slug} className="relative">
                <PostCardWithRead post={post} />
                <div className="mt-2 px-1">
                  <MarkAsRead slug={`blog/${post.slug}`} contentType="blog" showLabel={false} label={post.title} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && paginatedPosts.length > 0 && (
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-center gap-1.5 mt-8"
          >
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="min-w-[44px] min-h-[44px] rounded-md border border-gray-200 bg-white flex items-center justify-center text-xs font-medium text-gray-600 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] dark:bg-[var(--surface-card)] dark:border-[var(--border-default)] dark:text-[var(--ink-body)] dark:hover:bg-[var(--surface-card-soft)] dark:hover:border-[var(--border-strong)]"
            >
              &lsaquo;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(
              (page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  aria-current={page === currentPage ? "page" : undefined}
                  aria-label={`Page ${page}`}
                  className={`min-w-[44px] min-h-[44px] rounded-md border flex items-center justify-center text-xs font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                    page === currentPage
                      ? "bg-navy text-white border-navy dark:bg-[var(--surface-inverse)] dark:border-[var(--surface-inverse)]"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 dark:bg-[var(--surface-card)] dark:border-[var(--border-default)] dark:text-[var(--ink-body)] dark:hover:bg-[var(--surface-card-soft)] dark:hover:border-[var(--border-strong)]"
                  }`}
                >
                  {page}
                </button>
              ),
            )}
            <button
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="min-w-[44px] min-h-[44px] rounded-md border border-gray-200 bg-white flex items-center justify-center text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] dark:bg-[var(--surface-card)] dark:border-[var(--border-default)] dark:text-[var(--ink-body)] dark:hover:bg-[var(--surface-card-soft)] dark:hover:border-[var(--border-strong)]"
            >
              &rsaquo;
            </button>
          </nav>
        )}
      </div>
    </>
  );
}

export default function BlogListingClient({
  posts,
  searchParams,
}: BlogListingClientProps) {
  return <BlogListingContent posts={posts} searchParams={searchParams} />;
}
