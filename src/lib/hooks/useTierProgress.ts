/**
 * useTierProgress — one shared `GET /api/progress/quiz/tiers` per series page
 * (api-contracts.md §B.4).
 *
 * The series page renders three consumers of this endpoint — `CertReadiness`
 * in the hero, `ExamCard` and the knowledge-check list — and each used to
 * carry its own copy of the same effect, so a single page view issued three
 * identical requests. The module-level cache below is keyed by series and
 * holds both the in-flight promise and the resolved value, so N consumers
 * that mount in the same commit share ONE request.
 *
 * Contract:
 * - Guest / non-2xx / network error → `tiers: null`. Every consumer keeps its
 *   own unavailable state (CertReadiness renders nothing, ExamCard stays
 *   locked, the check list stays "Not taken") — the hook never invents stats.
 * - Hydration-safe: state starts `null` on both the server and the client's
 *   first render and only fills in from a post-mount effect, so the hook can
 *   never cause a hydration mismatch even when the cache is warm.
 * - Freshness: the cache outlives a mount, so anything that MUTATES the rollup
 *   must drop this series' entry. `invalidateTierProgress(series)` does exactly
 *   that and re-reads it in every consumer mounted right now (a no-op when the
 *   series page is not on screen). Submit flows call it (t_499542c6):
 *   `QuizWidget` after a graded knowledge-check answer, `ExamWidget` after the
 *   batch submit, `MarkComplete` after a lesson-completion toggle. The hook's
 *   own `refresh()` is the same operation scoped to its instance.
 *
 * Not to be confused with lesson gating — there is none (architecture.md §4).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import type { TierProgress } from "@/shared/contracts";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-events";

interface TierProgressEntry {
  /** In-flight request, shared by every consumer that mounts while it runs. */
  promise?: Promise<TierProgress | null>;
  /** Resolved value — `null` means guest/unavailable, and is cached as such. */
  data?: TierProgress | null;
}

/** Module-level cache: series slug → shared request/result. */
const CACHE = new Map<string, TierProgressEntry>();

/**
 * Per-series subscriber set: every mounted hook instance registers one
 * re-read callback. Invalidation fires them all, so N consumers on screen
 * collapse back into ONE request (they re-arm the same deduped `loadTiers`).
 * Keyed by series so invalidating one series never refetches another.
 */
const SUBSCRIBERS = new Map<string, Set<() => void>>();

export function tierProgressUrl(series: string): string {
  return `/api/progress/quiz/tiers?series=${encodeURIComponent(series)}`;
}

async function fetchTiers(series: string): Promise<TierProgress | null> {
  try {
    const res = await fetch(tierProgressUrl(series), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as TierProgress;
  } catch {
    // Guests / degraded route / offline — consumers render their unavailable
    // state. Never substitute mock stats here.
    return null;
  }
}

/**
 * Return the cached result, the shared in-flight promise, or start the single
 * request for this series.
 */
function loadTiers(series: string): Promise<TierProgress | null> {
  let entry = CACHE.get(series);
  if (!entry) {
    entry = {};
    CACHE.set(series, entry);
  }
  if (entry.data !== undefined) return Promise.resolve(entry.data);
  const inFlight = entry.promise;
  if (inFlight) return inFlight;
  const current = entry;
  const request = fetchTiers(series).then((data) => {
    current.data = data;
    current.promise = undefined;
    return data;
  });
  current.promise = request;
  return request;
}

/**
 * Drop the cached rollup for `series` and re-read it in every consumer that is
 * mounted right now. Call this from anything that mutates the series' progress
 * (quiz/check submit, exam batch submit, lesson-complete toggle) so a following
 * client-side navigation back to the series page cannot serve the pre-mutation
 * rollup.
 *
 * Safe from anywhere: with no consumer mounted for that series (the usual case
 * — the submit happened on the quiz/exam/lesson page) the entry is simply
 * dropped and the next mount fetches. Other series are untouched.
 */
export function invalidateTierProgress(series: string): void {
  CACHE.delete(series);
  const listeners = SUBSCRIBERS.get(series);
  if (!listeners) return;
  for (const listener of listeners) listener();
}

/**
 * Drop EVERY cached rollup and re-read in every mounted consumer.
 *
 * Use when the write has no series context — a lesson-completion toggle
 * (`useLessonProgress.markComplete`) changes the lessons-completed input of
 * whichever series the lesson belongs to, but the hook only knows the lesson
 * slug. Over-invalidating is cheap here: the next mount issues one request.
 */
export function invalidateAllTierProgress(): void {
  CACHE.clear();
  for (const series of [...SUBSCRIBERS.keys()]) {
    const listeners = SUBSCRIBERS.get(series);
    if (!listeners) continue;
    for (const listener of listeners) listener();
  }
}

export interface UseTierProgressReturn {
  /** `null` until the shared request lands, and for guest/error responses. */
  tiers: TierProgress | null;
  isLoading: boolean;
  /** Drop the cached entry for this series and fetch again. */
  refresh: () => void;
}

export function useTierProgress(series: string): UseTierProgressReturn {
  // Hydration-safe: never read the module cache in the initializer — the
  // server render has no cache, so a warm client cache would otherwise render
  // stats where the server rendered nothing.
  const [loaded, setLoaded] = useState<{ series: string; data: TierProgress | null } | null>(
    null,
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadTiers(series).then((data) => {
      if (cancelled) return;
      setLoaded({ series, data });
    });
    return () => {
      cancelled = true;
    };
  }, [series, nonce]);

  /*
   * Re-read on invalidation: `invalidateTierProgress(series)` drops the cache
   * entry and pings every mounted consumer (including this one, through the
   * subscription below), which re-arms the load effect. N consumers pinged at
   * once still share ONE request — `loadTiers` dedupes on the entry's in-flight
   * promise.
   */
  useEffect(() => {
    const reread = () => setNonce((n) => n + 1);
    let listeners = SUBSCRIBERS.get(series);
    if (!listeners) {
      listeners = new Set();
      SUBSCRIBERS.set(series, listeners);
    }
    const set = listeners;
    set.add(reread);
    return () => {
      set.delete(reread);
      if (set.size === 0) SUBSCRIBERS.delete(series);
    };
  }, [series]);

  /** Drop this series' cached entry and fetch again (invalidates every consumer). */
  const refresh = useCallback(() => {
    invalidateTierProgress(series);
  }, [series]);

  /*
   * Identity transition: the cached rollup belongs to whoever fetched it, so a
   * sign-in / sign-out / account switch must never keep serving it (the cache
   * outlives a mount, which the old per-component fetch did not). Same seam as
   * `invalidateProgressSummary()` (PERF-CACHE-M1): every mounted consumer drops
   * the entry and re-reads, and the first one to run shares its request with
   * the rest. `refresh` already deletes the entry and re-arms this effect.
   */
  useEffect(() => {
    window.addEventListener(AUTH_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  // A response for a previous series must never leak into the current one.
  const isCurrent = loaded !== null && loaded.series === series;

  return {
    tiers: isCurrent ? loaded.data : null,
    isLoading: !isCurrent,
    refresh,
  };
}

/**
 * Test-only: clear the module cache so one suite's mocked fetch never leaks
 * into another test's render.
 */
export function resetTierProgressCache(): void {
  CACHE.clear();
}
