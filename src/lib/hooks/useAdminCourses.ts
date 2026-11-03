"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AccessModel,
  AdminCourseListRow,
  AdminCourseUpdateRequest,
  CourseRow,
} from "@/shared/contracts-course-catalog";

export interface UnprovisionedSeriesSummary {
  slug: string;
  name: string;
  description: string;
  publishedLessonCount: number;
  totalLessonCount: number;
}

/** GET /api/admin/courses → rows + unprovisionedSeries. Refetchable after mutations. */
export function useAdminCourses() {
  const [rows, setRows] = useState<AdminCourseListRow[] | null>(null);
  const [unprovisionedSeries, setUnprovisionedSeries] = useState<
    UnprovisionedSeriesSummary[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/courses");
      if (!res.ok) throw new Error("Failed to load courses");
      const json = (await res.json()) as {
        ok: true;
        data: AdminCourseListRow[];
        unprovisionedSeries?: UnprovisionedSeriesSummary[];
      };
      setRows(json.data);
      setUnprovisionedSeries(json.unprovisionedSeries ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Data-fetch on mount — setState runs after await (not synchronously),
    // so the set-state-in-effect rule is a false positive here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  /** PATCH a course's status/access_model/price/title. Returns success bool. */
  async function updateCourse(
    slug: string,
    update: AdminCourseUpdateRequest,
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/courses/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) return false;
      await refresh();
      return true;
    } catch {
      return false;
    }
  }

  /** POST /api/admin/courses/provision to provision a disk series in the DB. */
  async function provisionSeries(
    series_slug: string,
    opts?: { title?: string; access_model?: AccessModel },
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/admin/courses/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          series_slug,
          ...(opts?.title ? { title: opts.title } : {}),
          ...(opts?.access_model ? { access_model: opts.access_model } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? "Provision failed" };
      }
      await refresh();
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error while provisioning series" };
    }
  }

  return {
    rows,
    unprovisionedSeries,
    loading,
    error,
    refresh,
    updateCourse,
    provisionSeries,
  };
}

/** Reusable admin fetch helper for typed mutation helpers. */
export type { AdminCourseListRow, CourseRow };
