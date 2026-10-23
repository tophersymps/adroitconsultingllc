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
import { invalidateDbToken } from "@/lib/db/client";

export interface AuthUser {
  id: string;
  email: string;
  /** Derived server-side from user_roles (v4). False for non-admins. */
  isAdmin: boolean;
}

export const AUTH_CHANGED_EVENT = "adroit-blog:auth-changed";

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

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = (await res.json()) as { user: AuthUser | null };
      setUser(normalizeUser(data.user ?? null));
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = (await res.json()) as { user: AuthUser | null };
        if (!cancelled) setUser(normalizeUser(data.user ?? null));
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    /*
     * SEC-R2-2-M3(b): an auth-changed event (or a focus, which is how a
     * sign-out in another tab shows up here) means the identity behind the
     * session cookie may have changed. Drop the cached Data API JWT before
     * re-reading, so this tab cannot keep sending the previous user's token.
     */
    const onAuthChanged = () => {
      invalidateDbToken();
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
 * Also drops the cached Data API JWT (SEC-R2-2-M3(b)): every caller of this
 * function is announcing an identity transition (sign-in, sign-out, account
 * switch), and the token cache is module state that survives a client-side
 * `router.refresh()`. Dropping it here covers call sites that forget to.
 */
export function notifyAuthChanged(): void {
  invalidateDbToken();
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  } catch {
    // non-fatal
  }
}
