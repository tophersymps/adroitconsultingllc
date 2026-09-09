import Link from "next/link";
import { BlogPost } from "@/data/types";

interface PostNavigationProps {
  prev?: BlogPost;
  next?: BlogPost;
}

export default function PostNavigation({ prev, next }: PostNavigationProps) {
  return (
    <div className="max-w-[720px] mx-auto px-6 py-8 grid grid-cols-2 gap-4">
      {prev ? (
        <Link
          href={`/blog/${prev.slug}`}
          className="group p-5 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-white dark:border-[var(--border-default)] dark:hover:border-[var(--border-strong)] dark:hover:bg-[var(--surface-card)] hover:shadow-md hover:shadow-navy/5 hover:-translate-y-0.5 transition-all duration-200 no-underline"
        >
          <div className="flex items-center gap-1 text-[0.7rem] text-gray-500 dark:text-[var(--ink-muted)] uppercase tracking-wider font-semibold mb-1.5 transition-colors duration-150 group-hover:text-red">
            <span className="transition-transform duration-200 group-hover:-translate-x-0.5">
              &larr;
            </span>
            Previous
          </div>
          <h4 className="text-sm font-semibold text-navy dark:text-[var(--ink-primary)] leading-snug transition-colors duration-150 group-hover:text-red dark:group-hover:text-[var(--accent)]">
            {prev.title}
          </h4>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/blog/${next.slug}`}
          className="group p-5 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-white dark:border-[var(--border-default)] dark:hover:border-[var(--border-strong)] dark:hover:bg-[var(--surface-card)] hover:shadow-md hover:shadow-navy/5 hover:-translate-y-0.5 transition-all duration-200 no-underline text-right"
        >
          <div className="flex items-center justify-end gap-1 text-[0.7rem] text-gray-500 dark:text-[var(--ink-muted)] uppercase tracking-wider font-semibold mb-1.5 transition-colors duration-150 group-hover:text-red">
            Next
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              &rarr;
            </span>
          </div>
          <h4 className="text-sm font-semibold text-navy dark:text-[var(--ink-primary)] leading-snug transition-colors duration-150 group-hover:text-red dark:group-hover:text-[var(--accent)]">
            {next.title}
          </h4>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
