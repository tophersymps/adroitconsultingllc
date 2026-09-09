/**
 * ProfileForm — editable display name + username on /profile (client).
 *
 * Loads via GET /api/profile, saves via PATCH /api/profile, and broadcasts a
 * profile-changed event so the Header/AvatarMenu refresh the display name.
 * Honest save state: button shows Saving… while pending; success → saved
 * confirmation; error → inline message.
 */

"use client";

import { useEffect, useState, useTransition } from "react";
import type { ProfileGetResponse } from "@/shared/contracts-account";

export const PROFILE_CHANGED_EVENT = "adroit-blog:profile-changed";

export function notifyProfileChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT));
  } catch {
    // non-fatal
  }
}

export default function ProfileForm() {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ProfileGetResponse;
        if (!data.user) return;
        if (!cancelled) {
          setDisplayName(data.profile.displayName ?? "");
          setUsername(data.profile.username ?? "");
          setLoaded(true);
        }
      } catch {
        // leave fields empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: displayName.trim() || null,
            username: username.trim().toLowerCase() || null,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? "Could not save. Please try again.");
          return;
        }
        setSaved(true);
        notifyProfileChanged();
      } catch {
        setError("Network error — could not save.");
      }
    });
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label htmlFor="displayName" className="block text-[12px] font-semibold text-[var(--ink-muted)] mb-1.5">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSaved(false);
            }}
            placeholder="How you appear on the site"
            disabled={!loaded || isPending}
            className="w-full px-3.5 py-2.5 min-h-[44px] rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-[14px] text-[var(--ink-body)] focus:outline-none focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[var(--accent)]/[0.25] disabled:opacity-50 placeholder:text-[var(--ink-faint)]"
          />
          <div className="text-[11.5px] text-[var(--ink-faint)] mt-1">
            Shown in the avatar menu and on your profile.
          </div>
        </div>
        <div>
          <label htmlFor="username" className="block text-[12px] font-semibold text-[var(--ink-muted)] mb-1.5">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setSaved(false);
            }}
            placeholder="janedoe"
            disabled={!loaded || isPending}
            className="w-full px-3.5 py-2.5 min-h-[44px] rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] text-[14px] text-[var(--ink-body)] focus:outline-none focus:border-[var(--accent)] focus:ring-[3px] focus:ring-[var(--accent)]/[0.25] disabled:opacity-50 placeholder:text-[var(--ink-faint)]"
          />
          <div className="text-[11.5px] text-[var(--ink-faint)] mt-1">
            <span className="font-mono text-[10.5px]">@{username || "username"}</span>
            {" · "}lower-case letters, numbers, underscores. Social features arrive later.
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-[var(--accent)]">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mt-3 text-[12.5px] font-semibold text-[var(--signal-done)]">
          Saved. Your display name is now live in the avatar menu.
        </p>
      )}

      <div className="flex justify-end gap-2.5 pt-4 mt-4 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => {
            setDisplayName("");
            setUsername("");
            setError(null);
          }}
          disabled={isPending}
          className="px-5 py-2.5 min-h-[44px] rounded-md border border-[var(--border-default)] text-[12.5px] font-semibold text-[var(--ink-muted)] bg-transparent hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)] transition-colors duration-150 cursor-pointer disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!loaded || isPending}
          className="px-5 py-2.5 min-h-[44px] rounded-md bg-[var(--surface-inverse)] text-[var(--ink-on-inverse)] text-[12.5px] font-semibold hover:bg-[var(--surface-inverse-hover)] hover:-translate-y-px active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
