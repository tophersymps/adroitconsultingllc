"use client";

/**
 * /admin/analytics — per-course completion analytics (v4, t_0ed19ad0,
 * deferred-from-V2). Reads from /api/admin/analytics (progress + quiz tables).
 * No chart library: pure CSS bars + one inline SVG sparkline. Signal pill:
 * ≥70% on-track (emerald), 30–69% in-progress (amber), <30% / no data gray.
 */
import { useAdminAnalytics } from "@/lib/hooks/useAdminAnalytics";
import { StatusBadge } from "@/components/Catalog/StatusBadge";
import { AccessModelChip } from "@/components/Catalog/AccessModelChip";
import type { AnalyticsSignal } from "@/lib/course-analytics";

const SIGNAL: Record<AnalyticsSignal, { label: string; cls: string }> = {
  "on-track": { label: "On track", cls: "bg-emerald-light text-[var(--signal-live)]" },
  "in-progress": { label: "In progress", cls: "bg-amber-light text-[#B45309]" },
  "no-data": { label: "No data", cls: "bg-gray-100 dark:bg-gray-800 text-[var(--ink-faint)]" },
};

/** Build a smooth-ish SVG path for the 8-week sparkline. */
function sparkPath(values: number[]): string {
  const w = 640;
  const h = 108;
  const max = 100;
  const n = values.length;
  const pts = values.map((v, i) => ({
    x: (i / Math.max(1, n - 1)) * w,
    y: h - (Math.min(max, v) / max) * (h - 12) - 8,
  }));
  if (pts.length === 0) return "";
  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]!;
    const c = pts[i]!;
    const mx = (p.x + c.x) / 2;
    d += ` C${mx},${p.y} ${mx},${c.y} ${c.x},${c.y}`;
  }
  return d;
}

export default function AdminAnalyticsPage() {
  const { data, loading, error } = useAdminAnalytics();

  if (loading && !data) {
    return (
      <p role="status" className="text-sm text-gray-500">
        Loading analytics…
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
  if (!data) return null;

  const { summary, courses, weekly, trendDelta } = data;
  const path = sparkPath(weekly.map((w) => w.avgProgress));
  const areaPath = `${path} L640,108 L0,108 Z`;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-extrabold tracking-tight text-[var(--ink-primary)]">
          Course Completion
        </h1>
        <p className="text-[13px] text-[var(--ink-muted)] mt-0.5">
          Enrollment + average progress from the progress &amp; quiz tables.
        </p>
      </div>

      {/* summary strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px] mb-[18px]">
        <div className="rounded-xl border p-[14px] shadow-[var(--shadow-card)]" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--ink-muted)] mb-[7px]">
            Total enrollments
          </div>
          <div className="text-[1.5rem] font-extrabold tracking-[-0.02em] text-[var(--ink-primary)]">
            {summary.totalEnrollments} <em className="not-italic text-[12px] font-semibold text-[var(--ink-faint)]">learners</em>
          </div>
          <div className="text-[11px] text-[var(--ink-faint)] mt-0.5">
            across {summary.courseCount} courses
          </div>
        </div>
        <div className="rounded-xl border p-[14px] shadow-[var(--shadow-card)]" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--ink-muted)] mb-[7px]">
            Avg completion
          </div>
          <div className="text-[1.5rem] font-extrabold tracking-[-0.02em]" style={{ color: "var(--signal-live)" }}>
            {summary.avgCompletion} <em className="not-italic text-[12px] font-semibold text-[var(--ink-faint)]">%</em>
          </div>
          <div className="text-[11px] text-[var(--ink-faint)] mt-0.5">weighted by enrollment</div>
        </div>
        <div className="rounded-xl border p-[14px] shadow-[var(--shadow-card)]" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--ink-muted)] mb-[7px]">
            On-track courses
          </div>
          <div className="text-[1.5rem] font-extrabold tracking-[-0.02em] text-[var(--ink-primary)]">
            {summary.onTrackCount} <em className="not-italic text-[12px] font-semibold text-[var(--ink-faint)]">/ {summary.courseCount}</em>
          </div>
          <div className="text-[11px] text-[var(--ink-faint)] mt-0.5">≥ 70% avg progress</div>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--admin-table-border)", background: "var(--surface-card, #FFFFFF)" }}>
        <div className="flex items-center gap-3 px-5 py-[15px] border-b flex-wrap" style={{ borderColor: "var(--admin-table-border)" }}>
          <h3 className="text-[14px] font-bold text-[var(--ink-primary)]">
            Completion by course
          </h3>
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">
            live from progress + quiz tables
          </span>
          <div className="flex-1" />
          <div className="flex gap-4 font-mono text-[10px] text-[var(--ink-muted)]">
            <span className="flex items-center gap-1.5"><i className="w-[9px] h-[9px] rounded-sm inline-block" style={{ background: "var(--signal-live)" }} /> ≥ 70%</span>
            <span className="flex items-center gap-1.5"><i className="w-[9px] h-[9px] rounded-sm inline-block" style={{ background: "#B45309" }} /> 30–69%</span>
            <span className="flex items-center gap-1.5"><i className="w-[9px] h-[9px] rounded-sm inline-block" style={{ background: "var(--ink-faint)" }} /> &lt; 30%</span>
          </div>
        </div>

        {/* sparkline */}
        <div className="px-5 py-5 border-b" style={{ borderColor: "var(--admin-table-border)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12.5px] font-semibold text-[var(--ink-primary)]">
              Average learner progress — last 8 weeks
            </span>
            <span className="font-mono text-[11px] font-semibold" style={{ color: trendDelta >= 0 ? "var(--signal-live)" : "var(--signal-granted)" }}>
              {trendDelta >= 0 ? "▲" : "▼"} {Math.abs(trendDelta)}% vs prior period
            </span>
          </div>
          <svg
            viewBox="0 0 640 130"
            className="w-full h-[120px]"
            role="img"
            aria-label="Average learner progress over the last 8 weeks"
          >
            <defs>
              <linearGradient id="analytics-spark-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C8102E" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#C8102E" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="108" x2="640" y2="108" stroke="#E5E7EB" strokeWidth="1" />
            <path d={areaPath} fill="url(#analytics-spark-fill)" />
            <path
              d={path}
              fill="none"
              stroke="var(--analytics-spark, #C8102E)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {weekly.length > 0 && (
              <circle
                cx="640"
                cy={108 - (Math.min(100, weekly[weekly.length - 1]!.avgProgress) / 100) * (108 - 12) - 8}
                r="3.5"
                fill="#C8102E"
              />
            )}
            <text x="0" y="126" fill="#9CA3AF" fontSize="9" fontFamily="var(--font-mono)">
              {weekly[0]?.week ?? ""}
            </text>
            <text x="560" y="126" fill="#9CA3AF" fontSize="9" fontFamily="var(--font-mono)">
              {weekly[weekly.length - 1]?.week ?? ""}
            </text>
          </svg>
        </div>

        {/* completion table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] bg-gray-50 dark:bg-gray-900" style={{ color: "var(--ink-faint)", borderBottom: "1px solid var(--admin-table-border)" }}>
                <th scope="col" className="px-5 py-3">Course</th>
                <th scope="col" className="px-5 py-3">Status</th>
                <th scope="col" className="px-5 py-3 hidden md:table-cell">Enrolled</th>
                <th scope="col" className="px-5 py-3 w-2/5">Avg progress</th>
                <th scope="col" className="px-5 py-3 hidden lg:table-cell">Lessons done</th>
                <th scope="col" className="px-5 py-3 hidden lg:table-cell">Signal</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => {
                const barCls =
                  c.enrollmentCount === 0
                    ? "zero"
                    : c.avgProgress >= 100
                      ? "good"
                      : c.avgProgress >= 30
                        ? "fill"
                        : "";
                const pctCls =
                  c.avgProgress >= 70
                    ? "var(--signal-live)"
                    : c.avgProgress >= 30
                      ? "#B45309"
                      : "var(--ink-faint)";
                const sig = SIGNAL[c.signal];
                return (
                  <tr key={c.seriesSlug} className="text-[13px] hover:bg-[var(--surface-card-soft)]" style={{ borderTop: "1px solid var(--admin-table-border)" }}>
                    <td className="px-5 py-3">
                      <span className="font-semibold text-[var(--ink-primary)]">{c.title}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[10px] text-[var(--ink-faint)]">{c.seriesSlug}</span>
                        <AccessModelChip model={c.accessModel} />
                      </div>
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-5 py-3 hidden md:table-cell font-mono font-semibold text-[var(--ink-primary)]">{c.enrollmentCount}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="analytics-bar flex-1">
                          <i className={barCls} style={{ width: `${Math.min(100, c.avgProgress)}%` }} />
                        </div>
                        <span className="font-mono text-[11.5px] font-semibold" style={{ color: pctCls }}>
                          {c.avgProgress}%
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell font-mono text-[11.5px] text-[var(--ink-muted)]">
                      <b className="text-[var(--ink-primary)] font-semibold">{c.lessonsCompleted}</b> / {c.totalLessons} lessons
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell">
                      <span className={`inline-block font-mono text-[9.5px] font-bold uppercase tracking-[0.05em] px-2 py-0.5 rounded-full ${sig.cls}`}>
                        {sig.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {courses.length === 0 && (
          <p className="px-5 py-6 text-sm text-gray-500">No course data yet.</p>
        )}
      </div>
    </div>
  );
}
