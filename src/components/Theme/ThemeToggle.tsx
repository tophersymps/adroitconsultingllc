/**
 * ThemeToggle — segmented System/Light/Dark control (Settings) + compact
 * quick-toggle variant (avatar menu). Drives ThemeProvider via useThemeContext
 * and persists per-account through PATCH /api/profile (themePref) when authed.
 */

"use client";

import { useEffect, useRef, useTransition } from "react";
import { useThemeContext } from "./ThemeProvider";
import type { ThemeMode } from "@/lib/hooks/useTheme";

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface ThemeToggleProps {
  /** Persist to the account when signed in (PATCH /api/profile themePref). */
  authed?: boolean;
  /** Compact pill variant for the avatar menu (single toggle row). */
  compact?: boolean;
  /** Icon-only quick toggle for the site header (available to all users). */
  iconOnly?: boolean;
  /** Server-derived account theme (user_profiles.theme_pref) to adopt on mount. */
  accountPref?: ThemeMode;
}

export default function ThemeToggle({
  authed = false,
  compact = false,
  iconOnly = false,
  accountPref,
}: ThemeToggleProps) {
  const { mode, setMode, resolvedDark } = useThemeContext();
  const [isPending, startTransition] = useTransition();
  // Roving-tabindex radio group (segmented variant). Declared unconditionally
  // so the hook order is stable across the compact/iconOnly early returns.
  const groupRef = useRef<HTMLDivElement>(null);

  // Adopt the account's persisted theme once, so a signed-in user's saved
  // preference wins over guest localStorage on first render.
  useEffect(() => {
    if (accountPref) setMode(accountPref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountPref]);

  function handleChange(next: ThemeMode) {
    setMode(next);
    if (authed) {
      startTransition(async () => {
        try {
          await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ themePref: next }),
          });
        } catch {
          // best-effort — the client-side theme already applied
        }
      });
    }
  }

  if (compact) {
    const cycle = (): ThemeMode =>
      mode === "system" ? "dark" : mode === "dark" ? "light" : "system";
    const label = mode === "dark" ? "Light" : mode === "light" ? "Dark" : "Dark";
    return (
      <button
        type="button"
        onClick={() => handleChange(cycle())}
        className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium text-[var(--ink-body)] hover:bg-[var(--surface-card-soft)] hover:text-[var(--ink-primary)] transition-colors duration-150 cursor-pointer bg-none border-none no-underline"
        aria-pressed={mode === "dark"}
        disabled={isPending}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-4 w-4 text-[var(--ink-faint)]"
          aria-hidden="true"
        >
          {mode === "dark" ? (
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          )}
        </svg>
        {mode === "system" ? "Theme: system" : `Theme: ${label}`}
      </button>
    );
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => handleChange(resolvedDark ? "light" : "dark")}
        aria-label={resolvedDark ? "Switch to light mode" : "Switch to dark mode"}
        title={resolvedDark ? "Switch to light mode" : "Switch to dark mode"}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-card-soft)] hover:text-[var(--ink-primary)] transition-colors duration-150 cursor-pointer bg-none border-none"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-[18px] w-[18px]"
          aria-hidden="true"
        >
          {resolvedDark ? (
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          )}
        </svg>
      </button>
    );
  }

  // ARIA APG radio-group pattern: Left/Right (and Up/Down) move + select,
  // Home/End jump, roving tabindex keeps a single tab stop.
  function handleGroupKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const radios = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
    );
    if (radios.length === 0) return;
    const current = radios.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (current + 1) % radios.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (current - 1 + radios.length) % radios.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = radios.length - 1;
    if (next === current) return;
    e.preventDefault();
    radios[next].focus();
    handleChange(OPTIONS[next].value);
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={handleGroupKeyDown}
      className="grid grid-cols-3 gap-1 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-sunken)] p-1"
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => handleChange(opt.value)}
            disabled={isPending}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-[7px] px-3 py-2 text-[13px] font-semibold transition-all duration-150 cursor-pointer border-none ${
              active
                ? "bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-sm"
                : "bg-transparent text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
