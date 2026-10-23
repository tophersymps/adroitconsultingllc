/**
 * useProgressSummary — client hook that merges localStorage progress with the
 * authenticated user's Supabase summary (GET /api/progress/summary).
 *
 * Used by aggregate indicators (learn hub, series pages, blog listing) so the
 * bars reflect REAL progress instead of published counts.
 *
 * PERF (t_22e18719): the summary is per-session, not per-component. Without a
 * shared cache the signed-in `/atlas` hub issued one `/api/progress/summary`
 * per card (9 cards → 9 identical requests), because every `SeriesProgress`
 * mounts its own hook instance. The payload now also carries the caller's quiz
 * stats (`quizStats`), so `QuizStats` reads them from that same single request
 * instead of one `/api/progress/quiz/run` per series.
 */
"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import {
  mergeProgressFromSummary,
  PROGRESS_CHANGED_EVENT,
  type ProgressMerge,
} from "@/lib/progress";
/*
 * SEC-R2-F1 (t_2dd0e9f9): import the event name from its own module, not from
 * `useAuth`. `useAuth` now calls `invalidateProgressSummary()` on every
 * identity transition — including the cross-tab `focus` path — so importing
 * `useAuth` here would close the cycle `useAuth → useProgressSummary → useAuth`.
 */
import { AUTH_CHANGED_EVENT } from "@/lib/auth-events";

interface UseProgressSummaryReturn {
  /** Merged read/completed sets (slug keys, bare form). */
  merge: ProgressMerge;
  isLoading: boolean;
  /** Re-fetch the Supabase summary (e.g. after marking something read). */
  refresh: () => Promise<void>;
}

/** Per-quiz aggregate shipped with the summary (cross-device quiz strip). */
export interface ProgressQuizStats {
  bestScore: number;
  attempts: number;
}

export interface ProgressSummaryPayload {
  readContent?: { blog?: string[]; lesson?: string[] };
  completedLessons?: string[];
  quizStats?: Record<string, ProgressQuizStats>;
}

/** Shared empty merge — the hydration-safe first-render value (never mutated). */
const EMPTY_MERGE: ProgressMerge = { read: new Set(), lessons: new Set() };

/** No-op subscription — the hydration flag never changes after mount. */
const NO_SUBSCRIBE = () => () => {};

/*
 * One summary read per session, shared by every subscriber.
 *
 *  - `summaryPromise` is the settled/in-flight read;
 *  - `summaryStale` is set by an invalidation so the next read refetches;
 *  - `summaryRefresh` collapses concurrent forced refreshes (N `refresh()`
 *    calls from N mounted cards) into a single network request;
 *  - `summaryEpoch` is the identity generation (PERF-P1, t_e786efe2). An
 *    invalidation bumps it, so a summary read that was already in flight when
 *    the identity changed is discarded instead of cached — otherwise user A's
 *    payload could land *after* user B's sign-in.
 */
let summaryPromise: Promise<ProgressSummaryPayload | null> | null = null;
let summaryStale = false;
let summaryRefresh: Promise<ProgressSummaryPayload | null> | null = null;
let summaryEpoch = 0;

async function fetchProgressSummary(
  epoch: number,
): Promise<ProgressSummaryPayload | null> {
  try {
    const res = await fetch("/api/progress/summary", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as ProgressSummaryPayload;
    // The identity changed while this read was in flight: this payload belongs
    // to the previous user (or to a guest). Never hand it to a subscriber.
    if (epoch !== summaryEpoch) return null;
    return data;
  } catch {
    return null;
  }
}

/** Read the session's progress summary, sharing one in-flight request. */
export function readProgressSummary(): Promise<ProgressSummaryPayload | null> {
  if (summaryPromise && !summaryStale) return summaryPromise;
  summaryStale = false;
  summaryPromise = fetchProgressSummary(summaryEpoch);
  return summaryPromise;
}

/** Force a re-read of the session summary (after a progress write). */
export function refreshProgressSummary(): Promise<ProgressSummaryPayload | null> {
  if (summaryRefresh) return summaryRefresh;
  summaryStale = false;
  const next = fetchProgressSummary(summaryEpoch);
  summaryPromise = next;
  summaryRefresh = next;
  void next.finally(() => {
    if (summaryRefresh === next) summaryRefresh = null;
  });
  return next;
}

/**
 * Drop the cached summary so the next read refetches (identity transition).
 *
 * Called centrally from `notifyAuthChanged()` and from `useAuth`'s own
 * auth-changed/**focus** listener (SEC-R2-F1, t_2dd0e9f9), so a cached
 * *authenticated* payload can never outlive the session that produced it —
 * including when the sign-out/sign-in happened in ANOTHER tab and this tab only
 * learns about it through `focus`. The explicit seam calls in
 * Header/login/reset-password remain (they run before `notifyAuthChanged`,
 * which is idempotent).
 */
export function invalidateProgressSummary(): void {
  summaryEpoch += 1;
  summaryStale = true;
  summaryPromise = null;
  summaryRefresh = null;
}

export function useProgressSummary(
  readSlugs: string[],
  lessonSlugs: string[],
): UseProgressSummaryReturn {
  const [summary, setSummary] = useState<ProgressSummaryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Hydration-safe (QA R2-4 F4): the merge below reads localStorage, which the
  // server cannot see. Computing it on the first client render made aggregate
  // counters ("Read N", progress bars) disagree with the server HTML and
  // tripped React #418 (text) on /field-notes and /atlas for any returning
  // visitor. `useSyncExternalStore` renders the empty merge during hydration and
  // switches to the storage-aware merge immediately after.
  const hydrated = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => true,
    () => false,
  );
  // Bumped on every PROGRESS_CHANGED_EVENT so aggregate bars re-read
  // localStorage immediately after a mark-read/complete action.
  const [, setChangeTick] = useState(0);

  /*
   * SEC-L1 (t_15a53bb8): the event-driven refresh needs the same epoch guard as
   * the mount effects. `fetchProgressSummary` returns null when its read
   * crossed an identity transition; applying that null here would erase the new
   * identity's payload when the abandoned read settles last (blank bars until
   * the next event/remount). Never apply a read from a superseded epoch.
   */
  const refresh = useCallback(async () => {
    const readEpoch = summaryEpoch;
    const data = await refreshProgressSummary();
    if (readEpoch !== summaryEpoch) return;
    setSummary(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    /*
     * QA-L1 (t_2dd0e9f9): capture the identity epoch this read belongs to.
     * `fetchProgressSummary` already returns null for a read that crossed an
     * identity transition (privacy), but that null must not be applied here:
     * a stale mount read settling AFTER the post-transition refresh delivered
     * the new user's payload would erase it (`setSummary(null)`), leaving the
     * card blank until the next remount.
     */
    const epoch = summaryEpoch;
    (async () => {
      const data = await readProgressSummary();
      if (cancelled) return;
      if (epoch !== summaryEpoch) return; // identity changed mid-flight; the seam re-reads
      setSummary(data);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live-update aggregate bars when any progress hook writes localStorage.
  useEffect(() => {
    const onChanged = () => setChangeTick((t) => t + 1);
    window.addEventListener(PROGRESS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener(PROGRESS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  /*
   * Identity transition (PERF-P1, t_e786efe2 / SEC-R2-F1, t_2dd0e9f9): sign-in,
   * sign-out or an account switch means the cached summary belongs to someone
   * else. Re-read it in place so a mounted card never keeps rendering the
   * previous user's bars.
   *
   * The cache is dropped at the identity seams (`invalidateProgressSummary()`
   * next to `invalidateDbToken()`) and by `useAuth`'s auth-changed/**focus**
   * listener — the latter is the only seam that sees a sign-out in ANOTHER tab.
   * Subscribers deliberately do NOT invalidate here: `invalidateProgressSummary`
   * bumps the identity epoch, so N mounted cards each invalidating would kill
   * the previous card's in-flight read (only the last one would resolve).
   * `refreshProgressSummary` collapses the whole fan-out into ONE request
   * instead.
   *
   * The `focus` re-read is deferred to a microtask so it runs AFTER every
   * synchronous focus listener — notably `useAuth`'s epoch bump — regardless of
   * listener registration order.
   */
  useEffect(() => {
    let cancelled = false;
    const onAuthChanged = () => {
      void refresh();
    };
    const onFocus = () => {
      queueMicrotask(() => {
        if (!cancelled) void refresh();
      });
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const merge = hydrated
    ? mergeProgressFromSummary(summary, readSlugs, lessonSlugs)
    : EMPTY_MERGE;

  return { merge, isLoading, refresh };
}

/**
 * Quiz stats for one quiz name, read from the shared summary payload.
 *
 * Returns `null` until the summary lands (or when the caller has no runs for
 * that quiz) so the consumer falls back to its localStorage copy. This is what
 * removes the per-series `GET /api/progress/quiz/run` fan-out: the quiz strip
 * renders from the single `/api/progress/summary` read.
 *
 * `enabled` is false for guests — they must not trigger the authenticated
 * progress read at all (the guest path stays at zero extra requests).
 */
export function useSessionQuizStats(
  quizName: string,
  enabled = true,
): ProgressQuizStats | null {
  const [summary, setSummary] = useState<ProgressSummaryPayload | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // QA-L1 (t_2dd0e9f9): a mount read that crossed an identity transition
    // resolves to null; applying it would erase the new user's quiz strip that
    // the seam refresh already delivered. Only apply a read from our epoch.
    const epoch = summaryEpoch;
    (async () => {
      const data = await readProgressSummary();
      if (cancelled || epoch !== summaryEpoch) return;
      setSummary(data);
    })();
    // Identity transition (PERF-P1, t_e786efe2 / SEC-R2-F1, t_2dd0e9f9): the
    // quiz strip must switch to the new user's aggregates, not keep the
    // previous user's numbers. The seam's invalidate already dropped the cache;
    // this re-read collapses with every other mounted subscriber into one
    // request. `focus` is a cross-tab sign-out/sign-in, and is deferred to a
    // microtask so it runs after `useAuth`'s synchronous epoch bump.
    const readAgain = () => {
      const readEpoch = summaryEpoch;
      void refreshProgressSummary().then((data) => {
        if (cancelled || readEpoch !== summaryEpoch) return;
        setSummary(data);
      });
    };
    const onFocus = () => {
      queueMicrotask(() => {
        if (!cancelled) readAgain();
      });
    };
    window.addEventListener(AUTH_CHANGED_EVENT, readAgain);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGED_EVENT, readAgain);
      window.removeEventListener("focus", onFocus);
    };
  }, [quizName, enabled]);

  if (!enabled) return null;
  return summary?.quizStats?.[quizName] ?? null;
}
