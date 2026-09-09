/**
 * PostReadProgress — real read-state indicator for post/lesson detail (client).
 *
 * Renders "Read" (full bar) or "Not read yet" (empty bar) based on the actual
 * localStorage/Supabase read state, replacing a hard-coded 1/1 bar.
 */
"use client";

import { useReadProgress } from "@/lib/hooks/useReadProgress";
import ProgressIndicator from "@/components/Progress/ProgressIndicator";

interface PostReadProgressProps {
  slug: string;
  contentType?: "blog" | "lesson";
  /** Label shown next to the bar when unread (defaults to "Not read yet"). */
  unreadLabel?: string;
}

export default function PostReadProgress({
  slug,
  contentType = "blog",
  unreadLabel = "Not read yet",
}: PostReadProgressProps) {
  const { isRead, isLoading } = useReadProgress(slug, contentType);

  if (isLoading) {
    return (
      <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-[var(--surface-sunken)] animate-pulse" />
    );
  }

  return (
    <ProgressIndicator
      current={isRead ? 1 : 0}
      total={1}
      label={isRead ? "Read" : unreadLabel}
      showPercent={false}
    />
  );
}
