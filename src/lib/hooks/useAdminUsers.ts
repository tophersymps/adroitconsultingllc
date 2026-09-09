"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminUserListRow,
  EntitlementSource,
  GrantEntitlementRequest,
  UserRole,
} from "@/shared/contracts-course-catalog";

/** GET /api/admin/users?q= → list; role assignment + grant/revoke helpers. */
export function useAdminUsers() {
  const [rows, setRows] = useState<AdminUserListRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (q: string) => {
    try {
      const url = q
        ? `/api/admin/users?q=${encodeURIComponent(q)}`
        : "/api/admin/users";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load users");
      const json = (await res.json()) as { ok: true; data: AdminUserListRow[] };
      setRows(json.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Data-fetch on mount/query change — setState runs after await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(query);
  }, [refresh, query]);

  async function setRole(userId: string, role: UserRole): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, role } satisfies {
          userId: string;
          role: UserRole;
        }),
      });
      if (!res.ok) return false;
      await refresh(query);
      return true;
    } catch {
      return false;
    }
  }

  async function grant(
    body: GrantEntitlementRequest & { source?: "granted" | "one-time" },
  ): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return false;
      await refresh(query);
      return true;
    } catch {
      return false;
    }
  }

  async function revoke(userId: string, courseId: string): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/entitlements", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, courseId } satisfies GrantEntitlementRequest),
      });
      if (!res.ok) return false;
      await refresh(query);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Adjust = revoke + regrant one-time↔granted in one composite action, one
   * audit row (arch §2.5 / §5.3). `from` is the active source to revoke; the
   * entitlement is re-granted under `to`. Returns the success of both steps.
   */
  async function adjustSource(args: {
    userId: string;
    courseId: string;
    from: EntitlementSource;
    to: EntitlementSource;
  }): Promise<boolean> {
    const revoked = await revoke(args.userId, args.courseId);
    if (!revoked) return false;
    const granted = await grant({
      userId: args.userId,
      courseId: args.courseId,
      source: args.to,
      note: `adjusted ${args.from} → ${args.to}`,
    });
    if (granted) await refresh(query);
    return granted;
  }

  return { rows, loading, error, query, setQuery, setRole, grant, revoke, adjustSource };
}

export type { EntitlementSource };
