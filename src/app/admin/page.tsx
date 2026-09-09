"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import { useAdminAudit } from "@/lib/hooks/useAdminAudit";
import { EffectiveAccessChip } from "@/components/Admin/EffectiveAccessChip";
import type { EffectiveAccessState } from "@/lib/access";

/**
 * /admin — Access · Overview (governance health). Admin Experience Redesign
 * (t_888621eb): replaces the v4 dashboard with the honest five-state lens.
 * Renders the pending-needs-launch banner, an access-gap callout, effective-
 * access coverage (the honest matrix by state), the subscriber pulse (by
 * subscriptions.status, with the "0 subscribers — billing on hold" empty
 * state), entitlements per course, and recent admin activity. Read-only.
 */
const STATE_LABEL: Record<EffectiveAccessState, string> = {
  granted: "Granted",
  "one-time": "One-time",
  subscribed: "Subscribed",
  free: "Free",
  none: "None",
};

const STATE_COLOR: Record<EffectiveAccessState, string> = {
  granted: "var(--access-granted)",
  "one-time": "var(--access-one-time)",
  subscribed: "var(--access-subscribed)",
  free: "var(--access-free)",
  none: "var(--access-none)",
};

function formatTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

const ACTION_TAG: Record<string, string> = {
  "course.launch": "LAUNCH",
  "course.status_change": "STATUS",
  "course.access_model_change": "MODEL",
  "course.price_change": "PRICE",
  "course.provision": "CREATE",
  "role.assign": "SET_ROLE",
  "entitlement.grant": "GRANT",
  "entitlement.revoke": "REVOKE",
  "entitlement.bulk_grant": "BULK_GRANT",
  "entitlement.bulk_revoke": "BULK_REVOKE",
  "entitlement.adjust": "ADJUST",
};

export default function AdminOverviewPage() {
  const { data, loading, error } = useAdminAccessEffective();
  const audit = useAdminAudit(8);
  const [gapDismissed, setGapDismissed] = useState(false);

  const counts = useMemo(() => {
    const c: Record<EffectiveAccessState, number> = {
      granted: 0,
      "one-time": 0,
      subscribed: 0,
      free: 0,
      none: 0,
    };
    for (const u of data?.users ?? []) {
      for (const course of data?.courses ?? []) {
        c[data!.matrix[u.user_id]?.[course.course.id] ?? "none"] += 1;
      }
    }
    return c;
  }, [data]);

  const pendingCourses = (data?.courses ?? []).filter(
    (r) => r.course.status === "pending",
  );
  const coverageTotal = counts.granted + counts["one-time"] + counts.subscribed + counts.free + counts.none;
  const pct = (n: number) => (coverageTotal > 0 ? Math.round((n / coverageTotal) * 100) : 0);

  const pulse = data?.subscriberPulse ?? { active: 0, trialing: 0, canceled: 0, past_due: 0 };
  const hasSubscribers = pulse.active + pulse.trialing + pulse.past_due + pulse.canceled > 0;

  // Access-gap callout: a live course with a high none-ratio and zero subscriber
  // coverage is the "needs attention" signal (honest, derived from the matrix).
  const liveCourses = (data?.courses ?? []).filter((r) => r.course.status === "live");
  const gapCourse = liveCourses
    .map((r) => {
      const noneCount = (data?.users ?? []).filter(
        (u) => (data!.matrix[u.user_id]?.[r.course.id] ?? "none") === "none",
      ).length;
      const noneRatio = (data?.users?.length ?? 0) > 0 ? noneCount / (data?.users?.length ?? 1) : 0;
      return { course: r.course, noneCount, noneRatio };
    })
    .sort((a, b) => b.noneRatio - a.noneRatio)[0];

  const entitlementRanked = [...(data?.courses ?? [])].sort(
    (a, b) => b.activeEntitlementCount - a.activeEntitlementCount,
  );

  if (loading && !data) {
    return <p role="status" className="text-sm text-gray-500">Loading overview…</p>;
  }
  if (error) {
    return <p role="status" className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div>
      {/* pending-needs-launch banner */}
      {pendingCourses.length > 0 && (
        <div className="admin-banner mb-[22px]">
          <div className="relative z-[2] flex items-center gap-5 flex-wrap px-6 py-[22px]">
            <span className="urgent-dot" />
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-banner-link)]">
                Awaiting launch
              </div>
              <h2 className="text-[19px] font-extrabold tracking-tight mt-0.5 text-[var(--admin-banner-ink)]">
                {pendingCourses[0].course.title} is pending
              </h2>
              <p className="text-[13px] text-[var(--admin-banner-muted)] mt-0.5">
                {pendingCourses.length} course{pendingCourses.length > 1 ? "s" : ""} need a
                review + launch before visible on the public catalog.
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2.5">
              <Link href="/admin/courses" className="text-[12.5px] font-semibold no-underline hover:underline" style={{ color: "var(--admin-banner-link)" }}>
                Review &amp; launch →
              </Link>
              <Link href="/admin/courses" className="rounded-lg px-4 h-10 inline-flex items-center text-[13px] font-semibold text-white no-underline hover:opacity-90" style={{ background: "var(--admin-banner-cta)" }}>
                Launch
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* access-gap callout */}
      {!gapDismissed && gapCourse && gapCourse.noneRatio > 0.5 && (
        <div className="gov-gap-callout mb-5" style={{ background: "var(--gov-gap-callout-bg)", borderColor: "var(--gov-gap-callout-border)", color: "var(--gov-gap-callout-ink)" }}>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] bg-[rgba(146,64,14,0.12)] px-2 py-1 rounded-full whitespace-nowrap">
            Needs attention
          </span>
          <span className="text-[13px] font-semibold">
            <b>{gapCourse.course.title}</b> has a high none-ratio —{" "}
            {gapCourse.noneCount} of {data?.users?.length ?? 0} users have no
            access path yet.
          </span>
          <button
            type="button"
            aria-label="Dismiss access gap callout"
            onClick={() => setGapDismissed(true)}
            className="ml-auto opacity-60 hover:opacity-100 text-[15px]"
          >
            ×
          </button>
        </div>
      )}

      {/* effective-access coverage */}
      <div className="rounded-2xl border overflow-hidden mb-5" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
          <h3 className="text-[13.5px] font-bold text-[var(--ink-primary)]">Effective-access coverage</h3>
          <span className="font-mono text-[10.5px] text-[var(--ink-faint)] bg-[var(--surface-sunken)] px-2 py-0.5 rounded-full">
            {(data?.users?.length ?? 0)} × {(data?.courses?.length ?? 0)}
          </span>
          <div className="flex-1" />
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">FIVE states · the honest matrix</span>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3.5">
            {(["granted", "one-time", "subscribed", "free", "none"] as EffectiveAccessState[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-muted)]">
                <span className="w-2 h-2 rounded-[3px]" style={{ background: STATE_COLOR[s] }} aria-hidden />
                {STATE_LABEL[s]}
              </span>
            ))}
          </div>
          <div className="flex h-[34px] rounded-lg overflow-hidden mb-2 border" style={{ borderColor: "var(--admin-table-border)" }}>
            {(["granted", "one-time", "subscribed", "free", "none"] as EffectiveAccessState[]).map((s) => (
              <div
                key={s}
                className="h-full flex items-center justify-center font-mono text-[10.5px] font-bold text-white min-w-[26px]"
                style={{ width: `${pct(counts[s])}%`, background: STATE_COLOR[s] }}
              >
                {counts[s] > 0 ? counts[s] : ""}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--ink-faint)]">
            {coverageTotal} user×course pairs resolved by the seam. {counts.free} free
            (public lessons), {counts.granted} granted by admin, {counts["one-time"]}{" "}
            one-time, {counts.subscribed} covered by an active subscription, {counts.none}{" "}
            none (locked, no path yet).
          </p>
        </div>
      </div>

      {/* subscriber pulse + entitlements per course */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        {/* subscriber pulse */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
          <div className="flex items-center gap-3 px-5 py-3.5 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
            <h3 className="text-[13.5px] font-bold text-[var(--ink-primary)]">Subscriber pulse</h3>
            <span className="font-mono text-[10.5px] text-[var(--ink-faint)]">by subscriptions.status</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <PulseCell color="var(--gov-sub-active)" label="Active" value={pulse.active} sub="currently granting" />
            <PulseCell color="var(--gov-sub-trialing)" label="Trialing" value={pulse.trialing} sub="free trial" />
            <PulseCell color="var(--gov-sub-past-due)" label="Past due" value={pulse.past_due} sub="action needed" />
            <PulseCell color="var(--gov-sub-canceled)" label="Canceled" value={pulse.canceled} sub="churned" />
          </div>
          {!hasSubscribers && (
            <div className="mx-4 mb-4 rounded-lg border border-dashed px-4 py-3" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-sunken)" }}>
              <div className="text-[13px] font-bold text-[var(--ink-primary)]">
                <span className="font-mono text-[var(--ink-muted)]">Subscribers · 0</span> — billing on hold
              </div>
              <div className="text-[11.5px] text-[var(--ink-muted)] mt-0.5">
                No subscription rows yet. Effective access is still fully honest:
                granted, one-time and free chips resolve as expected; no course
                claims a subscriber it doesn&apos;t have.
              </div>
              <div className="font-mono text-[10px] text-[var(--ink-faint)] mt-2">
                Trials + one-time billing land <b style={{ color: "var(--signal-pending)" }}>Coming with billing</b> — this panel lights up when Stripe ships.
              </div>
            </div>
          )}
        </div>

        {/* entitlements per course */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
          <div className="flex items-center gap-3 px-5 py-3.5 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
            <h3 className="text-[13.5px] font-bold text-[var(--ink-primary)]">Entitlements per course</h3>
            <span className="font-mono text-[10.5px] text-[var(--ink-faint)]">who holds what</span>
            <div className="flex-1" />
            <Link href="/admin/access/courses" className="text-[12px] font-semibold no-underline hover:underline" style={{ color: "var(--color-red)" }}>
              Access · Courses →
            </Link>
          </div>
          {entitlementRanked.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-500">No courses yet.</p>
          ) : (
            entitlementRanked.map(({ course, activeEntitlementCount }) => (
              <div key={course.id} className="flex items-center gap-3 px-5 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle, #F3F4F6)" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-[var(--ink-primary)] truncate">{course.title}</div>
                  <div className="font-mono text-[9.5px] text-[var(--ink-faint)]">{course.series_slug}</div>
                </div>
                <EffectiveAccessChip
                  state={course.access_model === "free" ? "free" : course.access_model === "granted" ? "granted" : "none"}
                />
                <span className="font-mono text-[11px] font-semibold text-[var(--ink-muted)] w-[46px] text-right">
                  {activeEntitlementCount}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* recent admin activity */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
          <h3 className="text-[13.5px] font-bold text-[var(--ink-primary)]">Recent admin activity</h3>
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">admin_audit_log</span>
          <div className="flex-1" />
          <Link href="/admin/audit" className="text-[12px] font-semibold no-underline hover:underline" style={{ color: "var(--color-red)" }}>
            View audit log →
          </Link>
        </div>
        {(audit.rows ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">No audit entries yet.</p>
        ) : (
          (audit.rows ?? []).map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-2.5" style={{ borderBottom: "1px solid var(--border-subtle, #F3F4F6)" }}>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.05em] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[var(--ink-muted)]">
                {ACTION_TAG[r.action] ?? r.action.toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-[var(--ink-primary)] truncate">
                  {r.target_type}
                  {r.target_id ? ` · ${r.target_id}` : ""}
                </div>
                <div className="font-mono text-[10px] text-[var(--ink-faint)]">{r.action}</div>
              </div>
              <span className="ml-auto font-mono text-[10px] text-[var(--ink-faint)] whitespace-nowrap">
                {formatTime(r.created_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PulseCell({ color, label, value, sub }: { color: string; label: string; value: number; sub: string }) {
  return (
    <div className="px-4 py-3.5 border-r last:border-r-0" style={{ borderColor: "var(--admin-table-border)" }}>
      <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-muted)] mb-1">
        <span className="w-[7px] h-[7px] rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </div>
      <div className="text-[1.5rem] font-extrabold tracking-[-0.02em] leading-none text-[var(--ink-primary)]">{value}</div>
      <div className="text-[10.5px] text-[var(--ink-faint)] mt-0.5">{sub}</div>
    </div>
  );
}
