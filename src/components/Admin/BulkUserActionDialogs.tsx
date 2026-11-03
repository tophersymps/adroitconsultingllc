"use client";

import { useState } from "react";
import type { AdminCourseListRow } from "@/shared/contracts-course-catalog";

interface BulkGrantCourseDialogProps {
  open: boolean;
  userCount: number;
  courses: AdminCourseListRow[];
  onClose: () => void;
  onConfirm: (courseId: string, source: "granted" | "one-time") => Promise<void>;
}

export function BulkGrantCourseDialog({
  open,
  userCount,
  courses,
  onClose,
  onConfirm,
}: BulkGrantCourseDialogProps) {
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.course.id ?? "");
  const [source, setSource] = useState<"granted" | "one-time">("granted");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCourseId) return;
    setBusy(true);
    try {
      await onConfirm(selectedCourseId, source);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--surface-card)] p-6 shadow-xl"
        style={{ borderColor: "var(--admin-table-border)" }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
          <h3 className="text-base font-bold text-[var(--ink-primary)]">
            Grant Course Access in Bulk
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 font-mono text-xs text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-xs text-[var(--ink-muted)]">
            Grant course access to all <b className="text-[var(--ink-primary)]">{userCount}</b> selected user{userCount > 1 ? "s" : ""}.
          </p>

          <div>
            <label className="block text-xs font-semibold text-[var(--ink-primary)] mb-1">
              Course
            </label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full rounded-lg border text-xs px-3 py-2 bg-[var(--surface-card)] text-[var(--ink-primary)] focus:outline-blue-500"
              style={{ borderColor: "var(--admin-table-border)" }}
            >
              {courses.map(({ course }) => (
                <option key={course.id} value={course.id}>
                  {course.title} ({course.series_slug})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--ink-primary)] mb-1">
              Entitlement Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-xs transition-colors ${
                  source === "granted"
                    ? "border-blue-600 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold"
                    : "border-[var(--admin-table-border)] hover:bg-[var(--surface-card-soft)]"
                }`}
              >
                <span>Direct Admin Grant</span>
                <input
                  type="radio"
                  name="source"
                  value="granted"
                  checked={source === "granted"}
                  onChange={() => setSource("granted")}
                  className="accent-blue-600"
                />
              </label>

              <label
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-xs transition-colors ${
                  source === "one-time"
                    ? "border-purple-600 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold"
                    : "border-[var(--admin-table-border)] hover:bg-[var(--surface-card-soft)]"
                }`}
              >
                <span>One-Time Pass</span>
                <input
                  type="radio"
                  name="source"
                  value="one-time"
                  checked={source === "one-time"}
                  onChange={() => setSource("one-time")}
                  className="accent-purple-600"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--admin-table-border)" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              style={{ borderColor: "var(--admin-table-border)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !selectedCourseId}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
            >
              {busy ? "Granting…" : `Grant to ${userCount} User${userCount > 1 ? "s" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface BulkFreezeDialogProps {
  open: boolean;
  userCount: number;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function BulkFreezeDialog({
  open,
  userCount,
  onClose,
  onConfirm,
}: BulkFreezeDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm(reason);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--surface-card)] p-6 shadow-xl"
        style={{ borderColor: "var(--admin-table-border)" }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
          <h3 className="text-base font-bold text-amber-700 dark:text-amber-400">
            Batch Freeze Accounts
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 font-mono text-xs text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-xs text-[var(--ink-muted)]">
            Freezing will immediately revoke active sessions and prevent login for all <b className="text-[var(--ink-primary)]">{userCount}</b> selected user{userCount > 1 ? "s" : ""}. (Admins cannot freeze their own account).
          </p>

          <div>
            <label className="block text-xs font-semibold text-[var(--ink-primary)] mb-1">
              Reason / Note (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Inactive review, terms audit, temporary suspension"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border text-xs px-3 py-2 bg-[var(--surface-card)] text-[var(--ink-primary)] focus:outline-amber-500"
              style={{ borderColor: "var(--admin-table-border)" }}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--admin-table-border)" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              style={{ borderColor: "var(--admin-table-border)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 shadow-sm"
            >
              {busy ? "Freezing…" : `Freeze ${userCount} Account${userCount > 1 ? "s" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface BulkDeleteDialogProps {
  open: boolean;
  userCount: number;
  onClose: () => void;
  onConfirm: (mode: "soft" | "hard") => Promise<void>;
}

export function BulkDeleteDialog({
  open,
  userCount,
  onClose,
  onConfirm,
}: BulkDeleteDialogProps) {
  const [mode, setMode] = useState<"soft" | "hard">("soft");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "hard" && confirmText.trim() !== "DELETE") return;
    setBusy(true);
    try {
      await onConfirm(mode);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-lg rounded-2xl border bg-[var(--surface-card)] p-6 shadow-xl"
        style={{ borderColor: "var(--admin-table-border)" }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
          <h3 className="text-base font-bold text-red-700 dark:text-red-400">
            Batch Delete Users ({userCount})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 font-mono text-xs text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <label
              className={`block cursor-pointer rounded-xl border p-3.5 transition-colors ${
                mode === "soft"
                  ? "border-amber-500/70 bg-amber-500/10"
                  : "border-[var(--admin-table-border)] hover:bg-[var(--surface-card-soft)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--ink-primary)]">
                  Soft Delete — 30-Day Recovery (Recommended)
                </span>
                <input
                  type="radio"
                  name="bulk-del-mode"
                  checked={mode === "soft"}
                  onChange={() => setMode("soft")}
                  className="accent-amber-600"
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                Immediately disables login while preserving lesson progress and course entitlements for 30 days. Accounts can be restored anytime during the recovery window.
              </p>
            </label>

            <label
              className={`block cursor-pointer rounded-xl border p-3.5 transition-colors ${
                mode === "hard"
                  ? "border-red-500/70 bg-red-500/10"
                  : "border-[var(--admin-table-border)] hover:bg-[var(--surface-card-soft)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-700 dark:text-red-400">
                  Permanent Hard Purge (Irreversible)
                </span>
                <input
                  type="radio"
                  name="bulk-del-mode"
                  checked={mode === "hard"}
                  onChange={() => setMode("hard")}
                  className="accent-red-600"
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                Permanently deletes the auth identity and cascades deletion across all progress, quiz history, and course entitlements. Cannot be undone.
              </p>
            </label>
          </div>

          {mode === "hard" && (
            <div>
              <label className="block text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                Type <b>DELETE</b> to confirm permanent purge:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-lg border border-red-500/40 bg-[var(--surface-card)] px-3 py-2 font-mono text-xs text-[var(--ink-primary)] focus:border-red-500 focus:outline-hidden"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--admin-table-border)" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              style={{ borderColor: "var(--admin-table-border)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || (mode === "hard" && confirmText.trim() !== "DELETE")}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50 shadow-sm ${
                mode === "hard" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {busy ? "Deleting…" : mode === "hard" ? `Permanently Purge ${userCount} Users` : `Soft Delete ${userCount} Users`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface BulkResetPasswordDialogProps {
  open: boolean;
  userCount: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function BulkResetPasswordDialog({
  open,
  userCount,
  onClose,
  onConfirm,
}: BulkResetPasswordDialogProps) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--surface-card)] p-6 shadow-xl space-y-4"
        style={{ borderColor: "var(--admin-table-border)" }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
          <h3 className="text-base font-bold text-[var(--ink-primary)]">
            Send Password Reset Emails
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 font-mono text-xs text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-[var(--ink-muted)]">
          Are you sure you want to send official password-setup / reset links to all <b className="text-[var(--ink-primary)]">{userCount}</b> selected users?
        </p>

        <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--admin-table-border)" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            style={{ borderColor: "var(--admin-table-border)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm"
          >
            {busy ? "Sending…" : `Send to ${userCount} Users`}
          </button>
        </div>
      </div>
    </div>
  );
}
