"use client";

import { useCallback, useEffect, useState } from "react";
import type { CourseAnalyticsResult } from "@/lib/course-analytics";

/** GET /api/admin/analytics → per-course completion analytics (v4). */
export function useAdminAnalytics() {
  const [data, setData] = useState<CourseAnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/analytics", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = (await res.json()) as { ok: true; data: CourseAnalyticsResult };
      setData(json.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Data-fetch on mount — setState runs after await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
