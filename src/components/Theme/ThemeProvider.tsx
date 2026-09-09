/**
 * ThemeProvider — client context provider for site-wide dark mode.
 *
 * Owns the current mode ('system'|'light'|'dark'), resolves it against the OS
 * prefers-color-scheme, and applies the `dark` class to <html>. Exposes
 * { mode, setMode, resolvedDark } via useThemeContext. A FOUC-guard inline
 * script in the root layout applies the persisted preference before hydration.
 *
 * `accountPref` (optional): the signed-in user's user_profiles.theme_pref from
 * the server (SSR). When present it seeds the initial mode so a logged-in
 * account's saved preference wins over guest localStorage.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyDarkClass,
  persistStoredMode,
  readStoredMode,
  resolveDark,
  type ThemeMode,
} from "@/lib/hooks/useTheme";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  accountPref,
}: {
  children: ReactNode;
  accountPref?: ThemeMode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(() =>
    accountPref ?? readStoredMode(),
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  // Track OS preference changes (subscription callbacks only — no sync setState).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Adopt a server-provided account pref when it arrives/changes — adjusted
  // during render (React's "adjust state when a prop changes" pattern), not
  // in an effect, to avoid cascading renders.
  const [prevAccountPref, setPrevAccountPref] = useState<ThemeMode | undefined>(
    accountPref,
  );
  if (prevAccountPref !== accountPref) {
    setPrevAccountPref(accountPref);
    if (accountPref) setModeState(accountPref);
  }

  const resolvedDark = mode === "dark" || (mode === "system" && prefersDark);

  // Apply to <html>; persist for guests (accounts persist via PATCH too).
  useEffect(() => {
    applyDarkClass(resolvedDark);
    persistStoredMode(mode);
  }, [resolvedDark, mode]);

  // Overlay color while a theme-switch cross-fade is in flight (null = none).
  const [overlayColor, setOverlayColor] = useState<string | null>(null);

  const setMode = useCallback(
    (next: ThemeMode) => {
      const targetDark = resolveDark(next, prefersDark);
      if (targetDark === resolvedDark && next === mode) return;

      // Reduced-motion users get an instant switch — no overlay at all.
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
      if (reduce) {
        setModeState(next);
        return;
      }

      // Capture the TARGET theme's --surface-page so the overlay bridges the
      // swap. The class toggle/restore below is synchronous (no paint between
      // getComputedStyle reads), so nothing flickers.
      const root = document.documentElement;
      const hadDark = root.classList.contains("dark");
      if (hadDark !== targetDark) root.classList.toggle("dark", targetDark);
      let targetBg = "";
      try {
        targetBg =
          getComputedStyle(root)
            .getPropertyValue("--surface-page")
            .trim() || "";
      } catch {
        targetBg = "";
      }
      if (hadDark !== targetDark) root.classList.toggle("dark", hadDark);
      if (!targetBg) {
        setModeState(next);
        return;
      }

      // Mount the opaque overlay (fades in), flip the theme at peak opacity
      // (~50% of the 440ms animation), unmount after the animation window.
      // Unmount via setTimeout (not onAnimationEnd) — deterministic, and the
      // animation end event isn't reliable if the tab is backgrounded.
      setOverlayColor(targetBg);
      window.setTimeout(() => setModeState(next), 220);
      window.setTimeout(() => setOverlayColor(null), 480);
    },
    [mode, prefersDark, resolvedDark],
  );

  const value = useMemo(
    () => ({ mode, setMode, resolvedDark }),
    [mode, setMode, resolvedDark],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {overlayColor ? (
        <div
          aria-hidden
          className="theme-fade-overlay"
          style={{ background: overlayColor }}
        />
      ) : null}
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within <ThemeProvider>");
  }
  return ctx;
}
