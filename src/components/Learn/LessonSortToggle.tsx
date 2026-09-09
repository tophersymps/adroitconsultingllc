"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * LessonSortToggle — lesson-number asc/desc control for the series syllabus
 * (ADR-105). Reads/writes `?sort=asc|desc` URL param (default asc) so the
 * choice is shareable and survives refresh.
 */
interface LessonSortToggleProps {
  compact?: boolean;
}

export default function LessonSortToggle({ compact = false }: LessonSortToggleProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sort = searchParams.get("sort") === "desc" ? "desc" : "asc";

  function setSort(order: "asc" | "desc") {
    const params = new URLSearchParams(searchParams.toString());
    if (order === "asc") {
      params.delete("sort");
    } else {
      params.set("sort", "desc");
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <div
      className={`inline-flex items-center rounded-full border border-gray-200 bg-white dark:bg-[var(--surface-card)] dark:border-[var(--border-default)] p-0.5 ${
        compact ? "text-[0.7rem]" : "text-xs"
      } font-semibold`}
    >
      <button
        onClick={() => setSort("asc")}
        aria-pressed={sort === "asc"}
        aria-label="Sort by lesson number ascending"
        className={`px-3 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 active:scale-[0.98] ${
          sort === "asc"
            ? "bg-navy text-white"
            : "text-gray-500 dark:text-[var(--ink-muted)] hover:text-navy"
        }`}
      >
        1 → 9
      </button>
      <button
        onClick={() => setSort("desc")}
        aria-pressed={sort === "desc"}
        aria-label="Sort by lesson number descending"
        className={`px-3 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 active:scale-[0.98] ${
          sort === "desc"
            ? "bg-navy text-white"
            : "text-gray-500 dark:text-[var(--ink-muted)] hover:text-navy"
        }`}
      >
        9 → 1
      </button>
    </div>
  );
}
