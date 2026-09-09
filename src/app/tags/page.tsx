import Link from "next/link";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getAllTags } from "@/lib/tags";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Tags — Adroit Consulting Blog",
  description: "Browse all blog post tags covering Salesforce, React, AI, and digital transformation.",
  path: "/tags",
});

export default function TagsPage() {
  const allTags = getAllTags();

  // Weighted tag cloud — chips scale by post count (top tercile → lg, middle → md, bottom → sm)
  const third = Math.ceil(allTags.length / 3);
  const tagsWithSize = allTags.map((tag, i) => ({
    ...tag,
    sizeClass: (i < third ? "lg" : i < third * 2 ? "md" : "sm") as
      | "lg"
      | "md"
      | "sm",
  }));

  const sizeStyles = {
    lg: "text-base px-[22px] py-[11px] font-semibold",
    md: "text-sm px-4 py-2 font-semibold",
    sm: "text-[0.8rem] px-[15px] py-2 font-medium text-gray-500",
  } as const;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main id="main" className="flex-1">
        <div className="max-w-[1120px] mx-auto px-6 pt-14 pb-0">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-red uppercase tracking-[0.08em] mb-[14px]">
            <span className="w-1.5 h-1.5 rounded-full bg-red" />
            Topic Index
          </div>
          <h1 className="text-[clamp(2rem,4.5vw,2.75rem)] font-extrabold text-navy tracking-[-0.03em] leading-[1.05] mb-3 bg-gradient-to-r from-navy to-navy-light dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Tags
          </h1>
          <p className="text-[1.0625rem] text-gray-500 max-w-[560px] leading-relaxed mb-8">
            Browse content by topic tag — sized by how much we&apos;ve written
            on each.
          </p>
        </div>

        <div className="max-w-[1120px] mx-auto px-6 pb-24">
          <div className="flex flex-wrap gap-3">
            {tagsWithSize.map((tag) => (
              <Link
                key={tag.slug}
                href={`/tags/${tag.slug}`}
                className={`group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white shadow-card text-gray-700 no-underline hover:bg-navy hover:text-white hover:border-navy hover:-translate-y-0.5 hover:shadow-card-hover transition-all duration-150 ${sizeStyles[tag.sizeClass]}`}
              >
                {tag.tag}
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gray-100 text-[0.65rem] font-mono font-bold text-gray-600 transition-colors duration-150 group-hover:bg-white/15 group-hover:text-white/80">
                  {tag.count}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
