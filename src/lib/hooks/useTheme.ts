/**
 * useTheme — client hook for dark-mode state.
 *
 * Resolution model: `mode` is the user's stored preference ('system'|'light'|'dark'),
 * `resolvedDark` is the effective boolean applied to <html> (system → matchMedia).
 * The `dark` class lives on <html>; globals.css `html.dark` remaps the semantic
 * tokens. A ThemeProvider (client) owns applying the class + a tiny FOUC-guard
 * script in <head> sets it before hydration from localStorage.
 *
 * Persistence: localStorage 'adroit-theme' JSON `{ mode }` for guests; signed-in
 * accounts persist via PATCH /api/profile (themePref) and the provider adopts it.
 */

"use client";

import { useEffect } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "adroit-theme";

export function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "light";
    const parsed = JSON.parse(raw) as { mode?: ThemeMode; v?: number };
    // v<2 payloads predate the light-default change (mode 'system' was
    // auto-written on every visit): treat them as no preference -> light.
    if (parsed.v !== 2) return "light";
    if (parsed.mode === "light" || parsed.mode === "dark" || parsed.mode === "system") {
      return parsed.mode;
    }
    return "light";
  } catch {
    return "light";
  }
}

/** Pure: does a mode + OS matchMedia resolve to dark? */
export function resolveDark(mode: ThemeMode, prefersDark: boolean): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return prefersDark;
}

/** Apply the `dark` class to <html> per the resolved preference. */
export function applyDarkClass(dark: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", dark);
}

/** Persist mode to localStorage (best-effort; storage can throw). */
export function persistStoredMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, v: 2 }));
  } catch {
    // non-fatal — theme still applies for this session
  }
}

export function useThemeSystem(
  mode: ThemeMode,
  prefersDark: boolean,
): { resolvedDark: boolean; mode: ThemeMode } {
  const resolvedDark = resolveDark(mode, prefersDark);

  // Apply on every mode/OS change (idempotent class toggle).
  useEffect(() => {
    applyDarkClass(resolvedDark);
  }, [resolvedDark]);

  // Keep the FOUC-guard + server SSR in sync with any manual override.
  useEffect(() => {
    persistStoredMode(mode);
  }, [mode]);

  return { resolvedDark, mode };
}
