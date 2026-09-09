"use client";

import type { SortOrder } from "@/lib/sort";

/**
 * Newest | Oldest sort toggle.
 *
 * Controlled component: the parent owns the `?sort=` URL param and passes the
 * current `sort` value plus an `onChange` callback. This keeps the component
 * free of `useSearchParams()`, so it never triggers a client-side-rendering
 * bailout inside a statically rendered tree (the /blog SSR/CWV fix).
 */
interface SortToggleProps {
  sort: SortOrder;
  onChange: (order: SortOrder) => void;
  compact?: boolean;
}

export default function SortToggle({
  sort,
  onChange,
  compact = false,
}: SortToggleProps) {
  return (
    <div
      className={`inline-flex items-center rounded-full border border-gray-200 bg-white p-0.5 ${
        compact ? "text-[0.7rem]" : "text-xs"
      } font-semibold`}
    >
      <button
        onClick={() => onChange("newest")}
        aria-pressed={sort === "newest"}
        className={`px-3 py-1 rounded-full cursor-pointer transition-all duration-150 active:scale-[0.98] ${
          sort === "newest"
            ? "bg-navy text-white"
            : "text-gray-500 hover:text-navy"
        }`}
      >
        Newest
      </button>
      <button
        onClick={() => onChange("oldest")}
        aria-pressed={sort === "oldest"}
        className={`px-3 py-1 rounded-full cursor-pointer transition-all duration-150 active:scale-[0.98] ${
          sort === "oldest"
            ? "bg-navy text-white"
            : "text-gray-500 hover:text-navy"
        }`}
      >
        Oldest
      </button>
    </div>
  );
}
