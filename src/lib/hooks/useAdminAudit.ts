"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminAuditLogRow } from "@/shared/contracts-course-catalog";

/** Audit filters (v4, t_0ed19ad0): action type + acting user. */
export interface AuditFilters {
  action?: string;
  actor?: string;
}

/** GET /api/admin/audit → audit log rows, newest first, with filters. */
export function useAdminAudit(limit = 100, filters: AuditFilters = {}) {
  const [rows, setRows] = useState<AdminAuditLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (filters.action) params.set("action", filters.action);
      if (filters.actor) params.set("actor", filters.actor);
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load audit log");
      const json = (await res.json()) as { ok: true; data: AdminAuditLogRow[] };
      setRows(json.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [limit, filters.action, filters.actor]);

  useEffect(() => {
    // Data-fetch on mount/filter change — setState runs after await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}
