/**
 * Avatar derivation — deterministic initials + hue for the account corner.
 *
 * Pure functions, no React, no hooks. Deterministic (never Math.random())
 * so the avatar never flickers between renders or reloads for the same user.
 */

export const AVATAR_HUE_CLASSES = ["bg-avatar-1", "bg-avatar-2", "bg-avatar-3", "bg-avatar-4"] as const;
export type AvatarHueClass = (typeof AVATAR_HUE_CLASSES)[number];

/** "jane.doe@adroit.io" → "JD" · "jane@adroit.io" → "JA" · "j@adroit.io" → "J" · "" → "A" */
export function initialsFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").trim();
  const parts = local.split(/[._\-+\s]+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Deterministic hash → one of four brand-safe hues. */
export function avatarHueClass(email: string): AvatarHueClass {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_HUE_CLASSES[h % AVATAR_HUE_CLASSES.length];
}
