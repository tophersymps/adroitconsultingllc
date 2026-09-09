import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReadingProgress from "@/components/BlogPost/ReadingProgress";
import MDXArticle from "@/components/MDX/MDXArticle";
import PreviewStrip from "@/components/Preview/PreviewStrip";
import DraftLocked from "@/components/Preview/DraftLocked";
import {
  getLearnMDXContent,
  getSeriesBySlug,
  getAuthorInitials,
  stripMDXFrontmatter,
} from "@/lib/learn";
import { parseMDXFrontmatter, linkifySourceCitations } from "@/lib/mdx";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isPreviewEmailAllowed } from "@/lib/preview-auth";

interface Props {
  params: Promise<{ series: string; slug: string }>;
}

export const dynamic = "force-dynamic";

/**
 * /preview/learn/[series]/[slug] — auth-gated request-time render of a draft
 * learn lesson. Mirrors /preview/blog/[slug] (same gate + PreviewStrip).
 * Learn needs two segments (series + slug), hence its own route dir.
 */
export default async function PreviewLearnPage({ params }: Props) {
  const { series, slug } = await params;

  const seriesInfo = getSeriesBySlug(series);
  if (!seriesInfo) notFound();

  // Read raw MDX at request time (dynamic — never statically optimized).
  const mdxContent = getLearnMDXContent(series, slug);
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
            nextPath={`/preview/learn/${series}/${slug}`}
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
          <DraftLocked
            state="no-access"
            nextPath={`/preview/learn/${series}/${slug}`}
          />
        </main>
        <Footer />
      </div>
    );
  }

  // Allowlisted editor — render the draft preview.
  const mdxBody = linkifySourceCitations(stripMDXFrontmatter(mdxContent));

  const title = (fm?.title as string) || slug;
  const lessonNumber = Number.isNaN(parseInt(String(fm?.lesson ?? ""), 10))
    ? 0
    : parseInt(String(fm?.lesson), 10);
  const date = (fm?.date as string) || "";
  const author = (fm?.author as string) || "Adroit Consulting";
  const readTime = (fm?.readTime as string) || "5 min read";
  const tags = Array.isArray(fm?.tags) ? (fm.tags as string[]) : [];

  return (
    <div className="min-h-screen flex flex-col">
      <ReadingProgress />
      <Header />
      <PreviewStrip
        title={title}
        status={status}
        backHref={`/learn/${series}`}
      />

      <main id="main" className="flex-1">
        {/* Lesson hero (matches public learn lesson, minus ShareBar/quiz) */}
        <div className="max-w-[720px] mx-auto px-6 pt-10 pb-0">
          <Link
            href={`/learn/${series}`}
            className="inline-flex items-center gap-1.5 text-gray-500 text-xs font-medium no-underline mb-5 hover:text-navy transition-colors duration-150"
          >
            &larr; Back to {seriesInfo.name}
          </Link>

          {/* Series crumb — mono sequence voice */}
          <div className="flex items-center gap-2 font-mono text-[11.5px] font-semibold text-gray-500 mb-[18px]">
            <span className="bg-navy text-white px-2 py-0.5 rounded-[5px] font-bold">
              Lesson {lessonNumber}
            </span>
            <span>
              of {seriesInfo.totalLessons} &middot;{" "}
              <Link
                href={`/learn/${series}`}
                className="text-gray-500 no-underline hover:text-navy transition-colors duration-150"
              >
                {seriesInfo.name}
              </Link>
            </span>
          </div>

          <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold text-navy tracking-[-0.02em] leading-tight mb-5">
            {title}
          </h1>

          {/* Author row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-navy to-navy-light ring-2 ring-white shadow-sm flex items-center justify-center text-white font-bold text-xs">
              {getAuthorInitials(author)}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800">
                {author}
              </span>
              <div className="flex items-center text-xs text-gray-500">
                <span>{date}</span>
                <span className="mx-3 h-3 w-px bg-gray-200" />
                <span>{readTime}</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Article Body — rendered from raw MDX (same renderer as public) */}
        <article className="article-body max-w-[720px] mx-auto px-6 pb-16">
          <MDXArticle mdx={mdxBody} kind="learn" />
        </article>
      </main>

      <Footer />
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { series, slug } = await params;

  // Guests and non-allowlisted users must never receive draft content — not
  // even the title. Only resolve frontmatter metadata for allowlisted users.
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPreviewEmailAllowed(user.email)) {
    return {
      title: "Preview locked | Adroit",
      robots: { index: false, follow: false },
    };
  }

  const mdxContent = getLearnMDXContent(series, slug);
  if (!mdxContent) return {};
  const [fm] = parseMDXFrontmatter(mdxContent);
  const title = (fm?.title as string) || slug;
  const excerpt = (fm?.excerpt as string) || "";
  return {
    title: `Draft preview: ${title} | ${seriesInfoName(series)} | Adroit`,
    description: excerpt,
    robots: { index: false, follow: false },
  };
}

function seriesInfoName(series: string): string {
  return getSeriesBySlug(series)?.name ?? series;
}
