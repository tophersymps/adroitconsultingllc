"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminBulkUsersRequest,
  AdminBulkUsersResult,
  AdminUserListRow,
  EntitlementSource,
  GrantEntitlementRequest,
  UserRole,
} from "@/shared/contracts-course-catalog";

export interface CreateAdminUserInput {
  email: string;
  display_name?: string;
  role?: UserRole;
  course_ids?: string[];
  send_invite?: boolean;
}

export interface CreateAdminUserResult {
  ok: boolean;
  error?: string;
  user_id?: string;
  invite_sent?: boolean;
}

export interface LifecycleMutationResult {
  ok: boolean;
  error?: string;
  revoked_sessions?: number;
  reset_email_sent?: boolean;
}

/** GET /api/admin/users?q= → list; role assignment + grant/revoke + lifecycle helpers. */
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
   * Adjust = revoke + regrant one-time↔granted in one composite action.
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

  async function createUser(
    input: CreateAdminUserInput,
  ): Promise<CreateAdminUserResult> {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        data?: { user_id?: string; invite_sent?: boolean };
      };
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? "Failed to create user" };
      }
      await refresh(query);
      return {
        ok: true,
        user_id: json.data?.user_id,
        invite_sent: json.data?.invite_sent,
      };
    } catch {
      return { ok: false, error: "Network error while creating user" };
    }
  }

  async function setFrozenStatus(
    userId: string,
    action: "freeze" | "unfreeze",
    reason?: string,
  ): Promise<LifecycleMutationResult> {
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        data?: { revoked_sessions?: number };
      };
      if (!res.ok || !json.ok) {
        return {
          ok: false,
          error: json.error ?? `Failed to ${action} account`,
        };
      }
      await refresh(query);
      return {
        ok: true,
        revoked_sessions: json.data?.revoked_sessions ?? 0,
      };
    } catch {
      return { ok: false, error: `Network error while trying to ${action} account` };
    }
  }

  async function sendPasswordReset(
    userId: string,
    revokeSessions = false,
  ): Promise<LifecycleMutationResult> {
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revoke_sessions: revokeSessions }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        data?: { revoked_sessions?: number };
      };
      if (!res.ok || !json.ok) {
        return {
          ok: false,
          error: json.error ?? "Failed to send password reset email",
        };
      }
      return {
        ok: true,
        revoked_sessions: json.data?.revoked_sessions ?? 0,
      };
    } catch {
      return { ok: false, error: "Network error while sending reset email" };
    }
  }

  async function deleteUser(
    userId: string,
    mode: "soft" | "hard" = "soft",
  ): Promise<LifecycleMutationResult> {
    try {
      const res = await fetch(
        `/api/admin/users/${userId}?mode=${encodeURIComponent(mode)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? "Failed to delete user" };
      }
      await refresh(query);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error while deleting user" };
    }
  }

  async function restoreUser(
    userId: string,
    sendResetEmail = true,
  ): Promise<LifecycleMutationResult> {
    try {
      const res = await fetch(`/api/admin/users/${userId}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ send_reset_email: sendResetEmail }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        data?: { reset_email_sent?: boolean };
      };
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? "Failed to restore user" };
      }
      await refresh(query);
      return {
        ok: true,
        reset_email_sent: json.data?.reset_email_sent,
      };
    } catch {
      return { ok: false, error: "Network error while restoring user" };
    }
  }
  async function bulkMutateUsers(
    input: AdminBulkUsersRequest,
  ): Promise<AdminBulkUsersResult> {
    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as AdminBulkUsersResult & { error?: string };
      if (!res.ok) {
        return {
          ok: false,
          action: input.action,
          total: input.userIds.length,
          succeeded: 0,
          failed: input.userIds.length,
          errors: [{ userId: "all", error: json.error ?? "Bulk mutation failed" }],
        };
      }
      return json;
    } catch {
      return {
        ok: false,
        action: input.action,
        total: input.userIds.length,
        succeeded: 0,
        failed: input.userIds.length,
        errors: [{ userId: "all", error: "Network error during bulk operation" }],
      };
    }
  }

  return {
    rows,
    loading,
    error,
    query,
    setQuery,
    setRole,
    grant,
    revoke,
    adjustSource,
    createUser,
    setFrozenStatus,
    sendPasswordReset,
    deleteUser,
    restoreUser,
    bulkMutateUsers,
  };
}

export type { EntitlementSource };
