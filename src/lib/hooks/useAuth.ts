/**
 * useAuth — client hook for the signed-in state.
 *
 * The browser never talks to Supabase directly for session state: the
 * server owns the session cookie (set by /api/auth/login via the SSR
 * client, refreshed by proxy.ts). This hook reads that state through
 * GET /api/auth/session and refreshes on a local auth-changed event.
 *
 * Why not supabase.auth.getSession() in the browser? The API routes
 * (getSupabaseServerClient) authenticate from the HttpOnly cookie — a
 * localStorage-only client session would be invisible to them and the
 * "authenticated" path would silently never fire.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { invalidateDbToken } from "@/lib/db/token-cache";
import { invalidateProgressSummary } from "@/lib/hooks/useProgressSummary";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-events";

export interface AuthUser {
  id: string;
  email: string;
  /** Derived server-side from user_roles (v4). False for non-admins. */
  isAdmin: boolean;
}

/**
 * Re-exported for backward compatibility: the constant now lives in
 * `@/lib/auth-events` so caches can subscribe without importing this hook
 * module (PERF-CACHE-M1, t_5f03a8f7).
 */
export { AUTH_CHANGED_EVENT };

interface UseAuthReturn {
  user: AuthUser | null;
  isLoading: boolean;
  /** Re-fetch session from the server (after login/logout). */
  refresh: () => Promise<void>;
}

/** Normalize a session user — always carries a definitive isAdmin flag. */
function normalizeUser(u: AuthUser | null): AuthUser | null {
  return u ? { ...u, isAdmin: u.isAdmin ?? false } : null;
}

/**
 * Shared in-flight/settled session read (PERF t_22e18719).
 *
 * Every `useAuth` caller used to issue its own `GET /api/auth/session`. On the
 * signed-in `/atlas` hub that is one card's `QuizStats` per card — 9 identical
 * requests for one identity. The session is per-cookie, not per-component, so
 * the module keeps ONE promise: concurrent mounts join it, later mounts read
 * the settled value. Identity transitions invalidate it explicitly
 * (`refresh` / `notifyAuthChanged` / the auth-changed + focus listeners).
 */
let sessionPromise: Promise<AuthUser | null> | null = null;
/** Set by an invalidation; the next `readSession` refetches in place. */
let sessionStale = false;
/** Collapses concurrent forced refreshes (an auth-changed event fans out to
 *  every mounted hook) into one network read. */
let sessionRefresh: Promise<AuthUser | null> | null = null;
/**
 * Identity generation (PERF-CACHE-M1, t_c0eaa6f2). `invalidateAuthSession()`
 * bumps it, so a session read that was already in flight when the identity
 * changed resolves to `null` instead of being handed to a subscriber — the
 * same belt-and-braces guard the summary cache uses. Without it, `refresh()`
 * could cache account A's `/api/auth/session` payload in the middle of B's
 * sign-in.
 */
let sessionEpoch = 0;

async function fetchSessionUser(epoch: number): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: AuthUser | null };
    const user = normalizeUser(data.user ?? null);
    // The identity changed while this read was in flight: this payload belongs
    // to the previous user (or to a guest). Never hand it to a subscriber.
    if (epoch !== sessionEpoch) return null;
    return user;
  } catch {
    return null;
  }
}

function readSession(): Promise<AuthUser | null> {
  if (sessionPromise && !sessionStale) return sessionPromise;
  sessionStale = false;
  sessionPromise = fetchSessionUser(sessionEpoch);
  return sessionPromise;
}

/** Force a re-read, sharing one request between all callers. */
function refreshSession(): Promise<AuthUser | null> {
  if (sessionRefresh) return sessionRefresh;
  sessionStale = false;
  const next = fetchSessionUser(sessionEpoch);
  sessionPromise = next;
  sessionRefresh = next;
  void next.finally(() => {
    if (sessionRefresh === next) sessionRefresh = null;
  });
  return next;
}

/**
 * Drop the shared session read so the next `useAuth` mount refetches.
 *
 * Called from `notifyAuthChanged()` and from `useAuth`'s own
 * auth-changed/focus listener (PERF-CACHE-M1, t_c0eaa6f2). Both are identity
 * transitions: a cross-account tab chain that only broadcasts an event must
 * not keep serving the previous session promise to the next mount. Bumping the
 * epoch also discards a read that is in flight right now.
 */
export function invalidateAuthSession(): void {
  sessionEpoch += 1;
  sessionStale = true;
  sessionPromise = null;
  sessionRefresh = null;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    // A read started before an identity transition resolves to `null` by
    // design; ignore it when a newer transition has already superseded us, so
    // a stale read can never blank out (or overwrite) the newer user.
    const epoch = sessionEpoch;
    const next = await refreshSession();
    if (epoch !== sessionEpoch) return;
    setUser(next);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const epoch = sessionEpoch;
      const next = await readSession();
      if (cancelled || epoch !== sessionEpoch) return;
      setUser(next);
      setIsLoading(false);
    })();
    /*
     * SEC-R2-2-M3(b): an auth-changed event (or a focus, which is how a
     * sign-out in another tab shows up here) means the identity behind the
     * session cookie may have changed. Drop the cached Data API JWT before
     * re-reading, so this tab cannot keep sending the previous user's token.
     */
    const onAuthChanged = () => {
      invalidateDbToken();
      /*
       * PERF-CACHE-M1 (t_5f03a8f7 / t_c0eaa6f2): the progress summary and the
       * session read are module state and per-session. An auth-changed event
       * here also arrives via `focus`, which is how a sign-out in ANOTHER tab
       * shows up — so this is the only seam that covers a cross-tab identity
       * change. Both caches must die here, before the re-read.
       */
      invalidateAuthSession();
      invalidateProgressSummary();
      /*
       * Defer the re-read to a microtask so every mounted useAuth listener's
       * synchronous invalidation lands first. Calling refresh() here per
       * instance would start a read at each intermediate epoch; the later
       * listeners bump the epoch again, so all but the last read resolve to
       * null and only one mounted instance updates after a cross-tab change.
       * After the dispatch settles, the first refresh starts ONE read at the
       * final epoch and the remaining listeners join it.
       */
      queueMicrotask(() => {
        if (!cancelled) refresh();
      });
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener("focus", onAuthChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener("focus", onAuthChanged);
    };
  }, [refresh]);

  return { user, isLoading, refresh };
}

/**
 * Broadcast that auth state changed so useAuth instances re-read.
 *
 * Also drops the cached Data API JWT (SEC-R2-2-M3(b)) and the cached progress
 * summary (PERF-CACHE-M1, t_5f03a8f7): every caller of this function is
 * announcing an identity transition (sign-in, sign-out, account switch), and
 * both caches are module state that survives a client-side `router.refresh()` /
 * `router.push()`. Dropping them here covers call sites that forget to.
 */
export function notifyAuthChanged(): void {
  invalidateDbToken();
  /*
   * Both module caches are per-session. Invalidating here (rather than only at
   * the sign-out/sign-in seams) means no current or future caller can leak the
   * previous identity — the summary's completedLessons/quizStats, or the
   * session payload itself — into the next session. Called BEFORE the event is
   * dispatched so listeners re-read under the new epoch.
   */
  invalidateAuthSession();
  invalidateProgressSummary();
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  } catch {
    // non-fatal
  }
}
