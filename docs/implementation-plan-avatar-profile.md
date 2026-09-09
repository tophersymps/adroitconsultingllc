# Implementation Plan — Avatar Menu + Profile/Settings Pages

> **Task:** t_6bc89ba0 (Arch) · **Tenant:** adroit-blog · **Repo:** `adroit-blog` (`~/Documents/Fortress-of-Solitude/adroit-blog`)
> **Author:** brainiac (web architect) · **Date:** 2026-08-11
> **Governing specs:** `design/discovery/direction-brief-avatar-profile-settings.md` (kara, discovery), `design/mockup-avatar-menu.html`, `design/mockup-profile.html`, `design/mockup-settings.html` (kara, execution t_5c3740a7), `design/design-system.html` §19–23 (tokens + handoff), `design/discovery/design-tokens-avatar-profile-settings.css`.
> **Pipeline:** this doc is the contract for the pre-created steel child **t_f75bc52d** (Implement). Kara's mockups are DONE (t_5c3740a7). After steel: zod QA (t_28393ea2 child).

---

## 1. Goals

Replace the signed-in header corner (raw email + "Sign out" text button) with an initials avatar + keyboard-first dropdown, and add two minimal account pages:

| Surface | Route | Purpose |
|---|---|---|
| Avatar dropdown | header (all pages) | Profile / Settings / Sign out from a 32px initials avatar |
| Profile | `/profile` | Single identity card: avatar + email + sign-in method |
| Settings | `/settings` | Two restrained sectioned cards; every control honestly stubbed |

**Out of scope (do NOT build):** password reset (needs new `/api/auth/reset`), clear-history (needs new `/api/progress/clear`), email-preference toggle (needs new subscribe table), avatar image upload, member-since (needs `created_at` surfaced through `/api/auth/session`). All of these render as visibly-stubbed controls only.

---

## 2. Current-state audit (what exists, what changes)

**Stays as-is (reused):**
- `src/lib/hooks/useAuth.ts` — `useAuth(): { user: AuthUser | null, isLoading, refresh }`, `AuthUser { id, email }`, `notifyAuthChanged()`. **Interface frozen — do not modify** (design §9).
- `GET /api/auth/session` — server resolves the HttpOnly cookie → `{ user: { id, email } | null }`. No changes.
- `POST /api/auth/logout` — sign-out flow: `fetch(...)` + `notifyAuthChanged()` + `router.refresh()` (already in `Header.tsx` `handleSignOut`).
- `getSupabaseServerClient()` — cookie-aware SSR client for server components (used by exam page gating).
- Header nav links, logo, Contact Us button, hamburger/drawer structure. **Only the `authControl` block changes** (design §9).
- Tailwind v4 `@theme inline` token block in `globals.css`, `prefers-reduced-motion` block, `shadow-card` family, navy/red palette, mono kicker language.

**Changes / new:**
1. **New tokens** in `globals.css` `@theme inline`: `--shadow-menu`, `--shadow-dialog`, `--avatar-1..4` (§3).
2. **New lib** `src/lib/avatar.ts` — `initialsFromEmail`, `avatarHueClass` (§4).
3. **New component** `src/components/AvatarMenu.tsx` — dropdown (client, self-contained) (§5).
4. **Header change** — desktop `authControl` → AvatarMenu; mobile drawer → "Signed in as" block + Profile/Settings/Sign out rows (§6).
5. **New route** `src/app/profile/page.tsx` — server component, session gate + redirect (§7).
6. **New route** `src/app/settings/page.tsx` — server component, session gate + redirect, honest stubs (§8).
7. **Shared confirm dialog** — `src/components/ConfirmDialog.tsx` for the Settings destructive row (§9). It is a stub → dialog only shown on a disabled trigger, never a fake-functional flow.

**No schema changes.** No new tables, no auth API changes, no changes to `useAuth.ts`.

---

## 3. Design tokens (globals.css `@theme inline`)

Paste from `design/discovery/design-tokens-avatar-profile-settings.css`:

```css
/* Account surfaces — elevation for menu + dialog (navy-tinted, matches shadow-card family) */
--shadow-menu:   0 4px 6px -1px rgba(11, 29, 58, 0.06),
                0 16px 32px -12px rgba(11, 29, 58, 0.20);
--shadow-dialog: 0 24px 48px -12px rgba(11, 29, 58, 0.28),
                0 4px 12px -4px rgba(11, 29, 58, 0.12);

/* Avatar palette — deterministic initials colors (brand-safe; white text passes AA on all) */
--avatar-1: #0B1D3A;   /* navy */
--avatar-2: #132D54;   /* navy-light */
--avatar-3: #C8102E;   /* red */
--avatar-4: #A00D24;   /* red-dark */
```

Tailwind v4 `@theme inline` → utilities `shadow-menu`, `shadow-dialog`, `bg-avatar-1..4` are generated automatically. **Do not add `@apply`-based component classes to globals.css** — keep the repo's current pattern (Tailwind utilities inline in TSX; globals.css only holds tokens, base, keyframes).

---

## 4. `src/lib/avatar.ts` — shared avatar derivation

Pure functions, no React, no hooks. **Deterministic — never `Math.random()`** (design §3.3 — avoids flicker on re-render).

```ts
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

/** Deterministic hash → one of four brand-safe hues (design §3.3). */
export function avatarHueClass(email: string): AvatarHueClass {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_HUE_CLASSES[h % AVATAR_HUE_CLASSES.length];
}
```

Add `src/lib/avatar.test.ts` with the brief's edge cases: `"jane.doe@adroit.io"→"JD"`, `"jane@adroit.io"→"JA"`, `"j@adroit.io"→"J"`, `""→"A"`, `"9to5@x.io"→"9T"`, determinism (same input → same class twice), coverage of all 4 hues.

---

## 5. `src/components/AvatarMenu.tsx` — dropdown component

Client component (`"use client"`). **Self-contained**: owns open/close state and all keyboard/outside-click behavior. Receives auth state + sign-out as props (Header owns the auth source — see §6).

### 5.1 Props (TypeScript contract)

```ts
"use client";
import { useAuth, type AuthUser } from "@/lib/hooks/useAuth";

interface AvatarMenuProps {
  user: AuthUser;              // non-null — AvatarMenu only renders when signed in
  onSignOut: () => void;       // Header's handleSignOut (fetch logout + notify + refresh)
  isSigningOut?: boolean;      // pending state for the Sign out row
}
```

### 5.2 Render tree

```
<header right cluster>            ← lives in Header.tsx, not this component
  <div className="avatar-menu relative">          ← component root
    <button aria-haspopup="menu" aria-expanded={open}
            aria-label={`Account menu for ${user.email}`}
            className="avatar-trigger ...">       ← hit area ≥ 40px
      <span className={`avatar w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[12.5px] ${avatarHueClass(user.email)}`}>
        {initialsFromEmail(user.email)}
      </span>
      <Chevron className={open ? "rotate-180" : ""} />
    </button>
    {open && (
      <div role="menu" aria-label="Account" aria-orientation="vertical"
           className="absolute right-0 top-[calc(100%+8px)] w-[240px] bg-white border border-gray-200 rounded-xl shadow-menu p-1.5 z-50">
        {/* identity header */}
        <div className="flex items-center gap-2.5 px-2.5 py-2.5 pb-3">
          <span className={`avatar w-9 h-9 rounded-[10px] ... ${avatarHueClass(user.email)}`}>{initialsFromEmail(user.email)}</span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-gray-800 truncate">{user.email}</div>
            <div className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Signed in as</div>
          </div>
        </div>
        <hr className="border-t border-gray-100 mx-1.5" />
        <MenuItem href="/profile" icon={UserIcon} label="Profile" onNavigate={close} />
        <MenuItem href="/settings" icon={SettingsIcon} label="Settings" onNavigate={close} />
        <hr className="border-t border-gray-100 mx-1.5" />
        <MenuItem danger icon={LogoutIcon} label={isSigningOut ? "…" : "Sign out"} onActivate={onSignOut} />
      </div>
    )}
  </div>
```

**Semantics:** trigger is a `<button>` with `aria-haspopup="menu"` + `aria-expanded`; panel is `role="menu"` with `aria-orientation="vertical"`; items are `role="menuitem"` (navigate = `<a>` via `next/link`, sign out = `<button>`). Icons are inline SVGs with `aria-hidden="true"`. The mobile drawer is a separate pattern (see §6.2) — this component is **desktop only** (rendered inside the `hidden md:flex` nav).

### 5.3 Behavior — opening / closing (non-negotiable)

| Event | Behavior |
|---|---|
| Click trigger | Toggle open. On open, focus moves to first menu item (Profile). |
| Click outside | Close (document `mousedown`/`touchstart` listener, `ref.contains` check) |
| `Escape` | Close; **return focus to the trigger** |
| `Tab` | Close (focus leaves the menu naturally) |
| Route change | Close — `usePathname()` effect: any pathname change closes the menu (covers Profile/Settings navigation + `router.refresh()` after sign-out) |
| Menu item click | Activate (navigate or sign out) + close |

### 5.4 Keyboard navigation (WCAG 2.1.1, 2.1.2, 2.4.7 — APG menu button pattern)

Follow the WAI-ARIA **Menu Button** pattern (APG):

- **Enter / Space / ArrowDown on trigger** → open menu; focus moves to **first item** (Profile).
- **ArrowDown / ArrowUp** → move focus to next / previous item (wrap-around).
- **Home / End** → first / last item.
- **Enter / Space on an item** → activate it (native behavior for `<a>`/`<button>`).
- **Escape** → close, focus returns to trigger.
- **Tab** → close menu, focus leaves (natural tab order).
- Roving focus: maintain a ref array of items; on open focus the first item; Arrow/Home/End move focus programmatically (`.focus()`). `aria-activedescendant` is **not** needed with roving tabindex.

### 5.5 A11y checklist (QA will verify — design §11 AC 2, 3)

- Trigger has `aria-haspopup="menu"` + `aria-expanded` toggling with open state.
- Panel `role="menu"`, items `role="menuitem"`.
- Focus moves to first item on open; Escape returns focus to trigger.
- `:focus-visible` red ring (global already covers) — no custom focus styling needed.
- Avatar text is white on `bg-avatar-N` — all four hues pass WCAG AA contrast with white (design verified).
- `prefers-reduced-motion` — CSS transitions only (150ms ease-out fade + 4px rise), existing global block neutralizes them.
- Hit area of trigger ≥ 40px (a11y): `p-2` around the 32px avatar, or `min-w-[40px] min-h-[40px]`.

---

## 6. `src/components/Header.tsx` — integration

**Only the `authControl` block changes.** Nav links, logo, Contact Us, hamburger/drawer structure untouched.

### 6.1 Desktop (`hidden md:flex` nav, right cluster)

Replace the current email + "Sign out" button:

```tsx
const { user, isLoading } = useAuth();
// ... handleSignOut unchanged ...

const authControl = isLoading ? null : user ? (
  <AvatarMenu user={user} onSignOut={handleSignOut} isSigningOut={isSigningOut} />
) : (
  <Link href={`/login?next=${...}`} ...>Sign in</Link>
);
```

Order inside the right cluster (mockup): `divider | Contact Us | AvatarMenu`. Currently Contact Us comes after `authControl` — **swap so Contact Us sits before the avatar** (design §4.3). Keep the `border-l border-gray-100` divider.

The email no longer renders inline in the header (moves inside the dropdown panel). Remove the `hidden lg:inline max-w-[140px] truncate ...` span and the inline Sign out button.

### 6.2 Mobile drawer (`md:hidden`)

Replace the current "Sign out (email)" row with the mockup's signed-in block + rows (design §4.1 mobile, mockup §mobile-nav):

```
{!isLoading && user && (
  <>
    <div className="flex items-center gap-3 py-3 border-b border-gray-100">
      <span className={`avatar w-10 h-10 rounded-[10px] ... ${avatarHueClass(user.email)}`}>
        {initialsFromEmail(user.email)}
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-navy truncate">{user.email}</div>
        <div className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Signed in as</div>
      </div>
    </div>
    <Link href="/profile" onClick={() => setMobileOpen(false)}>Profile</Link>
    <Link href="/settings" onClick={() => setMobileOpen(false)}>Settings</Link>
    <button onClick={() => { handleSignOut(); setMobileOpen(false); }}>Sign out</button>
  </>
)}
```

Desktop AvatarMenu stays inside the `hidden md:flex` nav; the mobile drawer rows are plain links/buttons (no dropdown on mobile — matches existing responsive nav, design §9).

---

## 7. `/profile` — server component with session gate

**Decision: server component, not client.** Rationale: the session is server-owned (HttpOnly cookie, `getSupabaseServerClient`), the exam page already gates server-side this way (ADR-104 pattern), and a server redirect avoids a client-side auth flash + duplicate `/api/auth/session` fetch. No new API needed — read the session directly.

`src/app/profile/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { initialsFromEmail, avatarHueClass } from "@/lib/avatar";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main" className="flex-1">
        <div className="max-w-[560px] mx-auto px-6 py-14">
          <div className="kicker ...">ADROIT ACADEMY — ACCOUNT</div>
          <h1 className="text-3xl font-extrabold text-navy tracking-[-0.02em] mb-2">Your profile</h1>
          <p className="text-[14px] text-gray-500 mb-7">Your account identity for Adroit Academy — ...</p>

          <div className="bg-white rounded-[20px] border border-gray-200 shadow-card p-8">
            <div className="flex items-center gap-[18px]">
              <span className={`avatar w-16 h-16 rounded-2xl ... ${avatarHueClass(user.email)}`}>
                {initialsFromEmail(user.email)}
              </span>
              <div>
                <div className="font-mono text-[13px] font-medium text-gray-800 break-all">{user.email}</div>
                <div className="font-mono text-[10px] font-bold text-gray-400 uppercase tracking-[0.07em] mt-1.5">
                  Sign-in method — Email &amp; password
                </div>
              </div>
            </div>
            <hr className="border-t border-gray-100 my-5" />
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-gray-800">Password</span>
              <span className="text-[13px] font-semibold text-gray-400">Change password <StubBadge>Coming soon</StubBadge></span>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
```

**Stub:** "Change password" renders as disabled/static text + `COMING SOON` badge — **no link, no dialog** (no `/api/auth/reset` exists). QA must not fail it (design §5.3).

**No loading skeleton** — the page is server-rendered with data present; no client fetch → no shimmer needed (the mockup's skeleton was for a client-fetch variant; server gate eliminates it).

Metadata: `export const metadata` → `buildMetadata({ title: "Your profile — Adroit Blog", path: "/profile" })` matching other pages.

---

## 8. `/settings` — server component with session gate, honest stubs

Same shell + gate as Profile. Two sectioned cards (design §6.3) — **restraint is the point**.

`src/app/settings/page.tsx`:

```tsx
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main" className="flex-1">
        <div className="max-w-[560px] mx-auto px-6 py-14">
          <div className="kicker ...">ADROIT ACADEMY — SETTINGS</div>
          <h1 className="text-3xl font-extrabold text-navy tracking-[-0.02em] mb-2">Settings</h1>
          <p className="text-[14px] text-gray-500 mb-7">Account and reading preferences for Adroit Academy.</p>

          {/* Section 1 — Reading progress (real data exists, but clear needs a new API) */}
          <section className="bg-white rounded-[20px] border border-gray-200 shadow-card p-6 mb-6" aria-labelledby="sec-reading">
            <h2 id="sec-reading" className="kicker ... mb-1">Reading progress</h2>
            <div className="destructive-row ...">
              <div>
                <div className="text-[14px] font-semibold text-gray-800">Clear reading history</div>
                <div className="text-xs text-gray-400">Wipes read/unread and quiz stats from your account.</div>
              </div>
              <StubBadge>Coming soon</StubBadge>
            </div>
          </section>

          {/* Section 2 — Email updates (needs a subscribe table; no backend today) */}
          <section className="bg-white rounded-[20px] border border-gray-200 shadow-card p-6" aria-labelledby="sec-email">
            <h2 id="sec-email" className="kicker ... mb-1">Email updates</h2>
            <div className="flex items-center justify-between py-3">
              <div>
                <div className="text-[14px] font-semibold text-gray-800">Email me new posts</div>
                <div className="text-xs text-gray-400">When the Adroit blog publishes.</div>
              </div>
              <span className="flex items-center gap-2"><StubBadge>Coming soon</StubBadge><span className="switch off ..." aria-hidden /></span>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
```

**Honest-stub rule (design §6.3, AC 5):** every control that has no backend renders disabled/static with a visible mono `COMING SOON` badge. **No control may look functional.** No save bar, no toggle input, no fake dialog trigger — the mockup's dialog/save-bar are design-state artifacts for when APIs exist; the MVP renders the static stub state only. `StubBadge` is a tiny presentational helper (amber mono pill: `font-mono text-[9px] font-bold uppercase tracking-wide text-amber bg-amber-light rounded-full px-2 py-0.5`).

**ConfirmDialog** (`src/components/ConfirmDialog.tsx`) is **not required for this MVP** — there is no destructive action with a backend. Documented in §9 below as the pattern to use when `/api/progress/clear` exists; do NOT build it now (YAGNI — nothing would trigger it).

---

## 9. Future extension point: ConfirmDialog pattern (do NOT build in MVP)

When a destructive action gets a real API, use this pattern (mockup §6.4): centered `max-w-[380px]` white `rounded-xl` card on `bg-navy-dark/40` backdrop, `shadow-dialog`, title 16px bold navy, body 13px gray-600, buttons right-aligned (ghost Cancel + solid red action), `role="dialog"` + `aria-modal="true"`, focus moves into dialog on open, Esc/cancel closes, focus returns to trigger on close, `prefers-reduced-motion` respected. Not in scope now.

---

## 10. Route table (final)

| Route | File | Type | Auth | Guest behavior |
|---|---|---|---|---|
| `/profile` | `src/app/profile/page.tsx` | Server component, `force-dynamic` | `getSupabaseServerClient().auth.getUser()` | `redirect("/login?next=/profile")` |
| `/settings` | `src/app/settings/page.tsx` | Server component, `force-dynamic` | same | `redirect("/login?next=/settings")` |
| (header) | `src/components/AvatarMenu.tsx` | Client component | `useAuth()` via Header | N/A — renders only when `user` non-null |

No new API routes. No new DB tables. No `useAuth.ts` interface change.

---

## 11. TypeScript contracts summary (all in this plan, steel implements)

| Symbol | Where | Shape |
|---|---|---|
| `initialsFromEmail(email: string): string` | `src/lib/avatar.ts` | pure |
| `avatarHueClass(email: string): AvatarHueClass` | `src/lib/avatar.ts` | pure, deterministic |
| `AvatarHueClass` | `src/lib/avatar.ts` | `"bg-avatar-1" \| "bg-avatar-2" \| "bg-avatar-3" \| "bg-avatar-4"` |
| `AvatarMenuProps` | `src/components/AvatarMenu.tsx` | `{ user: AuthUser; onSignOut: () => void; isSigningOut?: boolean }` |
| `AuthUser` | `src/lib/hooks/useAuth.ts` (existing, unchanged) | `{ id: string; email: string }` |

No `src/shared/contracts.ts` changes (that file is quiz-tiers-scoped; this feature's contracts live with the components).

---

## 12. Implementation steps for steel (t_f75bc52d)

1. Add tokens to `globals.css` `@theme inline` (§3).
2. Create `src/lib/avatar.ts` + `src/lib/avatar.test.ts` (§4) — run `npx vitest run src/lib/avatar.test.ts`.
3. Create `src/components/AvatarMenu.tsx` (§5) — full keyboard + outside-click + route-change behavior.
4. Modify `src/components/Header.tsx` desktop `authControl` + mobile drawer (§6).
5. Create `src/app/profile/page.tsx` (§7) — server gate + identity card + stub.
6. Create `src/app/settings/page.tsx` (§8) — server gate + two stub sections.
7. `npm run lint` (0 warnings) + `npm run build` (0 errors) + `npm test` (all pass).
8. Manual smoke via `~/.hermes/scripts/ensure-next-dev.sh` — signed-in header shows avatar, dropdown opens/closes, `/profile` + `/settings` render for authed and redirect for guest.

**Done means:** header shows initials avatar (not raw email); dropdown has full keyboard nav + aria-expanded + outside-click/Esc/route-change close; `/profile` and `/settings` gate guests to `/login?next=...`; every stub is visibly marked; `npm run build` 0 errors, `npm run lint` 0 warnings.

---

## 13. Acceptance criteria (for zod QA t_28393ea2)

1. Header shows initials avatar (not raw email) when signed in; square `rounded-lg`, white initials on brand hue, deterministic per email (same user = same hue across reloads).
2. Clicking avatar opens right-aligned 240px dropdown with Profile / Settings / Sign out; click-outside and Escape close; Arrow/Home/End navigate; focus returns to trigger on Escape.
3. Sign out still works (existing `/api/auth/logout` + notifyAuthChanged + refresh), no confirm dialog.
4. `/profile` shows avatar + email + sign-in method; layout matches kicker/h1/card language; signed-out → `/login?next=/profile`; "Change password" is a stub with visible COMING SOON badge.
5. `/settings` uses sectioned cards; destructive/toggle rows carry visible COMING SOON badges and are non-functional (no fake controls, no save bar).
6. Mobile drawer shows "Signed in as" block (avatar + email) + Profile/Settings/Sign out rows; hamburger behavior unchanged.
7. New tokens (`shadow-menu`, `shadow-dialog`, `--avatar-*`) present in `globals.css` `@theme inline`; `prefers-reduced-motion` respected.
8. No changes to `useAuth.ts` interface, nav links, `content/`, sort logic; `npm run build` passes, `npm run lint` 0 warnings.
