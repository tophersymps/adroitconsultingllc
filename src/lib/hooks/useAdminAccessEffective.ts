"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminCourseListRow,
  AdminUserListRow,
} from "@/shared/contracts-course-catalog";
import type { EffectiveAccessState } from "@/lib/access";

/** Shape of GET /api/admin/access/effective (ADR-223). */
export interface AdminAccessEffectiveData {
  courses: AdminCourseListRow[];
  users: AdminUserListRow[];
  matrix: Record<string, Record<string, EffectiveAccessState>>;
  subscriberPulse: {
    active: number;
    trialing: number;
    canceled: number;
    past_due: number;
  };
}

/** Client hook for the consolidated five-state accessor read. */
export function useAdminAccessEffective() {
  const [data, setData] = useState<AdminAccessEffectiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/access/effective");
      if (!res.ok) throw new Error("Failed to load effective access");
      const json = (await res.json()) as {
        ok: true;
        data: AdminAccessEffectiveData;
      };
      setData(json.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load effective access");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Data-fetch on mount — setState runs after await (not synchronously).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
