/**
 * ChronicleFeed — the profile "Chronicle" narrative feed (P2). One line per
 * completion event, newest first. Certificate rows use the red-star glyph,
 * lesson/quiz/exam rows the emerald record dot, with a mono score suffix for
 * quiz/exam (e.g. "8 / 10").
 */
"use client";

import type { ChronicleEntry } from "@/shared/contracts-constellations";

/** "2026-09-01T12:00:00Z" → "Sep 1". */
function shortDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ChronicleFeed({ entries }: { entries: ChronicleEntry[] }) {
  if (entries.length === 0) {
    return (
      <p
        className="text-[14px] text-[var(--ink-muted)]"
        data-testid="chronicle-empty"
      >
        Your sky is still forming. Complete a lesson to light your first star.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-[10px]" data-testid="chronicle-feed">
      {entries.map((entry) => {
        const isCert = entry.eventType === "certificate";
        return (
          <li
            key={entry.id}
            className="flex items-center gap-3 text-[13.5px]"
            data-testid={`chronicle-${entry.eventType}`}
          >
            <span
              aria-hidden
              className={`cx-chronicle-marker ${isCert ? "is-cert" : ""}`}
            />
            <span className="min-w-0 flex-1 truncate text-[var(--ink-body)]">
              {isCert ? (
                <span className="cx-cert-glyph">★ {entry.label}</span>
              ) : (
                entry.label
              )}
            </span>
            {entry.score != null && (
              <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                {entry.score} / 10
              </span>
            )}
            <span className="cx-chronicle-date text-[11px]">
              {shortDay(entry.completedAt)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default ChronicleFeed;
