/**
 * AvatarMenu — initials avatar + keyboard-first account dropdown (desktop).
 *
 * Self-contained client component: owns open/close state and all
 * keyboard/outside-click behavior. Auth state + sign-out flow come from
 * Header (props) — this component renders only when signed in.
 *
 * A11y: WAI-ARIA Menu Button pattern — trigger is a <button> with
 * aria-haspopup="menu" + aria-expanded; panel is role="menu" with
 * roving focus over role="menuitem" items; Escape closes and returns
 * focus to the trigger; outside click, Tab, and route change close.
 *
 * Route-change close: menu items close on click (onClick); browser
 * back/forward closes via a popstate subscription (menu items are the
 * only in-app navigation source, so no pathname effect is needed).
 */
"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { AuthUser } from "@/lib/hooks/useAuth";
import { avatarHueClass, initialsFromEmail } from "@/lib/avatar";
import ThemeToggle from "@/components/Theme/ThemeToggle";
import { PROFILE_CHANGED_EVENT } from "@/components/Profile/ProfileForm";

interface AvatarMenuProps {
  user: AuthUser; // non-null — AvatarMenu only renders when signed in
  onSignOut: () => void; // Header's handleSignOut (fetch logout + notify + refresh)
  isSigningOut?: boolean; // pending state for the Sign out row
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Shield — the privilege mark for the admin-only entry (v4). */
function IconShield({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

const itemBase =
  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors duration-150 cursor-pointer bg-none border-none no-underline";
const itemNormal = "text-[var(--ink-body)] hover:bg-[var(--surface-card-soft)] hover:text-[var(--ink-primary)]";
const itemDanger = "text-[var(--accent)] hover:bg-[var(--accent)]/[0.06] hover:text-[var(--accent-hover)]";

export default function AvatarMenu({ user, onSignOut, isSigningOut = false }: AvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load the display name once + refresh whenever a profile save broadcasts.
  const loadDisplayName = useCallback(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          user: { id: string; email: string } | null;
          profile?: { displayName: string | null };
        };
        if (data.user) setDisplayName(data.profile?.displayName ?? null);
      } catch {
        // fall back to email
      }
    })();
  }, []);

  useEffect(() => {
    loadDisplayName();
    window.addEventListener(PROFILE_CHANGED_EVENT, loadDisplayName);
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, loadDisplayName);
  }, [loadDisplayName]);

  function getItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  const focusItem = useCallback((index: number) => {
    getItems()[index]?.focus();
  }, []);

  // Open → focus moves to the first menu item (Profile).
  useEffect(() => {
    if (open) focusItem(0);
  }, [open, focusItem]);

  // Outside click / touch closes; browser back/forward closes (popstate
  // subscription — menu items already close on their own clicks).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    };
    const onPopState = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("popstate", onPopState);
    };
  }, [open]);

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => focusItem(getItems().length - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function handleMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = getItems();
    const current = items.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusItem((current + 1) % items.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem((current - 1 + items.length) % items.length);
        break;
      case "Home":
        e.preventDefault();
        focusItem(0);
        break;
      case "End":
        e.preventDefault();
        focusItem(items.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  const hue = avatarHueClass(user.email);
  const initials = displayName
    ? (displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || initialsFromEmail(user.email))
    : initialsFromEmail(user.email);
  const label = displayName || user.email;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${label}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        className="flex items-center gap-1.5 rounded-lg p-2 bg-none border-none cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-card-soft)]"
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-[12.5px] font-bold text-white ${hue}`}
        >
          {initials}
        </span>
        <IconChevron className={`h-3.5 w-3.5 text-[var(--ink-faint)] transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="menu-pop absolute right-0 top-[calc(100%+8px)] z-50 w-[240px] rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-1.5 shadow-menu">
          {/* identity header — OUTSIDE the menu (APG: role=menu contains
              menuitems/separators only, not plain content blocks) */}
          <div className="flex items-center gap-2.5 px-2.5 py-2.5 pb-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-[10px] text-[13px] font-bold text-white ${hue}`}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[var(--ink-body)]">{label}</div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                Signed in as
              </div>
            </div>
            {user.isAdmin && (
              <span className="ml-auto font-mono text-[8.5px] font-bold uppercase tracking-[0.06em] text-[var(--admin-menu-icon,var(--accent))] bg-[var(--admin-menu-tint,rgba(200,16,46,0.10))] px-2 py-0.5 rounded-full">
                admin
              </span>
            )}
          </div>
          <hr className="mx-1.5 border-t border-[var(--border-subtle)]" />

          <div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            aria-orientation="vertical"
            onKeyDown={handleMenuKeyDown}
          >
            <Link
              href="/profile"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={`${itemBase} ${itemNormal}`}
            >
              <IconUser className="h-4 w-4 text-[var(--ink-faint)]" />
              Profile
            </Link>
            <Link
              href="/settings"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={`${itemBase} ${itemNormal}`}
            >
              <IconSettings className="h-4 w-4 text-[var(--ink-faint)]" />
              Settings
            </Link>

            {/* Admin console — the single entry point to /admin (v4). Rendered
                ONLY for admins (server-derived isAdmin). Shield glyph + faint red
                tint marks it as a privileged entry. No top-nav link. */}
            {user.isAdmin && (
              <Link
                href="/admin"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className="admin-menu-item"
              >
                <IconShield className="shield h-4 w-4" />
                <span className="flex-1">Admin console</span>
                <span className="tag">Admin</span>
              </Link>
            )}

            <hr className="mx-1.5 border-t border-[var(--border-subtle)]" />

            {/* Theme quick-toggle row. The row itself is the roving-focus target;
                Enter/Space forward to the real button so the toggle stays keyboard
                operable (WCAG 2.1.1). */}
            <div
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  (e.currentTarget.querySelector("button") as HTMLButtonElement | null)?.click();
                }
              }}
              className="cursor-pointer"
            >
              <ThemeToggle authed compact />
            </div>

            <hr className="mx-1.5 border-t border-[var(--border-subtle)]" />

            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={isSigningOut}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className={`${itemBase} ${itemDanger} disabled:opacity-50`}
            >
              <IconLogout className="h-4 w-4 text-current" />
              {isSigningOut ? "…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
