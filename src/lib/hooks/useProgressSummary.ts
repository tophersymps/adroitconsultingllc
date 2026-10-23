/**
 * useProgressSummary — client hook that merges localStorage progress with the
 * authenticated user's Supabase summary (GET /api/progress/summary).
 *
 * Used by aggregate indicators (learn hub, series pages, blog listing) so the
 * bars reflect REAL progress instead of published counts.
 */
"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import {
  mergeProgressFromSummary,
  PROGRESS_CHANGED_EVENT,
  type ProgressMerge,
} from "@/lib/progress";

interface UseProgressSummaryReturn {
  /** Merged read/completed sets (slug keys, bare form). */
  merge: ProgressMerge;
  isLoading: boolean;
  /** Re-fetch the Supabase summary (e.g. after marking something read). */
  refresh: () => Promise<void>;
}

interface SupabaseSummary {
  readContent?: { blog?: string[]; lesson?: string[] };
  completedLessons?: string[];
}

/** Shared empty merge — the hydration-safe first-render value (never mutated). */
const EMPTY_MERGE: ProgressMerge = { read: new Set(), lessons: new Set() };

/** No-op subscription — the hydration flag never changes after mount. */
const NO_SUBSCRIBE = () => () => {};

export function useProgressSummary(
  readSlugs: string[],
  lessonSlugs: string[],
): UseProgressSummaryReturn {
  const [summary, setSummary] = useState<SupabaseSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Hydration-safe (QA R2-4 F4): the merge below reads localStorage, which the
  // server cannot see. Computing it on the first client render made aggregate
  // counters ("Read N", progress bars) disagree with the server HTML and
  // tripped React #418 (text) on /field-notes and /atlas for any returning
  // visitor. `useSyncExternalStore` renders the empty merge during hydration and
  // switches to the storage-aware merge immediately after.
  const hydrated = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => true,
    () => false,
  );
  // Bumped on every PROGRESS_CHANGED_EVENT so aggregate bars re-read
  // localStorage immediately after a mark-read/complete action.
  const [, setChangeTick] = useState(0);

  const fetchSummary = useCallback(async (): Promise<SupabaseSummary | null> => {
    try {
      const res = await fetch("/api/progress/summary", { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as SupabaseSummary;
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchSummary();
    setSummary(data);
  }, [fetchSummary]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchSummary();
      if (!cancelled) {
        setSummary(data);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchSummary]);

  // Live-update aggregate bars when any progress hook writes localStorage.
  useEffect(() => {
    const onChanged = () => setChangeTick((t) => t + 1);
    window.addEventListener(PROGRESS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener(PROGRESS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  const merge = hydrated
    ? mergeProgressFromSummary(summary, readSlugs, lessonSlugs)
    : EMPTY_MERGE;

  return { merge, isLoading, refresh };
}
