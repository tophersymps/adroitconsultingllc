import Link from "next/link";
import { BlogPost } from "@/data/types";
import BannerImage from "@/components/BlogListing/BannerImage";

interface FeaturedPostProps {
  post: BlogPost;
}

const GLOW_FALLBACK = "sf";

export default function FeaturedPost({ post }: FeaturedPostProps) {
  const glow =
    post.categoryColor === "sf" ||
    post.categoryColor === "react" ||
    post.categoryColor === "ai" ||
    post.categoryColor === "mkt" ||
    post.categoryColor === "ux" ||
    post.categoryColor === "pm"
      ? post.categoryColor
      : GLOW_FALLBACK;

  return (
    <div className="max-w-[1120px] mx-auto mb-8 px-6">
      <Link
        href={`/blog/${post.slug}`}
        style={{ boxShadow: `var(--shadow-glow-${glow})` }}
        className="group block rounded-xl overflow-hidden bg-navy border border-gray-200 dark:border-[var(--border-default)] grid grid-cols-1 md:grid-cols-2 hover:-translate-y-1 transition-all duration-300 no-underline"
      >
        {/* Image side */}
        <div className="relative overflow-hidden">
          <div className="transition-transform duration-500 ease-out group-hover:scale-[1.04]">
            <BannerImage
              post={post}
              className="min-h-[160px] md:min-h-[240px]"
              watermark
            />
          </div>
          {/* Category chip on image */}
          <span className="absolute top-3.5 left-3.5 bg-white/18 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10.5px] font-bold text-white uppercase tracking-[0.06em] z-10">
            {post.category}
          </span>
        </div>

        {/* Content side */}
        <div className="p-6 md:p-8 flex flex-col justify-center relative">
          {/* Radial red tint — mockup .featured-glow ::after */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(60% 80% at 85% 20%, rgba(200,16,46,0.14) 0%, transparent 60%)",
            }}
          />
          <span className="relative inline-flex items-center gap-1.5 bg-red text-white text-[0.7rem] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider mb-4 w-fit">
            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
            Featured
          </span>
          <h2 className="relative text-white text-2xl md:text-3xl font-bold tracking-tight mb-3 leading-tight transition-colors duration-200 group-hover:text-white/95">
            {post.title}
          </h2>
          <p className="relative text-white/60 text-sm leading-relaxed mb-5">
            {post.excerpt}
          </p>
          <div className="relative flex items-center gap-3 text-xs text-white/60 mb-5">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/10 font-bold text-[0.6rem] text-white/70">
              {post.authorInitials}
            </span>
            <span>{post.author}</span>
            <span className="w-[3px] h-[3px] bg-white/30 rounded-full" />
            <span>{post.date}</span>
            <span className="w-[3px] h-[3px] bg-white/30 rounded-full" />
            <span>{post.readTime}</span>
          </div>
          <span className="relative inline-flex items-center gap-1.5 text-[#ff6b7a] text-xs font-semibold hover:text-white">
            Read article
            <span className="transition-transform duration-300 group-hover:translate-x-1">
              &rarr;
            </span>
          </span>
        </div>
      </Link>
    </div>
  );
}
