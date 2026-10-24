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
  useSyncExternalStore,
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

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** No-op subscription — for client-only values that never change under us. */
const NO_SUBSCRIBE = () => () => {};

function subscribePrefersDark(onChange: () => void): () => void {
  const mq = window.matchMedia(MEDIA_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getPrefersDark(): boolean {
  try {
    return window.matchMedia(MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({
  children,
  accountPref,
}: {
  children: ReactNode;
  accountPref?: ThemeMode;
}) {
  // Hydration-safe by construction (QA R2-4 F4). localStorage and matchMedia do
  // not exist on the server, so the persisted/OS preference is read through
  // `useSyncExternalStore`, whose *server* snapshot is used for the hydration
  // render and whose client snapshot takes over immediately afterwards. Reading
  // storage in a useState initializer made the first client render disagree
  // with the server HTML — React logged #418, threw the server tree away and,
  // on re-render, dropped the `dark` class the FOUC guard had applied.
  const storedMode = useSyncExternalStore<ThemeMode>(
    NO_SUBSCRIBE,
    readStoredMode,
    () => "light",
  );
  const prefersDark = useSyncExternalStore<boolean>(
    subscribePrefersDark,
    getPrefersDark,
    () => false,
  );

  // Local overrides from the toggle win over both the account pref and storage.
  const [modeOverride, setModeOverride] = useState<ThemeMode | null>(null);
  const mode: ThemeMode = modeOverride ?? accountPref ?? storedMode;
  // True only once React has switched from the server snapshot to the client
  // ones. The apply/persist effect below must not run on the hydration commit:
  // `persistStoredMode("light")` there would overwrite the visitor's stored
  // preference before the client snapshot is ever read.
  const hydrated = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => true,
    () => false,
  );

  // Adopt a server-provided account pref when it arrives/changes — adjusted
  // during render (React's "adjust state when a prop changes" pattern), not
  // in an effect, to avoid cascading renders.
  const [prevAccountPref, setPrevAccountPref] = useState<ThemeMode | undefined>(
    accountPref,
  );
  if (prevAccountPref !== accountPref) {
    setPrevAccountPref(accountPref);
    if (accountPref) setModeOverride(accountPref);
  }

  const resolvedDark = mode === "dark" || (mode === "system" && prefersDark);

  // Apply to <html>; persist for guests (accounts persist via PATCH too).
  useEffect(() => {
    if (!hydrated) return;
    applyDarkClass(resolvedDark);
    persistStoredMode(mode);
  }, [hydrated, resolvedDark, mode]);

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
        setModeOverride(next);
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
        setModeOverride(next);
        return;
      }

      // Mount the opaque overlay (fades in), flip the theme at peak opacity
      // (~50% of the 440ms animation), unmount after the animation window.
      // Unmount via setTimeout (not onAnimationEnd) — deterministic, and the
      // animation end event isn't reliable if the tab is backgrounded.
      setOverlayColor(targetBg);
      window.setTimeout(() => setModeOverride(next), 220);
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
