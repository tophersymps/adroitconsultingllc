import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { posts } from "@/data/posts";
import { getMDXContent, getAllMDXSlugs, stripMDXFrontmatter, linkifySourceCitations } from "@/lib/mdx";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BackLink from "@/components/BackLink";
import ReadingProgress from "@/components/BlogPost/ReadingProgress";
import ShareBar from "@/components/BlogPost/ShareBar";
import PostNavigation from "@/components/BlogPost/PostNavigation";
import KeepLearning from "@/components/BlogPost/KeepLearning";
import BannerImage from "@/components/BlogListing/BannerImage";
import { Tag } from "@/components/Tag";
import { buildMetadata } from "@/lib/seo";
import MarkAsRead from "@/components/Progress/MarkAsRead";
import PostReadProgress from "@/components/Progress/PostReadProgress";
import MDXArticle from "@/components/MDX/MDXArticle";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const mdxSlugs = getAllMDXSlugs();
  return mdxSlugs
    .filter((slug) => posts.some((p) => p.slug === slug))
    .map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) return {};

  return buildMetadata({
    title: `${post.title} | Adroit Consulting Blog`,
    description: post.excerpt,
    path: `/blog/${slug}`,
    publishedTime: post.date,
    tags: post.tags,
    // Per-post OG image (B-13): use the post's banner when present, else the
    // site default card — lifts social CTR on shared posts.
    ogImage: post.bannerImage,
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) notFound();

  // Load and compile MDX content from content/blog/[slug].mdx
  // (frontmatter stripped — same fix Learn already applies; without it the
  // YAML blob renders as a stray heading inside the article body)
  const mdxContent = getMDXContent(slug);
  if (!mdxContent) notFound();
  const mdxBody = linkifySourceCitations(stripMDXFrontmatter(mdxContent));

  const currentIdx = posts.findIndex((p) => p.slug === slug);
  const prev = currentIdx > 0 ? posts[currentIdx - 1] : undefined;
  const next =
    currentIdx < posts.length - 1 ? posts[currentIdx + 1] : undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <ReadingProgress />
      <Header />

      <main id="main" className="flex-1">
        {/* Post Hero */}
        <div className="max-w-[720px] mx-auto px-6 pt-10 pb-0">
          <BackLink />

          {/* Author row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-navy to-navy-light ring-2 ring-white dark:ring-[var(--surface-card)] shadow-sm flex items-center justify-center text-white font-bold text-xs transition-all duration-150 hover:ring-red">
              {post.authorInitials}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800 dark:text-[var(--ink-primary)]">
                {post.author}
              </span>
              <div className="flex items-center text-xs text-gray-500 dark:text-[var(--ink-muted)]">
                <span>{post.date}</span>
                <span className="mx-3 h-3 w-px bg-gray-200 dark:bg-[var(--border-default)]" />
                <span>{post.readTime}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-1">
            <Tag label={post.category} color={post.categoryColor} />
            {post.featured && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red/10 text-red dark:bg-red/15 dark:text-[var(--accent)] text-[0.6rem] font-bold uppercase tracking-wider">
                <span className="w-1 h-1 rounded-full bg-red animate-pulse" />
                Featured
              </span>
            )}
          </div>

          <h1 className="text-[clamp(1.875rem,4.5vw,2.625rem)] font-extrabold text-navy dark:text-[var(--ink-strong)] tracking-[-0.025em] leading-[1.12] mt-4 mb-4">
            {post.title}
          </h1>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium hover:bg-gray-200 hover:text-navy dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-muted)] dark:hover:bg-[var(--surface-card-soft)] dark:hover:text-[var(--ink-primary)] transition-colors duration-150"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <ShareBar />

          {/* Read progress */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-[var(--border-subtle)]">
            <PostReadProgress slug={`blog/${post.slug}`} contentType="blog" unreadLabel="Not read yet" />
            <div className="mt-3">
              <MarkAsRead slug={`blog/${post.slug}`} contentType="blog" />
            </div>
          </div>
        </div>

        {/* Post Banner — real image when present, gradient fallback */}
        {post.bannerImage && (
          <div className="max-w-[920px] mx-auto px-6 py-6">
            <div className="relative rounded-2xl overflow-hidden shadow-lg shadow-navy/10 ring-1 ring-gray-200 dark:ring-[var(--border-default)]">
              <BannerImage
                post={post}
                className="h-[220px] md:h-[380px]"
                watermark
              />
              {/* Bottom scrim */}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-navy/40 pointer-events-none"
              />
              {/* Category chip overlay */}
              <span className="absolute top-3.5 left-3.5 bg-navy/45 backdrop-blur-sm border border-white/18 px-2.5 py-1 rounded-full text-[10.5px] font-bold text-white uppercase tracking-[0.06em] z-10">
                {post.category}
              </span>
            </div>
          </div>
        )}

        {/* Article Body — rendered from MDX content */}
        <article className="article-body max-w-[720px] mx-auto px-6 pb-16">
          <MDXArticle mdx={mdxBody} />
        </article>

        {/* Next/Prev */}
        <PostNavigation prev={prev} next={next} />

        {/* B-20 — Post → Learn funnel + related posts */}
        <KeepLearning post={post} allPosts={posts} />
      </main>

      <Footer />
    </div>
  );
}
