"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminCourseListRow,
  AdminCourseUpdateRequest,
  CourseRow,
} from "@/shared/contracts-course-catalog";

/** GET /api/admin/courses → rows. Refetchable after mutations. */
export function useAdminCourses() {
  const [rows, setRows] = useState<AdminCourseListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/courses");
      if (!res.ok) throw new Error("Failed to load courses");
      const json = (await res.json()) as { ok: true; data: AdminCourseListRow[] };
      setRows(json.data);
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

  /** PATCH a course's status/access_model/price. Returns success bool. */
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

  return { rows, loading, error, refresh, updateCourse };
}

/** Reusable admin fetch helper for typed mutation helpers. */
export type { AdminCourseListRow, CourseRow };
