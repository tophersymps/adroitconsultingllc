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
 * - `refresh()` drops the cached entry and refetches (used after an exam or a
 *   check is submitted).
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

  const refresh = useCallback(() => {
    CACHE.delete(series);
    setNonce((n) => n + 1);
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
