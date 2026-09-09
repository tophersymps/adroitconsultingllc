"use client";

import { useMemo, useState } from "react";
import type {
  AdminCourseListRow,
  AdminUserListRow,
  EntitlementSource,
  UserRole,
} from "@/shared/contracts-course-catalog";
import type { EffectiveAccessState } from "@/lib/access";
import { EffectiveAccessChip } from "./EffectiveAccessChip";

/**
 * AccessPanel — person-first lens (People, ADR-222). Roster on the left,
 * detail panel on the right. Selecting a person shows their role, subscription
 * panel (honest empty state today — billing on hold), and a per-course
 * effective-access row that IS the affordance: grant granted / grant one-time /
 * revoke / adjust inline, no dropdown. Every write records an audit row.
 */
export function AccessPanel({
  users,
  courses,
  matrix,
  onSetRole,
  onGrant,
  onRevoke,
  onAdjust,
}: {
  users: AdminUserListRow[];
  courses: AdminCourseListRow[];
  matrix: Record<string, Record<string, EffectiveAccessState>>;
  onSetRole: (userId: string, role: UserRole) => Promise<boolean>;
  onGrant: (userId: string, courseId: string, source: "granted" | "one-time") => Promise<boolean>;
  onRevoke: (userId: string, courseId: string) => Promise<boolean>;
  onAdjust: (userId: string, courseId: string, from: EntitlementSource, to: EntitlementSource) => Promise<boolean>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(users[0]?.user_id ?? null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.display_name ?? u.email).toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  const selected = users.find((u) => u.user_id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5 items-start">
      {/* Roster */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
          <h3 className="text-[13.5px] font-bold text-[var(--ink-primary)]">People</h3>
          <span className="font-mono text-[10.5px] text-[var(--ink-faint)] bg-[var(--surface-sunken)] px-2 py-0.5 rounded-full">
            {users.length}
          </span>
        </div>
        <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            aria-label="Search people"
            className="w-full rounded-lg border text-[12.5px] px-3 py-2 bg-[var(--surface-sunken)] outline-none"
            style={{ borderColor: "var(--admin-table-border)" }}
          />
        </div>
        <div className="max-h-[640px] overflow-y-auto">
          {filtered.map((u) => (
            <button
              key={u.user_id}
              type="button"
              onClick={() => setSelectedId(u.user_id)}
              aria-current={selectedId === u.user_id ? "true" : undefined}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                selectedId === u.user_id
                  ? "bg-[var(--admin-selected-bg)] shadow-[inset_3px_0_0_var(--color-red)]"
                  : "hover:bg-[var(--surface-sunken)]"
              }`}
              style={{ borderBottom: "1px solid var(--border-subtle, #F3F4F6)" }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ background: u.subscription ? "var(--gov-sub-active)" : "var(--color-navy)" }}
              >
                {(u.display_name ?? u.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[var(--ink-primary)] truncate">
                  {u.display_name ?? u.email}
                </div>
                <div className="font-mono text-[10px] text-[var(--ink-faint)] truncate">{u.email}</div>
              </div>
              <span
                className={`ml-auto font-mono text-[9.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${
                  u.role === "admin" ? "text-[var(--color-red)] bg-[var(--admin-selected-bg)]" : "text-[var(--ink-muted)] bg-[var(--surface-sunken)]"
                }`}
              >
                {u.role}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-500">No people found.</p>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
        {!selected ? (
          <p className="px-6 py-10 text-sm text-gray-500">Select a person to view their access.</p>
        ) : (
          <>
            {/* Detail header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
              <div className="w-11 h-11 rounded-full bg-[var(--color-navy)] text-white flex items-center justify-center text-[15px] font-bold">
                {(selected.display_name ?? selected.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-bold text-[var(--ink-primary)]">
                  {selected.display_name ?? selected.email}
                </div>
                <div className="font-mono text-[11px] text-[var(--ink-faint)]">{selected.email}</div>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-[var(--color-red)] bg-[var(--admin-selected-bg)]">
                {selected.role}
              </span>
              <div className="flex-1" />
              <select
                value={selected.role}
                onChange={(e) => onSetRole(selected.user_id, e.target.value as UserRole)}
                aria-label={`Role for ${selected.display_name ?? selected.email}`}
                className="rounded-lg border text-[12.5px] px-2 py-1.5 bg-[var(--surface-card)]"
                style={{ borderColor: "var(--admin-table-border)" }}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </div>

            {/* Subscription panel — honest empty today */}
            <div className="px-6 py-4 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--ink-faint)] mb-2.5">
                Subscription <span className="normal-case tracking-normal text-[var(--ink-faint)] font-normal">· subscriptions.status</span>
              </div>
              <div className="rounded-xl border border-dashed px-4 py-3" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-sunken)" }}>
                {selected.subscription ? (
                  <>
                    <div className="text-[13.5px] font-bold text-[var(--ink-primary)]">
                      <span className="font-mono text-[var(--ink-muted)]">{selected.subscription.status}</span>
                      {" · "}{selected.subscription.plan}
                    </div>
                    <div className="text-[11.5px] text-[var(--ink-muted)] mt-0.5">
                      Renews {selected.subscription.current_period_end ?? "—"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13.5px] font-bold">
                      <span className="font-mono text-[var(--ink-muted)]">No active subscription</span>
                    </div>
                    <div className="text-[11.5px] text-[var(--ink-muted)] mt-0.5">
                      Subscriber is a derived access state (an active/trialing sub), not a role.
                    </div>
                    <div className="font-mono text-[10px] text-[var(--ink-faint)] mt-2">
                      Active · Trialing · Past due · Canceled resolve here when billing ships — <b style={{ color: "var(--signal-pending)" }}>Coming with billing</b>.
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Per-course access rows */}
            <div className="px-6 py-4 pb-2">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--ink-faint)] mb-2">
                Course access <span className="normal-case tracking-normal font-normal">· effective access, five states</span>
              </div>
            </div>
            {courses.map(({ course }) => {
              const state: EffectiveAccessState = matrix[selected.user_id]?.[course.id] ?? "none";
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
                <div key={course.id} className="flex items-center gap-4 min-h-[56px] px-6 py-3" style={{ borderTop: "1px solid var(--border-subtle, #F3F4F6)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[var(--ink-primary)]">{course.title}</div>
                    <div className="font-mono text-[9.5px] text-[var(--ink-faint)]">{course.series_slug}</div>
                  </div>
                  <EffectiveAccessChip state={state} />
                  <div className="font-mono text-[10.5px] text-[var(--ink-faint)] w-[150px] hidden lg:block">{subNote}</div>
                  <div className="flex flex-wrap gap-1.5 justify-end min-w-[220px]">
                    <RowActions
                      state={state}
                      src={src}
                      live={course.status === "live"}
                      onGrant={(s) => onGrant(selected.user_id, course.id, s)}
                      onRevoke={() => onRevoke(selected.user_id, course.id)}
                      onAdjust={(to) => onAdjust(selected.user_id, course.id, src!, to)}
                    />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/** Per-row action buttons — the affordance itself (arch §1.4). */
function RowActions({
  state,
  src,
  live,
  onGrant,
  onRevoke,
  onAdjust,
}: {
  state: EffectiveAccessState;
  src?: EntitlementSource;
  live: boolean;
  onGrant: (source: "granted" | "one-time") => void;
  onRevoke: () => void;
  onAdjust: (to: EntitlementSource) => void;
}) {
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
