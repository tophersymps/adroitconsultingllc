import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReadingProgress from "@/components/BlogPost/ReadingProgress";
import BannerImage from "@/components/BlogListing/BannerImage";
import { Tag } from "@/components/Tag";
import MDXArticle from "@/components/MDX/MDXArticle";
import PreviewStrip from "@/components/Preview/PreviewStrip";
import DraftLocked from "@/components/Preview/DraftLocked";
import {
  getMDXContent,
  parseMDXFrontmatter,
  stripMDXFrontmatter,
  linkifySourceCitations,
} from "@/lib/mdx";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isPreviewEmailAllowed } from "@/lib/preview-auth";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

/**
 * /preview/blog/[slug] — auth-gated request-time render of a draft MDX.
 *
 * Reads content/blog/[slug].mdx directly via the existing MDX pipeline
 * (the public /blog/[slug] page is static and excludes drafts by
 * construction — this is the only surface that renders them).
 *
 * Gate (server-side only — guests never receive MDX bytes):
 *   signed-out      → DraftLocked "signed-out" (200, login CTA w/ next)
 *   authed not allowed → DraftLocked "no-access" (200, BA copy + mailto)
 *   authed allowed  → PreviewStrip + article (no ShareBar/progress/quiz)
 */
export default async function PreviewBlogPage({ params }: Props) {
  const { slug } = await params;

  // Read raw MDX at request time (dynamic — never statically optimized).
  const mdxContent = getMDXContent(slug);
  if (!mdxContent) notFound();

  const [fm] = parseMDXFrontmatter(mdxContent);
  const status: "draft" | "published" =
    fm?.status === "draft" ? "draft" : "published";

  // Auth gate — cookie session + email allowlist.
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <ReadingProgress />
        <Header />
        <main id="main" className="flex-1">
          <DraftLocked
            state="signed-out"
            nextPath={`/preview/blog/${slug}`}
          />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isPreviewEmailAllowed(user.email)) {
    return (
      <div className="min-h-screen flex flex-col">
        <ReadingProgress />
        <Header />
        <main id="main" className="flex-1">
          <DraftLocked state="no-access" nextPath={`/preview/blog/${slug}`} />
        </main>
        <Footer />
      </div>
    );
  }

  // Allowlisted editor — render the draft preview.
  const mdxBody = linkifySourceCitations(stripMDXFrontmatter(mdxContent));

  const title = (fm?.title as string) || "";
  const category = (fm?.category as string) || "";
  const categoryColor = (fm?.categoryColor as string) || "sf";
  const date = (fm?.date as string) || "";
  const author = (fm?.author as string) || "Adroit Consulting";
  const authorInitials = (fm?.authorInitials as string) || "AC";
  const readTime = (fm?.readTime as string) || "5 min read";
  const tags = Array.isArray(fm?.tags) ? (fm.tags as string[]) : [];
  const bannerImage = (fm?.bannerImage as string) || undefined;

  const post = { title, category, categoryColor, bannerImage };

  return (
    <div className="min-h-screen flex flex-col">
      <ReadingProgress />
      <Header />
      <PreviewStrip title={title} status={status} backHref="/blog" />

      <main id="main" className="flex-1">
        {/* Post Hero (matches public /blog/[slug], minus ShareBar/progress) */}
        <div className="max-w-[720px] mx-auto px-6 pt-10 pb-0">
          {/* Author row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-navy to-navy-light ring-2 ring-white dark:ring-[var(--surface-card)] shadow-sm flex items-center justify-center text-white font-bold text-xs transition-all duration-150 hover:ring-red">
              {authorInitials}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800 dark:text-[var(--ink-primary)]">
                {author}
              </span>
              <div className="flex items-center text-xs text-gray-500 dark:text-[var(--ink-muted)]">
                <span>{date}</span>
                <span className="mx-3 h-3 w-px bg-gray-200 dark:bg-[var(--border-default)]" />
                <span>{readTime}</span>
              </div>
            </div>
          </div>

          {category && (
            <div className="flex items-center gap-2 mb-1">
              <Tag
                label={category}
                color={categoryColor as "sf" | "react" | "ai" | "mkt" | "ux" | "pm"}
              />
            </div>
          )}

          <h1 className="text-[clamp(1.875rem,4.5vw,2.625rem)] font-extrabold text-navy dark:text-[var(--ink-strong)] tracking-[-0.025em] leading-[1.12] mt-4 mb-4">
            {title}
          </h1>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium hover:bg-gray-200 hover:text-navy dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-muted)] dark:hover:bg-[var(--surface-card-soft)] dark:hover:text-[var(--ink-primary)] transition-colors duration-150"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Banner — real image when present, gradient fallback */}
        {bannerImage && (
          <div className="max-w-[920px] mx-auto px-6 py-6">
            <div className="relative rounded-2xl overflow-hidden shadow-lg shadow-navy/10 ring-1 ring-gray-200 dark:ring-[var(--border-default)]">
              <BannerImage
                post={post}
                className="h-[220px] md:h-[380px]"
                watermark
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-navy/40 pointer-events-none"
              />
              {category && (
                <span className="absolute top-3.5 left-3.5 bg-navy/45 backdrop-blur-sm border border-white/18 px-2.5 py-1 rounded-full text-[10.5px] font-bold text-white uppercase tracking-[0.06em] z-10">
                  {category}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Article Body — rendered from raw MDX (same renderer as public) */}
        <article className="article-body max-w-[720px] mx-auto px-6 pb-16">
          <MDXArticle mdx={mdxBody} kind="blog" />
        </article>
      </main>

      <Footer />
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // Guests and non-allowlisted users must never receive draft content — not
  // even the title. Only resolve frontmatter metadata for allowlisted users.
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPreviewEmailAllowed(user.email)) {
    return {
      title: "Preview locked | Adroit Consulting Blog",
      robots: { index: false, follow: false },
    };
  }

  const mdxContent = getMDXContent(slug);
  if (!mdxContent) return {};
  const [fm] = parseMDXFrontmatter(mdxContent);
  const title = (fm?.title as string) || slug;
  const excerpt = (fm?.excerpt as string) || "";
  return {
    title: `Draft preview: ${title} | Adroit Consulting Blog`,
    description: excerpt,
    robots: { index: false, follow: false },
  };
}
