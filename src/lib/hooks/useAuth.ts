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
 * module (t_2dd0e9f9 — breaks the `useAuth` → `useProgressSummary` cycle).
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

async function fetchSessionUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: AuthUser | null };
    return normalizeUser(data.user ?? null);
  } catch {
    return null;
  }
}

function readSession(): Promise<AuthUser | null> {
  if (sessionPromise && !sessionStale) return sessionPromise;
  sessionStale = false;
  sessionPromise = fetchSessionUser();
  return sessionPromise;
}

/** Force a re-read, sharing one request between all callers. */
function refreshSession(): Promise<AuthUser | null> {
  if (sessionRefresh) return sessionRefresh;
  sessionStale = false;
  const next = fetchSessionUser();
  sessionPromise = next;
  sessionRefresh = next;
  void next.finally(() => {
    if (sessionRefresh === next) sessionRefresh = null;
  });
  return next;
}

/**
 * Drop the shared session read so the next `useAuth` mount refetches.
 * Call on any identity transition (sign-in, sign-out, account switch).
 */
export function invalidateAuthSession(): void {
  sessionStale = true;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setUser(await refreshSession());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await readSession();
      if (cancelled) return;
      setUser(next);
      setIsLoading(false);
    })();
    /*
     * SEC-R2-2-M3(b): an auth-changed event (or a focus, which is how a
     * sign-out in another tab shows up here) means the identity behind the
     * session cookie may have changed. Drop the cached Data API JWT before
     * re-reading, so this tab cannot keep sending the previous user's token.
     *
     * SEC-R2-F1 (t_2dd0e9f9): the progress-summary cache is per-session module
     * state too. This is the ONLY seam that sees a cross-tab sign-out/sign-in,
     * so it must bump the summary epoch as well — otherwise user B keeps
     * seeing user A's completedLessons/quizStats until a hard reload.
     */
    const onAuthChanged = () => {
      invalidateDbToken();
      invalidateProgressSummary();
      refresh();
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
 * summary (SEC-R2-F1, t_2dd0e9f9): every caller of this function is announcing
 * an identity transition (sign-in, sign-out, account switch), and both caches
 * are module state that survives a client-side `router.refresh()` /
 * `router.push()`. Dropping them here covers call sites that forget to.
 */
export function notifyAuthChanged(): void {
  invalidateDbToken();
  /*
   * The summary is per-session module state too. Invalidating here (rather than
   * only at the sign-out/sign-in seams) means no current or future caller can
   * leak the previous identity's completedLessons/quizStats into the next
   * session.
   */
  invalidateProgressSummary();
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  } catch {
    // non-fatal
  }
}
