/**
 * src/lib/exam-config.ts — the numeric exam contract.
 *
 * One home for the values that used to be copy-pasted across five surfaces
 * (ExamWidget, ExamLocked, ExamCard, the exam page and GuestCTA). Copy lives in
 * `exam-labels.ts`; numbers live here.
 *
 * Client-safe by construction: no imports, no server API, no content data — so
 * both server components and `"use client"` widgets can read it without
 * dragging the learn dataset or `fs` into a browser bundle.
 */

/** Exam duration in minutes. Read by every exam surface, never hardcode 105. */
export const CERT_EXAM_MINUTES = 105;

/** Exam pass threshold (percent). Naming-only release: the 72% rule is unchanged (D-3). */
export const CERT_EXAM_PASS_PCT = 72;

/** Knowledge-check pass threshold (percent) — the exam unlocks once every check clears it. */
export const CERT_CHECK_PASS_PCT = 80;
