"use client";

import { useEffect } from "react";

export type AdminToastTone = "success" | "error" | "info";

export interface AdminToastMessage {
  text: string;
  tone?: AdminToastTone;
}

interface AdminToastProps {
  toast: AdminToastMessage | string | null;
  onDismiss: () => void;
  autoHideMs?: number;
}

export default function AdminToast({
  toast,
  onDismiss,
  autoHideMs = 4500,
}: AdminToastProps) {
  useEffect(() => {
    if (!toast || autoHideMs <= 0) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, autoHideMs);
    return () => clearTimeout(timer);
  }, [toast, autoHideMs, onDismiss]);

  if (!toast) return null;

  const text = typeof toast === "string" ? toast : toast.text;
  const inferredError =
    typeof toast === "string" &&
    /\b(failed|error|cannot|invalid|unable|rejected)\b/i.test(toast);
  const tone: AdminToastTone =
    typeof toast === "object" && toast.tone
      ? toast.tone
      : inferredError
        ? "error"
        : "success";

  const styles =
    tone === "error"
      ? "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300"
      : tone === "info"
        ? "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300"
        : "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 flex items-center justify-between gap-3 rounded-md border px-3.5 py-2 text-xs font-medium transition-colors ${styles}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            tone === "error"
              ? "bg-red-500"
              : tone === "info"
                ? "bg-sky-500"
                : "bg-emerald-500"
          }`}
        />
        <span>{text}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider opacity-75 hover:opacity-100"
      >
        Dismiss
      </button>
    </div>
  );
}
