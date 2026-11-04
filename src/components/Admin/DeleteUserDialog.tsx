"use client";

import { useState } from "react";
import type { AdminUserListRow } from "@/shared/contracts-course-catalog";
import type { LifecycleMutationResult } from "@/lib/hooks/useAdminUsers";

interface DeleteUserDialogProps {
  user: AdminUserListRow;
  onClose: () => void;
  onDelete: (
    userId: string,
    mode: "soft" | "hard",
  ) => Promise<LifecycleMutationResult>;
}

export default function DeleteUserDialog({
  user,
  onClose,
  onDelete,
}: DeleteUserDialogProps) {
  const isAlreadyTombstoned = user.status === "tombstoned" || Boolean(user.deleted_at);
  const [mode, setMode] = useState<"soft" | "hard">(
    isAlreadyTombstoned ? "hard" : "soft",
  );
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hardConfirmed =
    confirmText.trim().toLowerCase() === user.email.toLowerCase() ||
    confirmText.trim().toUpperCase() === "DELETE";

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "hard" && !hardConfirmed) {
      setError(`Type "${user.email}" or "DELETE" to confirm permanent deletion.`);
      return;
    }

    setBusy(true);
    try {
      const res = await onDelete(user.user_id, mode);
      if (!res.ok) {
        setError(res.error ?? "Failed to delete user.");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-user-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-lg rounded-lg border border-[var(--admin-table-border)] bg-[var(--surface-card)] p-6 shadow-xl"
        style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-table-border)] pb-3">
          <div>
            <h2
              id="delete-user-dialog-title"
              className="text-base font-semibold tracking-tight text-[var(--ink-primary)]"
            >
              Delete User Account
            </h2>
            <p className="mt-0.5 font-mono text-xs text-[var(--ink-muted)]">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded px-2 py-1 font-mono text-xs text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-primary)]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleConfirm} className="mt-4 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="space-y-2.5">
            {!isAlreadyTombstoned && (
              <label
                className={`block cursor-pointer rounded-md border p-3 transition-colors ${
                  mode === "soft"
                    ? "border-amber-500/50 bg-amber-500/[0.07]"
                    : "border-[var(--admin-table-border)] hover:bg-[var(--surface-card-soft)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="delete-mode"
                    value="soft"
                    checked={mode === "soft"}
                    onChange={() => setMode("soft")}
                  />
                  <span className="text-xs font-semibold text-[var(--ink-primary)]">
                    Soft Delete — 30-Day Tombstone Recovery (Recommended)
                  </span>
                </div>
                <p className="mt-1 pl-5 text-[11px] leading-relaxed text-[var(--ink-muted)]">
                  Immediately revokes login credentials and active sessions, but preserves lesson progress, quiz history, and course entitlements for 30 days in case this account needs to be restored.
                </p>
              </label>
            )}

            <label
              className={`block cursor-pointer rounded-md border p-3 transition-colors ${
                mode === "hard"
                  ? "border-red-500/50 bg-red-500/[0.07]"
                  : "border-[var(--admin-table-border)] hover:bg-[var(--surface-card-soft)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="delete-mode"
                  value="hard"
                  checked={mode === "hard"}
                  onChange={() => setMode("hard")}
                />
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                  Permanent Hard Delete (Irreversible)
                </span>
              </div>
              <p className="mt-1 pl-5 text-[11px] leading-relaxed text-[var(--ink-muted)]">
                Immediately purges the auth identity and cascades deletion across all 9 user data tables (entitlements, lesson completions, quiz attempts, profile, and role). Audit logs are retained in anonymized form.
              </p>
            </label>
          </div>

          {mode === "hard" && (
            <label className="block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                Type &ldquo;DELETE&rdquo; or &ldquo;{user.email}&rdquo; to confirm permanent purge
              </span>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="mt-1 w-full rounded border border-red-500/40 bg-[var(--surface-card)] px-2.5 py-1.5 font-mono text-xs text-[var(--ink-primary)] focus:border-red-500 focus:outline-hidden"
              />
            </label>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[var(--admin-table-border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded border border-[var(--admin-table-border)] px-3 py-1.5 font-mono text-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || (mode === "hard" && !hardConfirmed)}
              className={`rounded px-3.5 py-1.5 font-mono text-xs font-medium text-white disabled:opacity-50 ${
                mode === "hard"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {busy
                ? "Deleting…"
                : mode === "hard"
                  ? "Permanently Delete"
                  : "Soft Delete (30d Recovery)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
