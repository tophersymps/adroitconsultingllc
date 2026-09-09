/**
 * ReadFilter — All / Unread / Read segmented control (design brief §4.2).
 *
 * Reads the real merged read state (localStorage + Supabase summary) via
 * useProgressSummary, so the per-segment counts and filtering reflect
 * ACTUAL progress, not a static count. Controlled by the parent through
 * `value` + `onChange` (parent owns the `?read=` URL param).
 */
"use client";

import { useMemo } from "react";
import { useProgressSummary } from "@/lib/hooks/useProgressSummary";

export type ReadFilterValue = "all" | "unread" | "read";

interface ReadFilterProps {
  /** Canonical read keys, e.g. ["blog/foo", "blog/bar"]. */
  readKeys: string[];
  value: ReadFilterValue;
  onChange: (value: ReadFilterValue) => void;
}

const options: { value: ReadFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

export default function ReadFilter({ readKeys, value, onChange }: ReadFilterProps) {
  const { merge } = useProgressSummary(readKeys, []);

  const counts = useMemo(() => {
    const readCount = readKeys.filter((key) => merge.read.has(key)).length;
    return {
      all: readKeys.length,
      unread: readKeys.length - readCount,
      read: readCount,
    };
  }, [readKeys, merge.read]);

  return (
    <div
      role="group"
      aria-label="Filter by read status"
      className="inline-flex items-center rounded-full border border-gray-200 bg-white p-0.5 text-xs font-semibold"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full cursor-pointer transition-all duration-150 active:scale-[0.98] ${
              active
                ? "bg-navy text-white shadow-sm"
                : "text-gray-500 hover:text-navy"
            }`}
          >
            {opt.label}
            <span
              className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full font-mono text-[10px] font-bold tabular-nums transition-colors duration-150 ${
                active
                  ? "bg-white/15 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {counts[opt.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
