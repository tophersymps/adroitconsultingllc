import Link from "next/link";
import { BlogPost } from "@/data/types";
import { Tag } from "@/components/Tag";
import BannerImage from "@/components/BlogListing/BannerImage";

interface PostCardProps {
  post: BlogPost;
  /** True when the user has marked this post read — dims the card + shows emerald check badge (design brief §4.1). */
  read?: boolean;
}

export default function PostCard({ post, read = false }: PostCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      aria-label={`${read ? "Read: " : ""}${post.title}`}
      className={`group block rounded-xl overflow-hidden border bg-white dark:bg-[var(--surface-card)] shadow-card hover:shadow-card-hover hover:border-navy/15 hover:-translate-y-1 transition-all duration-300 no-underline ${
        read ? "border-gray-100 dark:border-[var(--border-subtle)]" : "border-gray-200 dark:border-[var(--border-default)]"
      }`}
    >
      {/* Image header */}
      <div className={`relative overflow-hidden ${read ? "opacity-60" : ""}`}>
        <div className="transition-transform duration-500 ease-out group-hover:scale-[1.04]">
          <BannerImage
            post={post}
            className="h-[100px] md:h-[140px]"
            watermark={false}
          />
        </div>
        <span className="absolute bottom-2.5 left-3 bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded text-[0.65rem] font-semibold text-white z-10">
          {post.category}
        </span>
        {/* Emerald check badge — read state (design brief §4.1) — Moment
            check-pop (design §07): the badge mounts only after hydration
            reports read=true, so the pop plays on state change. */}
        {read && (
          <span
            aria-hidden="true"
            className="check-pop absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--signal-done)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <Tag label={post.category} color={post.categoryColor} />
          <span className="text-[0.65rem] font-mono text-gray-500 tabular-nums">
            {post.readTime}
          </span>
        </div>
        <h3
          className={`text-lg font-bold mt-2.5 mb-1.5 leading-snug tracking-tight transition-colors duration-200 ${
            read
              ? "text-gray-500 group-hover:text-gray-600"
              : "text-gray-900 group-hover:text-red"
          }`}
        >
          {post.title}
        </h3>
        <p className="text-xs leading-relaxed mb-3 line-clamp-2 text-gray-500">
          {post.excerpt}
        </p>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="font-mono text-[0.7rem]">{post.date}</span>
          <span className="inline-flex items-center gap-1 text-red font-semibold">
            {read ? "Read again" : "Read more"}
            <span className="transition-transform duration-300 group-hover:translate-x-0.5">
              &rarr;
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
