"use client";

import { useState } from "react";
import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import {
  useAdminUsers,
  type CreateAdminUserInput,
  type CreateAdminUserResult,
  type LifecycleMutationResult,
} from "@/lib/hooks/useAdminUsers";
import { AccessPanel } from "@/components/Admin/AccessPanel";
import AdminToast, { type AdminToastMessage } from "@/components/Admin/AdminToast";
import type { EntitlementSource, UserRole } from "@/shared/contracts-course-catalog";

/**
 * /admin/users — Access · People (person-first lens, ADR-222) + User Lifecycle.
 * Search a person, manage their account lifecycle (invite/create, password
 * reset email, freeze/unfreeze, soft tombstone delete, restore, or permanent
 * purge), and manage their full effective course access inline.
 */
export default function AdminUsersPage() {
  const { data, loading, error, refresh } = useAdminAccessEffective();
  const usersHook = useAdminUsers();
  const [toast, setToast] = useState<AdminToastMessage | null>(null);

  async function onSetRole(userId: string, role: UserRole): Promise<boolean> {
    const ok = Boolean(await usersHook.setRole(userId, role));
    if (ok) await refresh?.();
    setToast({
      text: ok ? "Role updated" : "Role update failed",
      tone: ok ? "success" : "error",
    });
    return ok;
  }

  async function onGrant(
    userId: string,
    courseId: string,
    source: "granted" | "one-time",
  ): Promise<boolean> {
    const ok = Boolean(await usersHook.grant({ userId, courseId, source }));
    if (ok) await refresh?.();
    setToast({
      text: ok
        ? `Granted ${source === "one-time" ? "one-time" : "access"}`
        : "Grant failed",
      tone: ok ? "success" : "error",
    });
    return ok;
  }

  async function onRevoke(userId: string, courseId: string): Promise<boolean> {
    const ok = Boolean(await usersHook.revoke(userId, courseId));
    if (ok) await refresh?.();
    setToast({
      text: ok ? "Revoked" : "Revoke failed",
      tone: ok ? "success" : "error",
    });
    return ok;
  }

  async function onAdjust(
    userId: string,
    courseId: string,
    from: EntitlementSource,
    to: EntitlementSource,
  ): Promise<boolean> {
    const ok = Boolean(
      await usersHook.adjustSource({ userId, courseId, from, to }),
    );
    if (ok) await refresh?.();
    setToast({
      text: ok ? `Adjusted ${from} → ${to}` : "Adjust failed",
      tone: ok ? "success" : "error",
    });
    return ok;
  }

  async function onCreateUser(
    input: CreateAdminUserInput,
  ): Promise<CreateAdminUserResult> {
    const res = usersHook.createUser
      ? await usersHook.createUser(input)
      : { ok: false, error: "Create user unavailable" };
    if (res.ok) {
      await refresh?.();
      setToast({
        text: res.invite_sent
          ? `Created ${input.email} and sent password-setup link`
          : `Created ${input.email}`,
        tone: "success",
      });
    } else {
      setToast({
        text: res.error ?? "Failed to create user",
        tone: "error",
      });
    }
    return res;
  }

  async function onSetFrozenStatus(
    userId: string,
    action: "freeze" | "unfreeze",
    reason?: string,
  ): Promise<LifecycleMutationResult> {
    const res = usersHook.setFrozenStatus
      ? await usersHook.setFrozenStatus(userId, action, reason)
      : { ok: false, error: "Status update unavailable" };
    if (res.ok) {
      await refresh?.();
      setToast({
        text:
          action === "freeze"
            ? `Account frozen (${res.revoked_sessions ?? 0} session(s) revoked)`
            : "Account unfrozen",
        tone: "success",
      });
    } else {
      setToast({
        text: res.error ?? `Failed to ${action} account`,
        tone: "error",
      });
    }
    return res;
  }

  async function onSendPasswordReset(
    userId: string,
    revokeSessions = false,
  ): Promise<LifecycleMutationResult> {
    const res = usersHook.sendPasswordReset
      ? await usersHook.sendPasswordReset(userId, revokeSessions)
      : { ok: false, error: "Password reset unavailable" };
    setToast({
      text: res.ok
        ? "Password reset link sent to user's email"
        : (res.error ?? "Failed to send password reset email"),
      tone: res.ok ? "success" : "error",
    });
    return res;
  }

  async function onDeleteUser(
    userId: string,
    mode: "soft" | "hard",
  ): Promise<LifecycleMutationResult> {
    const res = usersHook.deleteUser
      ? await usersHook.deleteUser(userId, mode)
      : { ok: false, error: "Delete unavailable" };
    if (res.ok) {
      await refresh?.();
      setToast({
        text:
          mode === "hard"
            ? "User permanently deleted"
            : "User soft-deleted (30-day recovery window active)",
        tone: "success",
      });
    } else {
      setToast({
        text: res.error ?? "Failed to delete user",
        tone: "error",
      });
    }
    return res;
  }

  async function onRestoreUser(
    userId: string,
    sendResetEmail = true,
  ): Promise<LifecycleMutationResult> {
    const res = usersHook.restoreUser
      ? await usersHook.restoreUser(userId, sendResetEmail)
      : { ok: false, error: "Restore unavailable" };
    if (res.ok) {
      await refresh?.();
      setToast({
        text: res.reset_email_sent
          ? "Account restored and password reset email sent"
          : "Account restored",
        tone: "success",
      });
    } else {
      setToast({
        text: res.error ?? "Failed to restore account",
        tone: "error",
      });
    }
    return res;
  }

  if (loading && !data) {
    return (
      <p role="status" className="text-sm text-gray-500">
        Loading people…
      </p>
    );
  }
  if (error) {
    return (
      <p role="status" className="text-sm text-red-600">
        {error}
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">
            People
          </h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-0.5 max-w-[780px]">
            Person-first lens — search, invite users, manage account lifecycle
            (password reset, freeze/suspend, 30-day soft delete or permanent
            purge), and adjust per-course effective access inline. Every write
            records an audit row.
          </p>
        </div>
      </div>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      {data && (
        <AccessPanel
          users={data.users}
          courses={data.courses}
          matrix={data.matrix}
          onSetRole={onSetRole}
          onGrant={onGrant}
          onRevoke={onRevoke}
          onAdjust={onAdjust}
          onCreateUser={onCreateUser}
          onSetFrozenStatus={onSetFrozenStatus}
          onSendPasswordReset={onSendPasswordReset}
          onDeleteUser={onDeleteUser}
          onRestoreUser={onRestoreUser}
        />
      )}
    </div>
  );
}
