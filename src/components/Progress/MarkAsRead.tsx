/**
 * MarkAsRead — toggle button for marking blog/lesson content as read.
 *
 * Uses useReadProgress hook which handles Supabase (auth) / localStorage (guest) fallback.
 */
"use client";

import { useReadProgress } from "@/lib/hooks/useReadProgress";

interface MarkAsReadProps {
  slug: string;
  contentType?: "blog" | "lesson";
  /** Show text label alongside icon. */
  showLabel?: boolean;
  /** Accessible name used when showLabel=false (icon-only variant). */
  label?: string;
}

export default function MarkAsRead({
  slug,
  contentType = "blog",
  showLabel = true,
  label,
}: MarkAsReadProps) {
  const { isRead, markAsRead, isLoading } = useReadProgress(slug, contentType);

  const actionText = isRead ? "Marked as read" : "Mark as read";

  return (
    <button
      onClick={markAsRead}
      disabled={isLoading}
      aria-pressed={isRead}
      aria-label={
        showLabel
          ? undefined
          : label
            ? `${actionText}: ${label}`
            : `${actionText}: ${slug}`
      }
      className={`inline-flex items-center gap-2 rounded-full text-xs font-semibold transition-all duration-150 no-underline active:scale-[0.98] ${
        showLabel ? "px-4 min-h-11" : "px-3 min-h-9"
      } ${
        isRead
          ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
          : "bg-gray-100 text-gray-600 hover:bg-navy hover:text-white dark:bg-[var(--surface-card)] dark:text-[var(--ink-muted)]"
      } ${isLoading ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isRead ? (
          <>
            <path d="M20 6L9 17l-5-5" />
          </>
        ) : (
          <circle cx="12" cy="12" r="10" />
        )}
      </svg>
      {showLabel && <span>{isRead ? "Read" : "Mark as read"}</span>}
    </button>
  );
}
