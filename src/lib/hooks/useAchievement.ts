/**
 * useAchievement — client hook for the Constellations + Chronicle stats
 * (GET /api/progress/achievement). Used by the learn-hub preview and the
 * lesson-complete pop to show the live rank/streak as-of now.
 *
 * Fetches once on mount (cache: no-store) and re-fetches when a progress
 * event fires so the pop reflects the post-write streak. Guests get an
 * empty stats block — never throws.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { PROGRESS_CHANGED_EVENT } from "@/lib/progress";
import type { AchievementStats } from "@/shared/contracts-constellations";

const EMPTY_STATS: AchievementStats = {
  streakDays: 0,
  longestStreakDays: 0,
  rank: null,
  coursesCompleted: 0,
  tracksCompleted: 0,
};

interface UseAchievementReturn {
  stats: AchievementStats;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useAchievement(): UseAchievementReturn {
  const [stats, setStats] = useState<AchievementStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async (): Promise<AchievementStats> => {
    try {
      const res = await fetch("/api/progress/achievement", { cache: "no-store" });
      if (!res.ok) return EMPTY_STATS;
      const json = (await res.json()) as { stats?: AchievementStats };
      return json.stats ?? EMPTY_STATS;
    } catch {
      return EMPTY_STATS;
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchStats();
    setStats(next);
  }, [fetchStats]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await fetchStats();
      if (!cancelled) {
        setStats(next);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStats]);

  // Live-update after any progress write (streak changes at the pop beat).
  useEffect(() => {
    const onChanged = () => void refresh();
    window.addEventListener(PROGRESS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener(PROGRESS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, [refresh]);

  return { stats, isLoading, refresh };
}
