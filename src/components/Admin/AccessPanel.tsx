"use client";

import { useMemo, useState } from "react";
import type {
  AdminBulkUsersRequest,
  AdminBulkUsersResult,
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
import {
  BulkGrantCourseDialog,
  BulkFreezeDialog,
  BulkDeleteDialog,
  BulkResetPasswordDialog,
} from "./BulkUserActionDialogs";

type PeopleFilter =
  | "all"
  | "admins"
  | "granted"
  | "frozen"
  | "unverified"
  | "tombstoned";

type DetailTab = "access" | "identity" | "subscriptions";

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
  onBulkMutate,
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
  onBulkMutate?: (
    input: AdminBulkUsersRequest,
  ) => Promise<AdminBulkUsersResult>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    users[0]?.user_id ?? null,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [activeTab, setActiveTab] = useState<DetailTab>("access");
  const [courseFilter, setCourseFilter] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Bulk Selection State
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUserListRow | null>(null);
  const [freezePromptOpen, setFreezePromptOpen] = useState(false);
  const [freezeReason, setFreezeReason] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Bulk dialog triggers
  const [bulkGrantOpen, setBulkGrantOpen] = useState(false);
  const [bulkFreezeOpen, setBulkFreezeOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkResetOpen, setBulkResetOpen] = useState(false);

  const counts = useMemo(() => {
    let admins = 0;
    let granted = 0;
    let frozen = 0;
    let unverified = 0;
    let tombstoned = 0;
    let activeOrFrozen = 0;
    for (const u of users) {
      const isTomb = u.status === "tombstoned" || Boolean(u.deleted_at);
      const isFrz = u.status === "frozen" || Boolean(u.frozen_at);
      if (isTomb) {
        tombstoned++;
      } else {
        activeOrFrozen++;
        if (isFrz) frozen++;
        if (u.role === "admin") admins++;
        if (Object.keys(u.entitlements).length > 0) granted++;
        if (u.email_verified === false) unverified++;
      }
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
        // Hide tombstoned by default unless searching explicitly or on tombstoned tab
        if (isTomb && !q) return false;
        if (filter === "admins" && u.role !== "admin") return false;
        if (filter === "granted" && Object.keys(u.entitlements).length === 0)
          return false;
        if (filter === "frozen" && !isFrz) return false;
        if (filter === "unverified" && u.email_verified !== false) return false;
      }
      if (!q) return true;
      return (
        (u.display_name?.toLowerCase().includes(q) ?? false) ||
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

  // Bulk selection helpers
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((u) => selectedUserIds.has(u.user_id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filtered.map((u) => u.user_id)));
    }
  }

  function toggleUserSelect(userId: string, checked: boolean) {
    const next = new Set(selectedUserIds);
    if (checked) {
      next.add(userId);
    } else {
      next.delete(userId);
    }
    setSelectedUserIds(next);
  }

  // Filtered courses for Course Entitlements tab
  const filteredCourses = useMemo(() => {
    const cq = courseFilter.trim().toLowerCase();
    if (!cq) return courses;
    return courses.filter(
      ({ course }) =>
        course.title.toLowerCase().includes(cq) ||
        course.series_slug.toLowerCase().includes(cq),
    );
  }, [courses, courseFilter]);

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

  // Bulk action handlers
  async function executeBulkGrant(courseId: string, source: "granted" | "one-time") {
    if (!onBulkMutate || selectedUserIds.size === 0) return;
    await onBulkMutate({
      userIds: Array.from(selectedUserIds),
      action: "grant-course",
      courseId,
      source,
    });
    setSelectedUserIds(new Set());
  }

  async function executeBulkFreeze(reason: string) {
    if (!onBulkMutate || selectedUserIds.size === 0) return;
    await onBulkMutate({
      userIds: Array.from(selectedUserIds),
      action: "freeze",
      reason: reason || undefined,
    });
    setSelectedUserIds(new Set());
  }

  async function executeBulkDelete(mode: "soft" | "hard") {
    if (!onBulkMutate || selectedUserIds.size === 0) return;
    await onBulkMutate({
      userIds: Array.from(selectedUserIds),
      action: "delete",
      mode,
    });
    setSelectedUserIds(new Set());
  }

  async function executeBulkResetPassword() {
    if (!onBulkMutate || selectedUserIds.size === 0) return;
    await onBulkMutate({
      userIds: Array.from(selectedUserIds),
      action: "reset-password",
    });
    setSelectedUserIds(new Set());
  }

  return (
    <div className="relative">
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5 items-start">
        {/* LEFT COLUMN: Roster & Directory */}
        <div
          className={`${
            mobileDetailOpen ? "hidden xl:block" : "block"
          } rounded-2xl border overflow-hidden shadow-xs bg-[var(--surface-card)]`}
          style={{ borderColor: "var(--admin-table-border)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between gap-2 px-4 py-3 border-b"
            style={{ borderColor: "var(--admin-table-border)" }}
          >
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                aria-label="Select all displayed users"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600"
              />
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

          {/* Search & Filter pills */}
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

          {/* User Rows */}
          <div className="max-h-[640px] overflow-y-auto divide-y" style={{ borderColor: "var(--border-subtle, #F3F4F6)" }}>
            {filtered.map((u) => {
              const isTomb = u.status === "tombstoned" || Boolean(u.deleted_at);
              const isFrz = u.status === "frozen" || Boolean(u.frozen_at);
              const isChecked = selectedUserIds.has(u.user_id);
              return (
                <div
                  key={u.user_id}
                  onClick={() => {
                    setSelectedId(u.user_id);
                    setFreezePromptOpen(false);
                    setMobileDetailOpen(true);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                    selected?.user_id === u.user_id
                      ? "bg-[var(--admin-selected-bg)] shadow-[inset_3px_0_0_var(--color-red)]"
                      : "hover:bg-[var(--surface-sunken)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    aria-label={`Select ${u.display_name ?? u.email}`}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => toggleUserSelect(u.user_id, e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 cursor-pointer accent-blue-600 shrink-0"
                  />
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
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-sm text-gray-500">No people found.</p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Detail Workspace (Tabbed) */}
        <div
          className={`${
            !mobileDetailOpen ? "hidden xl:block" : "block"
          } rounded-2xl border overflow-hidden shadow-xs bg-[var(--surface-card)]`}
          style={{ borderColor: "var(--admin-table-border)" }}
        >
          {!selected ? (
            <p className="px-6 py-10 text-sm text-gray-500">
              Select a person to view their access.
            </p>
          ) : (
            <>
              {/* Mobile Back to List Bar */}
              <div
                className="xl:hidden px-4 py-2 border-b bg-[var(--surface-sunken)] flex items-center justify-between"
                style={{ borderColor: "var(--admin-table-border)" }}
              >
                <button
                  type="button"
                  onClick={() => setMobileDetailOpen(false)}
                  className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 hover:underline"
                >
                  ← Back to People List
                </button>
              </div>

              {/* Detail Header */}
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
                  <div className="font-mono text-[11px] text-[var(--ink-faint)] mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{selected.email} · <span title={selected.user_id}>{selected.user_id.slice(0, 8)}…</span></span>
                    <span className="px-2 py-0.5 rounded text-[10.5px] bg-[var(--surface-sunken)] text-[var(--ink-muted)]">
                      {selected.subscription?.status === "active" ? "Active subscription" : "No active subscription — Coming with billing"}
                    </span>
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
                    className="rounded-lg border text-[12.5px] px-2.5 py-1.5 bg-[var(--surface-card)] text-[var(--ink-primary)] disabled:opacity-50"
                    style={{ borderColor: "var(--admin-table-border)" }}
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>

              {/* Sub-Tabs (Access, Identity, Subscriptions) */}
              <div
                className="px-6 border-b flex gap-6 text-xs font-bold bg-[var(--surface-sunken)]/40"
                style={{ borderColor: "var(--admin-table-border)" }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab("access")}
                  className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "access"
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 font-extrabold"
                      : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                  }`}
                >
                  🎓 Course Entitlements{" "}
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-500/15 text-blue-700 dark:text-blue-300">
                    {Object.keys(selected.entitlements).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("identity")}
                  className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "identity"
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 font-extrabold"
                      : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                  }`}
                >
                  👤 Account &amp; Identity
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("subscriptions")}
                  className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "subscriptions"
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 font-extrabold"
                      : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                  }`}
                >
                  💳 Subscriptions
                </button>
              </div>

              {/* TAB 1: COURSE ENTITLEMENTS */}
              {activeTab === "access" && (
                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-faint)]">Course access</h3>
                      <p className="text-xs text-[var(--ink-muted)]">
                      Per-course effective access resolved across grants, one-time passes, and subscriptions.
                      </p>
                    </div>
                    <input
                      type="text"
                      placeholder="Filter courses…"
                      value={courseFilter}
                      onChange={(e) => setCourseFilter(e.target.value)}
                      className="px-2.5 py-1 text-xs rounded-lg border bg-[var(--surface-sunken)] text-[var(--ink-primary)]"
                      style={{ borderColor: "var(--admin-table-border)" }}
                    />
                  </div>

                  <div className="rounded-xl border overflow-hidden divide-y" style={{ borderColor: "var(--admin-table-border)" }}>
                    {filteredCourses.map(({ course }) => {
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
                          className="flex items-center gap-4 min-h-[56px] px-4 py-3 hover:bg-[var(--surface-sunken)]/40 transition-colors"
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
                          <div className="flex flex-wrap gap-1.5 justify-end min-w-[200px]">
                            <RowActions
                              state={state}
                              live={course.status === "live"}
                              disabled={isSelectedTombstoned}
                              onGrant={(s) => onGrant(selected.user_id, course.id, s)}
                              onRevoke={() => onRevoke(selected.user_id, course.id)}
                              onAdjust={(to) =>
                                src
                                  ? onAdjust(selected.user_id, course.id, src, to)
                                  : Promise.resolve(false)
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: ACCOUNT & IDENTITY */}
              {activeTab === "identity" && (
                <div className="p-6 space-y-6">
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-[11.5px]">
                    <div className="p-3 rounded-xl border bg-[var(--surface-sunken)]/40" style={{ borderColor: "var(--admin-table-border)" }}>
                      <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Email Status
                      </div>
                      <div className="font-semibold text-[var(--ink-primary)] mt-1">
                        {selected.email_verified === false ? (
                          <span className="text-amber-700 font-bold">Unverified</span>
                        ) : (
                          <span className="text-emerald-700 font-bold">✓ Verified</span>
                        )}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border bg-[var(--surface-sunken)]/40" style={{ borderColor: "var(--admin-table-border)" }}>
                      <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Auth Provider
                      </div>
                      <div className="font-mono font-semibold text-[var(--ink-primary)] mt-1">
                        {selected.provider ?? "credential"}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border bg-[var(--surface-sunken)]/40" style={{ borderColor: "var(--admin-table-border)" }}>
                      <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Joined Date
                      </div>
                      <div className="font-mono text-[var(--ink-primary)] mt-1">
                        {formatShortDate(selected.created_at)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border bg-[var(--surface-sunken)]/40" style={{ borderColor: "var(--admin-table-border)" }}>
                      <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Active Sessions
                      </div>
                      <div className="font-mono text-[var(--ink-primary)] mt-1">
                        {selected.active_session_count ?? 1} live session
                      </div>
                    </div>
                    <div className="p-3 rounded-xl border bg-[var(--surface-sunken)]/40" style={{ borderColor: "var(--admin-table-border)" }}>
                      <div className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Completed Lessons
                      </div>
                      <div className="font-mono font-semibold text-[var(--ink-primary)] mt-1">
                        {selected.lessons_completed_count ?? 0} lessons
                      </div>
                    </div>
                  </div>

                  {isSelectedFrozen && selected.frozen_reason && (
                    <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-800">
                      <b>Suspension reason:</b> {selected.frozen_reason} (frozen {formatShortDate(selected.frozen_at)})
                    </div>
                  )}

                  {isSelectedTombstoned ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-xs">
                      <div className="text-red-800">
                        <b>Soft-deleted account:</b> Login is disabled, but course progress and entitlements are preserved until the 30-day recovery window expires.
                      </div>
                      <div className="flex items-center gap-2">
                        {onRestoreUser && (
                          <button
                            type="button"
                            disabled={actionBusy !== null}
                            onClick={handleRestore}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 font-mono text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {actionBusy === "restore" ? "Restoring…" : "Restore Account & Send Reset Link"}
                          </button>
                        )}
                        {onDeleteUser && (
                          <button
                            type="button"
                            disabled={actionBusy !== null}
                            onClick={() => setUserToDelete(selected)}
                            className="rounded-lg border border-red-600/40 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-red-700 hover:bg-red-600 hover:text-white disabled:opacity-50"
                          >
                            Purge Permanently…
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border space-y-3 bg-[var(--surface-sunken)]/20" style={{ borderColor: "var(--admin-table-border)" }}>
                      <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                        Individual Account Actions
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {onSendPasswordReset && (
                          <button
                            type="button"
                            disabled={actionBusy !== null}
                            onClick={() => handleResetPassword(false)}
                            className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] bg-[var(--surface-card)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50 shadow-xs"
                            style={{ borderColor: "var(--admin-table-border)" }}
                          >
                            {actionBusy === "reset-pwd" ? "Sending link…" : "✉️ Send Password Reset Email"}
                          </button>
                        )}

                        {onSetFrozenStatus && (
                          <>
                            {isSelectedFrozen ? (
                              <button
                                type="button"
                                disabled={actionBusy !== null}
                                onClick={() => handleFreezeToggle("unfreeze")}
                                className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-50"
                              >
                                {actionBusy === "unfreeze" ? "Unfreezing…" : "Unfreeze Account"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={actionBusy !== null}
                                onClick={() => setFreezePromptOpen((v) => !v)}
                                className="rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-600 hover:text-white transition-colors disabled:opacity-50"
                              >
                                ❄️ Freeze Account…
                              </button>
                            )}
                          </>
                        )}

                        {onDeleteUser && (
                          <button
                            type="button"
                            disabled={actionBusy !== null}
                            onClick={() => setUserToDelete(selected)}
                            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50 ml-auto"
                          >
                            🗑️ Delete User…
                          </button>
                        )}
                      </div>

                      {freezePromptOpen && !isSelectedFrozen && (
                        <div className="mt-3 p-3 rounded-lg border border-amber-500/40 bg-[var(--surface-card)] space-y-2">
                          <label className="block text-xs font-semibold text-[var(--ink-primary)]">
                            Reason for suspension (optional):
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={freezeReason}
                              onChange={(e) => setFreezeReason(e.target.value)}
                              placeholder="e.g. Terms violation, account audit"
                              className="flex-1 rounded border text-xs px-2.5 py-1.5 bg-[var(--surface-sunken)] text-[var(--ink-primary)]"
                              style={{ borderColor: "var(--admin-table-border)" }}
                            />
                            <button
                              type="button"
                              onClick={() => handleFreezeToggle("freeze")}
                              disabled={actionBusy === "freeze"}
                              className="rounded bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                              Confirm Freeze
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SUBSCRIPTIONS */}
              {activeTab === "subscriptions" && (
                <div className="p-6">
                  <div
                    className="rounded-2xl border border-dashed px-6 py-8 text-center space-y-2"
                    style={{
                      borderColor: "var(--admin-table-border)",
                      background: "var(--surface-sunken)",
                    }}
                  >
                    {selected.subscription ? (
                      <>
                        <div className="text-sm font-bold text-[var(--ink-primary)]">
                          <span className="font-mono text-[var(--ink-muted)]">
                            {selected.subscription.status}
                          </span>
                          {" · "}
                          {selected.subscription.plan}
                        </div>
                        <div className="text-xs text-[var(--ink-muted)]">
                          Renews {selected.subscription.current_period_end ?? "—"}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl">💳</div>
                        <div className="text-sm font-bold text-[var(--ink-primary)]">
                          No active subscription
                        </div>
                        <p className="text-xs text-[var(--ink-muted)] max-w-sm mx-auto">
                          Subscriber is a derived access state (an active/trialing sub), not a role. Active · Trialing · Past due · Canceled resolve here when billing ships.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* FLOATING BULK ACTIONS TOOLBAR (Visible when 1+ users checked) */}
      {selectedUserIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-5 py-3 rounded-2xl shadow-2xl border border-white/15 flex items-center gap-3.5 text-white animate-in fade-in slide-in-from-bottom-4 duration-200"
          style={{ background: "var(--color-navy)" }}
        >
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
              {selectedUserIds.size}
            </span>
            <span className="text-xs font-bold whitespace-nowrap">Selected</span>
          </div>

          <div className="h-4 w-px bg-white/20" />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkGrantOpen(true)}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 shadow-xs"
            >
              Grant Course
            </button>
            <button
              type="button"
              onClick={() => setBulkFreezeOpen(true)}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-500 shadow-xs"
            >
              Freeze
            </button>
            <button
              type="button"
              onClick={() => setBulkResetOpen(true)}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white/10 hover:bg-white/20 shadow-xs"
            >
              Send Resets
            </button>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-500 shadow-xs"
            >
              Delete
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedUserIds(new Set())}
            title="Clear selection"
            className="text-white/60 hover:text-white text-xs ml-1 font-mono p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Individual Modals */}
      {showCreateDialog && onCreateUser && (
        <CreateUserDialog
          courses={courses}
          onClose={() => setShowCreateDialog(false)}
          onCreate={onCreateUser}
        />
      )}

      {userToDelete && onDeleteUser && (
        <DeleteUserDialog
          user={userToDelete}
          onClose={() => setUserToDelete(null)}
          onDelete={onDeleteUser}
        />
      )}

      {/* Bulk Action Modals */}
      {bulkGrantOpen && (
        <BulkGrantCourseDialog
          open={bulkGrantOpen}
          userCount={selectedUserIds.size}
          courses={courses}
          onClose={() => setBulkGrantOpen(false)}
          onConfirm={executeBulkGrant}
        />
      )}

      {bulkFreezeOpen && (
        <BulkFreezeDialog
          open={bulkFreezeOpen}
          userCount={selectedUserIds.size}
          onClose={() => setBulkFreezeOpen(false)}
          onConfirm={executeBulkFreeze}
        />
      )}

      {bulkDeleteOpen && (
        <BulkDeleteDialog
          open={bulkDeleteOpen}
          userCount={selectedUserIds.size}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={executeBulkDelete}
        />
      )}

      {bulkResetOpen && (
        <BulkResetPasswordDialog
          open={bulkResetOpen}
          userCount={selectedUserIds.size}
          onClose={() => setBulkResetOpen(false)}
          onConfirm={executeBulkResetPassword}
        />
      )}
    </div>
  );
}

function RowActions({
  state,
  live,
  disabled,
  onGrant,
  onRevoke,
  onAdjust,
}: {
  state: EffectiveAccessState;
  live: boolean;
  disabled?: boolean;
  onGrant: (s: "granted" | "one-time") => Promise<boolean>;
  onRevoke: () => Promise<boolean>;
  onAdjust: (to: "granted" | "one-time") => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<boolean>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  if (state === "granted") {
    return (
      <>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => act(onRevoke)}
          className="rounded px-2 py-0.5 font-mono text-[11px] text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--color-red)] disabled:opacity-50"
        >
          Revoke
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => act(() => onAdjust("one-time"))}
          className="rounded px-2 py-0.5 font-mono text-[11px] text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          Adjust
        </button>
      </>
    );
  }

  if (state === "one-time") {
    return (
      <>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => act(onRevoke)}
          className="rounded px-2 py-0.5 font-mono text-[11px] text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--color-red)] disabled:opacity-50"
        >
          Revoke
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => act(() => onAdjust("granted"))}
          className="rounded px-2 py-0.5 font-mono text-[11px] text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          Adjust
        </button>
      </>
    );
  }

  if (state === "subscribed") {
    return (
      <span className="font-mono text-[10px] text-[var(--ink-faint)] italic">
        managed by sub
      </span>
    );
  }

  if (state === "free") {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => act(() => onGrant("granted"))}
          className="rounded px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[var(--color-red)] hover:bg-[var(--admin-selected-bg)] disabled:opacity-50"
        >
          Grant granted
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => act(() => onGrant("one-time"))}
          className="rounded px-2 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          One-time
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={busy || disabled || !live}
        onClick={() => act(() => onGrant("granted"))}
        className="rounded px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[var(--color-red)] hover:bg-[var(--admin-selected-bg)] disabled:opacity-50"
      >
        Grant granted
      </button>
      <button
        type="button"
        disabled={busy || disabled || !live}
        onClick={() => act(() => onGrant("one-time"))}
        className="rounded px-2 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      >
        One-time
      </button>
    </div>
  );
}
