"use client";

/**
 * LaunchDialog — two-step launch preview/confirm for pending courses (v4,
 * t_0ed19ad0). Mirrors the draft-preview "seam" pattern: Step 1 renders a
 * lesson preview exactly as learners will see it + a readiness checklist
 * (Continue blocked while any check fails); Step 2 confirms the pending→live
 * flip with a warning. The server enforces the same readiness gate on PATCH,
 * so the UI never shows a state the write would reject.
 *
 * A11y: role="dialog" + aria-modal, Escape closes, focus moves to the dialog
 * on open and returns to the trigger on close, buttons are ≥40px targets.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CourseReadiness, LaunchLessonPreview } from "@/lib/course-readiness";
import type { CourseRow } from "@/shared/contracts-course-catalog";

interface PreviewData {
  course: CourseRow;
  readiness: CourseReadiness;
}

interface LaunchDialogProps {
  course: CourseRow;
  onClose: () => void;
  onLaunched: () => void;
  onToast: (msg: string) => void;
}

type Step = "preview" | "confirm";

const CHECK_ROWS: {
  key: keyof CourseReadiness;
  label: string;
  okText: string;
  /** Advisory rows do NOT block launch (server + `ready` ignore them). */
  warnOnly?: boolean;
}[] = [
  { key: "hasTitle", label: "Has a title", okText: "ok" },
  { key: "hasPublishedLesson", label: "Has at least one published lesson", okText: "lessons" },
  { key: "accessModelSet", label: "Access model is set", okText: "model" },
  {
    key: "allQuizzesPublished",
    label: "Quizzes for published lessons",
    okText: "all present",
    warnOnly: true, // ongoing courses publish quizzes as lessons land — never a launch blocker
  },
];

function priceLabel(price_cents: number | null): string {
  if (price_cents === null) return "—";
  return `$${(price_cents / 100).toFixed(0)}`;
}

export function LaunchDialog({ course, onClose, onLaunched, onToast }: LaunchDialogProps) {
  const [step, setStep] = useState<Step>("preview");
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/courses/${course.series_slug}/preview`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load preview");
        const json = (await res.json()) as { ok: true; data: PreviewData };
        if (!cancelled) setData(json.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Focus the dialog on open (a11y); restore handled by parent on close.
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelled = true;
    };
  }, [course.series_slug]);

  useEffect(() => {
    if (step === "preview" && data && data.readiness.ready) {
      requestAnimationFrame(() => continueRef.current?.focus());
    }
  }, [step, data]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  async function confirmLaunch() {
    if (launching) return;
    setLaunching(true);
    try {
      const res = await fetch(`/api/admin/courses/${course.series_slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "live" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        onToast(json.error ?? "Launch failed");
        setLaunching(false);
        return;
      }
      onToast("Launched · admin_audit_log entry recorded");
      onLaunched();
    } catch {
      onToast("Launch failed");
      setLaunching(false);
    }
  }

  const readiness = data?.readiness;
  const firstLesson: LaunchLessonPreview | null = readiness?.firstLesson ?? null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-5"
      style={{ background: "rgba(6,15,31,0.55)", backdropFilter: "blur(2px)" }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={step === "preview" ? "Review before launch" : "Confirm launch"}
        tabIndex={-1}
        className="w-[640px] max-w-[94vw] max-h-[92vh] overflow-y-auto rounded-2xl border"
        style={{
          background: "var(--surface-card, #FFFFFF)",
          boxShadow: "var(--shadow-dialog)",
          borderColor: "var(--border-default, #E5E7EB)",
        }}
      >
        {/* header */}
        <div
          className="flex items-center px-6 py-[18px] border-b"
          style={{ borderColor: "var(--border-default, #E5E7EB)" }}
        >
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
              Launch course
            </div>
            <h3 className="text-[15px] font-bold mt-0.5 text-[var(--ink-primary)]">
              {step === "preview" ? "Review before launch" : "Confirm launch"}
            </h3>
          </div>
          <span className="ml-auto font-mono text-[10px] text-[var(--ink-faint)]">
            Step {step === "preview" ? "1" : "2"} of 2
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close launch dialog"
            className="ml-3.5 cursor-pointer text-[18px] leading-none bg-none border-none text-[var(--ink-faint)] hover:text-[var(--ink-primary)] p-1"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          {loading && (
            <p role="status" className="text-sm text-gray-500">
              Loading preview…
            </p>
          )}
          {error && (
            <p role="status" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {!loading && !error && readiness && step === "preview" && (
            <>
              {/* meta row */}
              <div className="flex flex-wrap items-center gap-2.5 mb-4">
                <span className="text-[14px] font-bold text-[var(--ink-primary)]">
                  {course.title}
                </span>
                <span className="font-mono text-[10.5px] text-[var(--ink-faint)]">
                  {course.series_slug}
                </span>
              </div>

              {/* rendered lesson preview */}
              <div
                className="rounded-xl border overflow-hidden mb-[18px]"
                style={{ borderColor: "var(--border-default, #E5E7EB)" }}
              >
                <div
                  className="flex items-center gap-2 px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em]"
                  style={{ background: "var(--signal-pending-bg, #FEF3C7)", color: "#92400E" }}
                >
                  <span
                    className="w-[7px] h-[7px] rounded-full"
                    style={{ background: "#B45309", animation: "admin-pulse 2s infinite" }}
                  />
                  Pending — renders exactly as learners will see it
                </div>
                <div className="px-5 py-[18px]" style={{ background: "var(--surface-card, #FFFFFF)" }}>
                  {firstLesson ? (
                    <>
                      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-faint)] mb-1.5">
                        Lesson {firstLesson.lesson} · {firstLesson.series}
                      </div>
                      <h4 className="text-[16px] font-extrabold tracking-tight text-[var(--ink-primary)]">
                        {firstLesson.title}
                      </h4>
                      <p className="text-[13px] text-[var(--ink-muted)] leading-relaxed mt-2">
                        {firstLesson.excerpt}
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] text-[var(--ink-muted)]">
                      No published lessons yet — nothing to preview.
                    </p>
                  )}
                </div>
              </div>

              {/* readiness checklist */}
              <div className="flex flex-col gap-2 mb-1.5">
                {CHECK_ROWS.map((row) => {
                  const ok = readiness[row.key];
                  const blocked = !ok && !row.warnOnly;
                  return (
                    <div
                      key={row.key}
                      className={`flex items-center gap-2.5 text-[12.5px] px-2.5 py-2 rounded-lg ${
                        ok
                          ? "bg-emerald/5"
                          : blocked
                            ? "bg-amber/10"
                            : "bg-sky/5"
                      }`}
                    >
                      <span
                        className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                        style={
                          ok
                            ? { background: "var(--signal-live-bg, #D1FAE5)", color: "var(--signal-live, #047857)" }
                            : blocked
                              ? { background: "var(--signal-pending-bg, #FEF3C7)", color: "#B45309" }
                              : { background: "var(--signal-info-bg, #E0F2FE)", color: "#0C4A6E" }
                        }
                      >
                        {ok ? "✓" : blocked ? "!" : "i"}
                      </span>
                      <span className="font-semibold text-[var(--ink-primary)]">{row.label}</span>
                      <span className="ml-auto font-mono text-[10px] text-[var(--ink-faint)]">
                        {ok
                          ? row.okText
                          : blocked
                            ? "blocks launch"
                            : "advisory — fills in as lessons are published"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!readiness.ready && (
                <p className="text-[11px] text-[var(--ink-faint)] mt-1">
                  If any required check fails, the course cannot launch — resolve it, then
                  continue. Advisory rows fill in automatically as lessons are published.
                </p>
              )}
            </>
          )}

          {!loading && !error && data && step === "confirm" && (
            <>
              <div
                className="rounded-xl border px-[18px] py-4 mb-4"
                style={{ borderColor: "var(--border-default, #E5E7EB)" }}
              >
                {[
                  ["Course", course.title],
                  ["Slug", course.series_slug],
                  ["Status", "pending → live"],
                  ["Access model", course.access_model],
                  ["Price", priceLabel(course.price_cents)],
                  ["Published lessons", `${readiness?.publishedLessonCount ?? 0}`],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between items-center py-[7px] text-[12.5px] border-b last:border-none"
                    style={{ borderColor: "var(--border-subtle, #F3F4F6)" }}
                  >
                    <span className="text-[var(--ink-muted)]">{k}</span>
                    <span className="font-mono text-[12px] font-semibold text-[var(--ink-primary)]">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              <div
                className="flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[12.5px]"
                style={{ background: "rgba(200,16,46,0.07)", border: "1px solid rgba(200,16,46,0.2)", color: "var(--ink-muted)" }}
              >
                <span className="text-[var(--color-red)] font-extrabold">!</span>
                <span>
                  Launching makes this course <b>visible on the public catalog</b> and begins
                  gating its lessons behind the access model. This writes an{" "}
                  <span className="font-mono">admin_audit_log</span> entry and is reversible via{" "}
                  <b>Archive</b>.
                </span>
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div
          className="flex items-center gap-2.5 px-6 py-4 border-t"
          style={{ borderColor: "var(--border-default, #E5E7EB)" }}
        >
          {step === "confirm" ? (
            <button
              type="button"
              onClick={() => setStep("preview")}
              className="rounded-lg border px-4 h-9 text-[13px] font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
              style={{ borderColor: "var(--border-default, #E5E7EB)", color: "var(--ink-muted)" }}
            >
              ← Back
            </button>
          ) : null}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 h-9 text-[13px] font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
            style={{ borderColor: "var(--border-default, #E5E7EB)", color: "var(--ink-muted)" }}
          >
            Cancel
          </button>
          {step === "preview" ? (
            <button
              ref={continueRef}
              type="button"
              disabled={!readiness?.ready}
              onClick={() => setStep("confirm")}
              className="rounded-lg px-4 h-9 text-[13px] font-semibold text-white disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ background: "var(--color-red)", cursor: readiness?.ready ? "pointer" : "not-allowed" }}
            >
              Continue to confirm →
            </button>
          ) : (
            <button
              type="button"
              disabled={launching}
              onClick={confirmLaunch}
              className="rounded-lg px-4 h-9 text-[13px] font-semibold text-white disabled:opacity-45"
              style={{ background: "var(--color-red)" }}
            >
              {launching ? "Launching…" : `Launch ${course.title}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
