"use client";

import { useMemo, useState } from "react";
import type {
  AdminCourseListRow,
  AdminUserListRow,
  EntitlementSource,
  UserRole,
} from "@/shared/contracts-course-catalog";
import type { EffectiveAccessState } from "@/lib/access";
import type {
  CreateAdminUserInput,
  CreateAdminUserResult,
  LifecycleMutationResult,
} from "@/lib/hooks/useAdminUsers";
import { EffectiveAccessChip } from "./EffectiveAccessChip";
import CreateUserDialog from "./CreateUserDialog";
import DeleteUserDialog from "./DeleteUserDialog";

type PeopleFilter =
  | "all"
  | "admins"
  | "granted"
  | "frozen"
  | "unverified"
  | "tombstoned";

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRecoveryDaysRemaining(deletedAt: string | null | undefined): number {
  if (!deletedAt) return 30;
  const deletedMs = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedMs)) return 30;
  const elapsedDays = Math.floor((Date.now() - deletedMs) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - elapsedDays);
}

/**
 * AccessPanel — person-first lens (People, ADR-222) + User Lifecycle Controls.
 * Roster on the left, detail panel on the right. Selecting a person shows their
 * role, account lifecycle toolbar (Reset Password, Freeze/Unfreeze, Soft/Hard
 * Delete, Restore), metadata strip, subscription panel, and per-course
 * effective-access rows.
 */
export function AccessPanel({
  users,
  courses,
  matrix,
  onSetRole,
  onGrant,
  onRevoke,
  onAdjust,
  onCreateUser,
  onSetFrozenStatus,
  onSendPasswordReset,
  onDeleteUser,
  onRestoreUser,
}: {
  users: AdminUserListRow[];
  courses: AdminCourseListRow[];
  matrix: Record<string, Record<string, EffectiveAccessState>>;
  onSetRole: (userId: string, role: UserRole) => Promise<boolean>;
  onGrant: (userId: string, courseId: string, source: "granted" | "one-time") => Promise<boolean>;
  onRevoke: (userId: string, courseId: string) => Promise<boolean>;
  onAdjust: (userId: string, courseId: string, from: EntitlementSource, to: EntitlementSource) => Promise<boolean>;
  onCreateUser?: (input: CreateAdminUserInput) => Promise<CreateAdminUserResult>;
  onSetFrozenStatus?: (
    userId: string,
    action: "freeze" | "unfreeze",
    reason?: string,
  ) => Promise<LifecycleMutationResult>;
  onSendPasswordReset?: (
    userId: string,
    revokeSessions?: boolean,
  ) => Promise<LifecycleMutationResult>;
  onDeleteUser?: (
    userId: string,
    mode: "soft" | "hard",
  ) => Promise<LifecycleMutationResult>;
  onRestoreUser?: (
    userId: string,
    sendResetEmail?: boolean,
  ) => Promise<LifecycleMutationResult>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    users[0]?.user_id ?? null,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUserListRow | null>(null);
  const [freezePromptOpen, setFreezePromptOpen] = useState(false);
  const [freezeReason, setFreezeReason] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const counts = useMemo(() => {
    let activeOrFrozen = 0;
    let admins = 0;
    let granted = 0;
    let frozen = 0;
    let unverified = 0;
    let tombstoned = 0;
    for (const u of users) {
      const isTomb = u.status === "tombstoned" || Boolean(u.deleted_at);
      const isFrz = u.status === "frozen" || Boolean(u.frozen_at);
      if (isTomb) {
        tombstoned += 1;
        continue;
      }
      activeOrFrozen += 1;
      if (u.role === "admin") admins += 1;
      if (Object.keys(u.entitlements ?? {}).length > 0) granted += 1;
      if (isFrz) frozen += 1;
      if (u.email_verified === false) unverified += 1;
    }
    return { activeOrFrozen, admins, granted, frozen, unverified, tombstoned };
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      const isTomb = u.status === "tombstoned" || Boolean(u.deleted_at);
      const isFrz = u.status === "frozen" || Boolean(u.frozen_at);

      if (filter === "tombstoned") {
        if (!isTomb) return false;
      } else {
        // Hide tombstoned accounts from active views unless explicitly searching or filtering Deleted
        if (isTomb && !q) return false;
        if (filter === "admins" && u.role !== "admin") return false;
        if (filter === "granted" && Object.keys(u.entitlements ?? {}).length === 0) {
          return false;
        }
        if (filter === "frozen" && !isFrz) return false;
        if (filter === "unverified" && u.email_verified !== false) return false;
      }

      if (!q) return true;
      return (
        (u.display_name ?? u.email).toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q)
      );
    });
  }, [users, query, filter]);

  const selected =
    users.find((u) => u.user_id === selectedId) ?? filtered[0] ?? null;

  const isSelectedTombstoned =
    selected?.status === "tombstoned" || Boolean(selected?.deleted_at);
  const isSelectedFrozen =
    selected?.status === "frozen" || Boolean(selected?.frozen_at);

  async function handleResetPassword(revokeSessions = false) {
    if (!selected || !onSendPasswordReset) return;
    setActionBusy("reset-pwd");
    try {
      await onSendPasswordReset(selected.user_id, revokeSessions);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleFreezeToggle(action: "freeze" | "unfreeze") {
    if (!selected || !onSetFrozenStatus) return;
    setActionBusy(action);
    try {
      const res = await onSetFrozenStatus(
        selected.user_id,
        action,
        action === "freeze" ? freezeReason.trim() || undefined : undefined,
      );
      if (res.ok) {
        setFreezePromptOpen(false);
        setFreezeReason("");
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRestore() {
    if (!selected || !onRestoreUser) return;
    setActionBusy("restore");
    try {
      await onRestoreUser(selected.user_id, true);
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[390px_1fr] gap-5 items-start">
      {/* Roster */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          borderColor: "var(--admin-table-border)",
          background: "var(--surface-card, #FFFFFF)",
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 border-b"
          style={{ borderColor: "var(--admin-table-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <h2 className="text-[13.5px] font-bold text-[var(--ink-primary)]">
              People
            </h2>
            <span className="font-mono text-[10.5px] text-[var(--ink-faint)] bg-[var(--surface-sunken)] px-2 py-0.5 rounded-full">
              {counts.activeOrFrozen}
            </span>
          </div>
          {onCreateUser && (
            <button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--color-navy)" }}
            >
              + Add / Invite User
            </button>
          )}
        </div>

        <div
          className="px-4 py-2.5 border-b space-y-2"
          style={{ borderColor: "var(--admin-table-border)" }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or user ID…"
            aria-label="Search people"
            className="w-full rounded-lg border text-[12.5px] px-3 py-2 bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            style={{ borderColor: "var(--admin-table-border)" }}
          />
          <div className="flex flex-wrap gap-1">
            {(
              [
                { id: "all", label: `All (${counts.activeOrFrozen})` },
                { id: "admins", label: `Admins (${counts.admins})` },
                { id: "granted", label: `Granted (${counts.granted})` },
                ...(counts.frozen > 0
                  ? [{ id: "frozen", label: `Frozen (${counts.frozen})` }]
                  : [{ id: "frozen", label: "Frozen" }]),
                ...(counts.unverified > 0
                  ? [
                      {
                        id: "unverified",
                        label: `Unverified (${counts.unverified})`,
                      },
                    ]
                  : []),
                {
                  id: "tombstoned",
                  label:
                    counts.tombstoned > 0
                      ? `Deleted (${counts.tombstoned})`
                      : "Deleted",
                },
              ] as { id: PeopleFilter; label: string }[]
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setFilter(pill.id)}
                className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold transition-colors ${
                  filter === pill.id
                    ? "bg-[var(--color-navy)] text-white"
                    : "bg-[var(--surface-sunken)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[640px] overflow-y-auto">
          {filtered.map((u) => {
            const isTomb = u.status === "tombstoned" || Boolean(u.deleted_at);
            const isFrz = u.status === "frozen" || Boolean(u.frozen_at);
            return (
              <button
                key={u.user_id}
                type="button"
                onClick={() => {
                  setSelectedId(u.user_id);
                  setFreezePromptOpen(false);
                }}
                aria-current={selected?.user_id === u.user_id ? "true" : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  selected?.user_id === u.user_id
                    ? "bg-[var(--admin-selected-bg)] shadow-[inset_3px_0_0_var(--color-red)]"
                    : "hover:bg-[var(--surface-sunken)]"
                }`}
                style={{
                  borderBottom: "1px solid var(--border-subtle, #F3F4F6)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{
                    background: isTomb
                      ? "#6B7280"
                      : isFrz
                        ? "#D97706"
                        : u.subscription
                          ? "var(--gov-sub-active)"
                          : "var(--color-navy)",
                  }}
                >
                  {(u.display_name ?? u.email).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-[var(--ink-primary)] truncate">
                      {u.display_name ?? u.email}
                    </span>
                    {isTomb && (
                      <span className="font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/15 text-red-700">
                        deleted
                      </span>
                    )}
                    {!isTomb && isFrz && (
                      <span className="font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700">
                        frozen
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--ink-faint)] truncate">
                    {u.email}
                  </div>
                </div>
                <span
                  className={`ml-auto font-mono text-[9.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${
                    u.role === "admin"
                      ? "text-[var(--color-red)] bg-[var(--admin-selected-bg)]"
                      : "text-[var(--ink-muted)] bg-[var(--surface-sunken)]"
                  }`}
                >
                  {u.role}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500">No people found.</p>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          borderColor: "var(--admin-table-border)",
          background: "var(--surface-card, #FFFFFF)",
        }}
      >
        {!selected ? (
          <p className="px-6 py-10 text-sm text-gray-500">
            Select a person to view their access.
          </p>
        ) : (
          <>
            {/* Detail header */}
            <div
              className="flex flex-wrap items-center gap-4 px-6 py-4 border-b"
              style={{ borderColor: "var(--admin-table-border)" }}
            >
              <div
                className="w-11 h-11 rounded-full text-white flex items-center justify-center text-[15px] font-bold shrink-0"
                style={{
                  background: isSelectedTombstoned
                    ? "#6B7280"
                    : isSelectedFrozen
                      ? "#D97706"
                      : "var(--color-navy)",
                }}
              >
                {(selected.display_name ?? selected.email)
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-bold text-[var(--ink-primary)]">
                    {selected.display_name ?? selected.email}
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full text-[var(--color-red)] bg-[var(--admin-selected-bg)]">
                    {selected.role}
                  </span>
                  {isSelectedTombstoned ? (
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-700">
                      Tombstoned ({getRecoveryDaysRemaining(selected.deleted_at)}d recovery left)
                    </span>
                  ) : isSelectedFrozen ? (
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
                      Frozen
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">
                      Active
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-[var(--ink-faint)] mt-0.5">
                  {selected.email} · <span title={selected.user_id}>{selected.user_id.slice(0, 8)}…</span>
                </div>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                  Role
                </label>
                <select
                  value={selected.role}
                  disabled={isSelectedTombstoned}
                  onChange={(e) =>
                    onSetRole(selected.user_id, e.target.value as UserRole)
                  }
                  aria-label={`Role for ${selected.display_name ?? selected.email}`}
                  className="rounded-lg border text-[12.5px] px-2.5 py-1.5 bg-[var(--surface-card)] disabled:opacity-50"
                  style={{ borderColor: "var(--admin-table-border)" }}
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>

            {/* Metadata & Account Lifecycle Toolbar */}
            <div
              className="px-6 py-3.5 border-b bg-[var(--surface-sunken)]/60 space-y-3"
              style={{ borderColor: "var(--admin-table-border)" }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11.5px]">
                <div>
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Email Status
                  </div>
                  <div className="font-semibold text-[var(--ink-primary)] mt-0.5">
                    {selected.email_verified === false ? (
                      <span className="text-amber-700">Unverified</span>
                    ) : (
                      <span className="text-emerald-700">Verified</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Auth Provider
                  </div>
                  <div className="font-mono font-semibold text-[var(--ink-primary)] mt-0.5">
                    {selected.provider ?? "credential"}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Joined
                  </div>
                  <div className="font-mono text-[var(--ink-primary)] mt-0.5">
                    {formatShortDate(selected.created_at)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Last Active / Sessions
                  </div>
                  <div className="font-mono text-[var(--ink-primary)] mt-0.5">
                    {formatShortDate(selected.last_seen_at)}
                    {typeof selected.active_session_count === "number" &&
                      selected.active_session_count > 0 && (
                        <span className="ml-1 text-[10px] text-emerald-700">
                          ({selected.active_session_count} live)
                        </span>
                      )}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Course Progress
                  </div>
                  <div className="font-mono font-semibold text-[var(--ink-primary)] mt-0.5">
                    {selected.lessons_completed_count ?? 0} lessons completed
                  </div>
                </div>
              </div>

              {isSelectedFrozen && selected.frozen_reason && (
                <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                  <b>Suspension note:</b> {selected.frozen_reason} (frozen{" "}
                  {formatShortDate(selected.frozen_at)})
                </div>
              )}

              {isSelectedTombstoned ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3.5 py-2.5 text-xs">
                  <div className="text-red-800">
                    <b>Soft-deleted account:</b> Login is disabled, but course entitlements and lesson progress are preserved until the 30-day recovery window expires.
                  </div>
                  <div className="flex items-center gap-2">
                    {onRestoreUser && (
                      <button
                        type="button"
                        disabled={actionBusy !== null}
                        onClick={handleRestore}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 font-mono text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {actionBusy === "restore"
                          ? "Restoring…"
                          : "Restore Account & Send Reset Link"}
                      </button>
                    )}
                    {onDeleteUser && (
                      <button
                        type="button"
                        disabled={actionBusy !== null}
                        onClick={() => setUserToDelete(selected)}
                        className="rounded-md border border-red-600/40 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-red-700 hover:bg-red-600 hover:text-white disabled:opacity-50"
                      >
                        Purge Permanently…
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)] mr-1">
                    Account Actions:
                  </span>
                  {onSendPasswordReset && (
                    <button
                      type="button"
                      disabled={actionBusy !== null}
                      onClick={() => handleResetPassword(false)}
                      className="rounded-md border px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-primary)] bg-[var(--surface-card)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
                      style={{ borderColor: "var(--admin-table-border)" }}
                    >
                      {actionBusy === "reset-pwd"
                        ? "Sending reset link…"
                        : "Send Password Reset Email"}
                    </button>
                  )}

                  {onSetFrozenStatus && (
                    <>
                      {isSelectedFrozen ? (
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => handleFreezeToggle("unfreeze")}
                          className="rounded-md border border-emerald-600/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-50"
                        >
                          {actionBusy === "unfreeze"
                            ? "Unfreezing…"
                            : "Unfreeze Account"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => setFreezePromptOpen((v) => !v)}
                          className="rounded-md border border-amber-600/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-600 hover:text-white transition-colors disabled:opacity-50"
                        >
                          Freeze Account…
                        </button>
                      )}
                    </>
                  )}

                  {onDeleteUser && (
                    <button
                      type="button"
                      disabled={actionBusy !== null}
                      onClick={() => setUserToDelete(selected)}
                      className="rounded-md border border-red-600/35 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50 ml-auto"
                    >
                      Delete User…
                    </button>
                  )}
                </div>
              )}

              {freezePromptOpen && !isSelectedFrozen && (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 bg-[var(--surface-card)]"
                  style={{ borderColor: "var(--admin-table-border)" }}
                >
                  <input
                    type="text"
                    value={freezeReason}
                    onChange={(e) => setFreezeReason(e.target.value)}
                    placeholder="Optional suspension reason (e.g., billing dispute, security hold)…"
                    aria-label="Suspension reason"
                    className="flex-1 min-w-[220px] rounded border px-2.5 py-1 text-xs bg-[var(--surface-sunken)]"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  />
                  <button
                    type="button"
                    disabled={actionBusy === "freeze"}
                    onClick={() => handleFreezeToggle("freeze")}
                    className="rounded bg-amber-600 px-3 py-1 font-mono text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {actionBusy === "freeze"
                      ? "Freezing…"
                      : "Confirm Freeze & Revoke Sessions"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFreezePromptOpen(false)}
                    className="rounded px-2 py-1 font-mono text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Subscription panel — honest empty today */}
            <div
              className="px-6 py-4 border-b"
              style={{ borderColor: "var(--admin-table-border)" }}
            >
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--ink-faint)] mb-2.5">
                Subscription{" "}
                <span className="normal-case tracking-normal text-[var(--ink-faint)] font-normal">
                  · subscriptions.status
                </span>
              </div>
              <div
                className="rounded-xl border border-dashed px-4 py-3"
                style={{
                  borderColor: "var(--admin-table-border)",
                  background: "var(--surface-sunken)",
                }}
              >
                {selected.subscription ? (
                  <>
                    <div className="text-[13.5px] font-bold text-[var(--ink-primary)]">
                      <span className="font-mono text-[var(--ink-muted)]">
                        {selected.subscription.status}
                      </span>
                      {" · "}
                      {selected.subscription.plan}
                    </div>
                    <div className="text-[11.5px] text-[var(--ink-muted)] mt-0.5">
                      Renews {selected.subscription.current_period_end ?? "—"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13.5px] font-bold">
                      <span className="font-mono text-[var(--ink-muted)]">
                        No active subscription
                      </span>
                    </div>
                    <div className="text-[11.5px] text-[var(--ink-muted)] mt-0.5">
                      Subscriber is a derived access state (an active/trialing sub),
                      not a role.
                    </div>
                    <div className="font-mono text-[10px] text-[var(--ink-faint)] mt-2">
                      Active · Trialing · Past due · Canceled resolve here when
                      billing ships —{" "}
                      <b style={{ color: "var(--signal-pending)" }}>
                        Coming with billing
                      </b>
                      .
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Per-course access rows */}
            <div className="px-6 py-4 pb-2">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--ink-faint)] mb-2">
                Course access{" "}
                <span className="normal-case tracking-normal font-normal">
                  · effective access, five states
                </span>
              </div>
            </div>
            {courses.map(({ course }) => {
              const state: EffectiveAccessState =
                matrix[selected.user_id]?.[course.id] ?? "none";
              const src = selected.entitlements[course.id];
              const subNote =
                state === "subscribed"
                  ? "active subscription grants it"
                  : state === "free"
                    ? "course.access_model = free"
                    : src
                      ? `user_entitlements · ${src}`
                      : state === "none"
                        ? course.status !== "live"
                          ? "course not live yet"
                          : "no path yet · locked"
                        : "";
              return (
                <div
                  key={course.id}
                  className="flex items-center gap-4 min-h-[56px] px-6 py-3"
                  style={{
                    borderTop: "1px solid var(--border-subtle, #F3F4F6)",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[var(--ink-primary)]">
                      {course.title}
                    </div>
                    <div className="font-mono text-[9.5px] text-[var(--ink-faint)]">
                      {course.series_slug}
                    </div>
                  </div>
                  <EffectiveAccessChip state={state} />
                  <div className="font-mono text-[10.5px] text-[var(--ink-faint)] w-[150px] hidden lg:block">
                    {subNote}
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end min-w-[220px]">
                    <RowActions
                      state={state}
                      src={src}
                      live={course.status === "live"}
                      disabled={isSelectedTombstoned}
                      onGrant={(s) => onGrant(selected.user_id, course.id, s)}
                      onRevoke={() => onRevoke(selected.user_id, course.id)}
                      onAdjust={(to) =>
                        onAdjust(selected.user_id, course.id, src!, to)
                      }
                    />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {showCreateDialog && onCreateUser && (
        <CreateUserDialog
          courses={courses}
          onClose={() => setShowCreateDialog(false)}
          onCreate={async (input) => {
            const res = await onCreateUser(input);
            if (res.ok && res.user_id) {
              setSelectedId(res.user_id);
            }
            return res;
          }}
        />
      )}

      {userToDelete && onDeleteUser && (
        <DeleteUserDialog
          user={userToDelete}
          onClose={() => setUserToDelete(null)}
          onDelete={async (userId, mode) => {
            const res = await onDeleteUser(userId, mode);
            if (res.ok && mode === "hard" && selectedId === userId) {
              setSelectedId(
                users.find((u) => u.user_id !== userId)?.user_id ?? null,
              );
            }
            return res;
          }}
        />
      )}
    </div>
  );
}

/** Per-row action buttons — the affordance itself (arch §1.4). */
function RowActions({
  state,
  src,
  live,
  disabled,
  onGrant,
  onRevoke,
  onAdjust,
}: {
  state: EffectiveAccessState;
  src?: EntitlementSource;
  live: boolean;
  disabled?: boolean;
  onGrant: (source: "granted" | "one-time") => void;
  onRevoke: () => void;
  onAdjust: (to: EntitlementSource) => void;
}) {
  if (disabled) {
    return (
      <span className="font-mono text-[10px] text-[var(--ink-faint)]">
        Restore user to modify access
      </span>
    );
  }
  // A non-live course can still be granted (admins pre-grant before launch).
  if (!live) {
    return (
      <button
        type="button"
        onClick={() => onGrant("granted")}
        className="text-[11px] font-semibold px-2.5 py-1 min-h-[44px] md:min-h-0 rounded-md text-[var(--color-red)] bg-[var(--admin-selected-bg)] hover:bg-[var(--color-red)] hover:text-white transition-colors"
      >
        Grant granted
      </button>
    );
  }
  if (state === "none" || state === "free") {
    return (
      <>
        <button
          type="button"
          onClick={() => onGrant("granted")}
          className="text-[11px] font-semibold px-2.5 py-1 min-h-[44px] md:min-h-0 rounded-md text-[var(--color-red)] bg-[var(--admin-selected-bg)] hover:bg-[var(--color-red)] hover:text-white transition-colors"
        >
          Grant granted
        </button>
        <button
          type="button"
          onClick={() => onGrant("one-time")}
          className="text-[11px] font-semibold px-2.5 py-1 min-h-[44px] md:min-h-0 rounded-md text-[var(--access-one-time)] bg-[rgba(13,148,136,0.1)] hover:bg-[var(--access-one-time)] hover:text-white transition-colors"
        >
          One-time
        </button>
      </>
    );
  }
  if (state === "subscribed") {
    return (
      <button
        type="button"
        onClick={() => onGrant("granted")}
        className="text-[11px] font-semibold px-2.5 py-1 min-h-[44px] md:min-h-0 rounded-md text-[var(--color-red)] bg-[var(--admin-selected-bg)] hover:bg-[var(--color-red)] hover:text-white transition-colors"
      >
        Grant granted
      </button>
    );
  }
  // granted / one-time → revoke + adjust (granted ↔ one-time).
  return (
    <>
      <button
        type="button"
        onClick={onRevoke}
        className="text-[11px] font-semibold px-2.5 py-1 min-h-[44px] md:min-h-0 rounded-md border text-[var(--ink-muted)] hover:text-[var(--color-red-dark)] hover:border-[var(--color-red-dark)] transition-colors"
        style={{ borderColor: "var(--admin-table-border)" }}
      >
        Revoke
      </button>
      <button
        type="button"
        onClick={() => onAdjust(src === "granted" ? "one-time" : "granted")}
        className="text-[11px] font-semibold px-2.5 py-1 min-h-[44px] md:min-h-0 rounded-md border text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:border-[var(--ink-soft)] transition-colors"
        style={{ borderColor: "var(--admin-table-border)" }}
      >
        Adjust
      </button>
    </>
  );
}
