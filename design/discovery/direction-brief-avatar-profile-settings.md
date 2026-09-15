# Adroit Blog — Design Discovery: Avatar Menu + Profile/Settings Pages

**Task:** t_d53651d3 · **Author:** kara (designer) · **Date:** 2026-08-11
**Repo:** `/Users/kelex/Documents/Fortress-of-Solitude/adroit-blog`
**Child (execution):** t_5c3740a7 (currently blocked, waiting on this brief)
**Type:** DISCOVERY — direction + tokens + mood boards. The EXECUTION task composes the mockups from this brief. No code.

---

## 0. What This Discovery Covers

The signed-in user experience currently ends at a raw email string and a "Sign out" text button in the header (`src/components/Header.tsx`). This discovery designs the *account corner* of the publication:

1. **Avatar menu** — initials-based avatar (from `user.email` — there is no avatar image system), dropdown with **Profile / Settings / Sign out**
2. **Profile page** (`/profile`) — minimal account-info page
3. **Settings page** (`/settings`) — minimal preferences/controls page
4. **Mobile behavior** — must match the existing responsive nav (hamburger drawer), not invent a new pattern

**Data surface (verified 2026-08-11):** `useAuth` returns `AuthUser { id, email }` only. There is NO name, NO avatar URL, NO created_at, NO settings backend. Every design below is grounded in `user.email`; anything else is explicitly flagged **STUB** (needs a new API/field before it can function).

**Builds ON the shipped design pass (t_e3c87690 + t_7e4e4898 chains):** navy `#0B1D3A` / red `#C8102E`, off-white `#F7F8FA`, Inter + mono stack, rounded-xl cards, `shadow-card` / `shadow-card-hover`, red `focus-visible` ring, mono kicker language (red dot + uppercase tracking), `prefers-reduced-motion` block. Nothing from that pass is redone.

---

## 1. Surface Archetypes (committed before tokens)

| Component | Surface | Why |
|---|---|---|
| Avatar dropdown | **Operate** (primary) + Command/Inspect semantics | The user picks an action (Profile/Settings/Sign out) — menu items are affordances, not content. Keyboard-first menu behavior (arrows, Esc, focus return) is mandatory, not optional. |
| Profile page `/profile` | **Command/Inspect** | Drilling into ONE object — the account identity. Focused, minimal, no marketing framing; avatar + email carry the page. |
| Settings page `/settings` | **Configure** | Preferences and forms. Progressive disclosure, clean save/validation states, low decoration. |

**Anti-slop consequence:** the dropdown is NOT a card grid, NOT a hero — it is a precise action menu. Profile is NOT a centered hero + 3 feature cards — it is a single focused identity card. Settings is NOT a dashboard of fake toggles — it is a restrained Configure surface where every control is either real or honestly marked as a stub.

**Reference vocabulary (from popular-web-designs):**
- **Linear** — menu precision: tight rows, tiny icons in muted gray, 12-13px labels, keyboard-first menus, one accent (their indigo = our red) reserved for interactive/active states only.
- **Sanity** — red-accent editorial restraint: mono uppercase metadata labels, hairline dividers, quiet destructive styling. Our red `#C8102E` plays the same signal role their `#f36458` does.
- **Notion/GitHub avatar menus** — the conventional account-menu anatomy (identity header → menu items → divider → sign out) is kept because users expect it; we re-skin it in the Adroit language.

---

## 2. The One-Line Direction

> **"The account as a quiet corner of the publication."** The avatar menu and account pages speak the blog's existing editorial language — mono kickers, navy/red, elevated white cards — with zero marketing decoration. The dropdown feels like a crafted Linear-style action menu (precise, keyboard-first, no surprises); Profile reads as one focused identity card; Settings is a restrained Configure surface where stubs are labeled honestly.

---

## 3. Avatar (initials from email)

### 3.1 Visual
- **Size:** `w-8 h-8` (32px) in the header, `w-16 h-16` (64px) on the Profile page. Hit area on the header trigger is padded to **≥40px** (a11y).
- **Shape:** square with `rounded-lg` — matches the logo "A" block (`rounded-sm`) and the author-avatar pattern (`rounded-xl`, not full circle). The avatar is the *user's* mark next to the *brand's* mark.
- **Fill:** one of four brand-safe hues (see 3.3), white bold initials.
- **Ring:** default `border-2 border-transparent`; **hover and open state → red ring** (`border-red`), mirroring the existing author-row "red ring on hover" signature. A chevron (up when open) may sit beside the avatar at desktop; optional, keep tiny.

### 3.2 Initials algorithm (for steel)
```ts
function initialsFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").trim();
  const parts = local.split(/[._\-+\s]+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
// "jane.doe@adroit.io" → "JD" · "jane@adroit.io" → "JA" · "j@adroit.io" → "J"  (last fallback: slice(0,1))
```
Edge cases: empty local → "A"; numeric leading char → keep as-is (e.g. "9to5@x.io" → "9T"); single char → that char uppercase.

### 3.3 Deterministic hue (for steel)
```ts
const AVATAR_HUES = ["--avatar-1", "--avatar-2", "--avatar-3", "--avatar-4"]; // tokens in §7
function avatarHue(email: string): string {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}
```
Same user always gets the same color; no random assignment on re-render (avoid `Math.random` — causes flicker).

---

## 4. Avatar Dropdown (desktop)

### 4.1 Anatomy (top → bottom)
| Block | Spec |
|---|---|
| Trigger | Avatar button, `aria-haspopup="menu"`, `aria-expanded`, `aria-label="Account menu for {email}"`. Chevron optional. Red ring on hover/open. |
| Panel | Right-aligned to trigger (`right-0`), `mt-2`, `w-[240px]`, `bg-white`, `border border-gray-200`, `rounded-xl`, **new `shadow-menu` token** (§7), `p-1.5`. |
| Identity header | Avatar 36px + email (truncate, 13px semibold `gray-800`) + mono kicker `SIGNED IN AS` (10px, `gray-400`, tracking) below email. Hairline divider (`border-gray-100`) under. |
| Item: **Profile** | User icon (16px, `gray-400`) + label. |
| Item: **Settings** | Sliders icon (16px, `gray-400`) + label. |
| Divider | `border-t border-gray-100` (hairline), `my-1`. |
| Item: **Sign out** | Logout icon + label in **red** (`text-red`, hover `bg-red/[0.06] hover:text-red-dark`). No confirm dialog — matches current one-click sign-out. |

Item pattern: `px-3 py-2 rounded-md text-[13px] font-medium text-gray-700 hover:bg-gray-50 hover:text-navy transition-colors duration-150`, icon `text-gray-400` aligned left, label left-aligned, `cursor-pointer`. Active item: `bg-gray-50 text-navy`.

### 4.2 Interaction & keyboard (non-negotiable)
- **Open:** click trigger → panel fades/scales in (`opacity 0→1`, `translateY(-4px)→0`, **150ms ease-out**). Click outside / Esc closes. Focus returns to trigger.
- **Keyboard:** `role="menu"` + `menuitem`, `aria-orientation="vertical"`; ArrowUp/ArrowDown move focus between items, Home/End jump, Enter/Space activates, Tab closes. First item (Profile) is focused on open, or follow trigger-focus pattern — execution picks, must be consistent.
- **Reduced motion:** existing globals.css block covers it automatically (CSS-only transition). No JS animation without a `prefers-reduced-motion` guard.
- **Nested risk:** dropdown must not be clipped by header (`overflow-visible` on header container) and must sit above content (`z-50` header already).

### 4.3 Header placement (desktop)
Replace the current `authControl` (email + "Sign out" text button) with the AvatarMenu **as the last element** of the right action cluster, after Contact Us: `… nav links | divider | Contact Us | avatar`. Email text moves inside the dropdown (it no longer needs the `hidden lg:inline` truncate span). Logged-out state stays exactly as-is ("Sign in" link).

---

## 5. Profile Page (`/profile`) — Command/Inspect

### 5.1 Layout
- Narrow single column: `max-w-[560px] mx-auto px-6 py-14`, includes `<Header/>` + `<Footer/>` (same shell as `/login`).
- **Kicker:** red dot + `ADROIT ACADEMY — ACCOUNT` (mono, 11px, red, uppercase, tracking — the established kicker language).
- **Display:** h1 `Your profile`, `text-3xl font-extrabold text-navy tracking-[-0.02em]`; one muted line under it (`gray-500`).

### 5.2 Identity card (the whole point of the page)
White `rounded-[20px] border border-gray-200 shadow-card p-8`:
- Avatar 64px (initials from email, deterministic hue, red ring on hover)
- Email — mono 13px `gray-800` (this IS the account identity; no name field exists)
- Mono caption row: `SIGN-IN METHOD — EMAIL & PASSWORD` (real: Supabase email/password) — small, quiet
- **Optional row** `Member since` — **STUB**: needs `created_at` from Supabase `auth.users` exposed through `/api/auth/session`. Do NOT render it until that API exists; brief shows it only as a "when available" addition.

### 5.3 Security card (minimal)
Single row: `Password` label + `Change password` link → Supabase password-reset flow. **STUB** — requires a new `/api/auth/reset` route (or direct Supabase email link). Mockup may show the row with a muted "coming soon" treatment or a working-looking link that steel wires later — execution decides; QA must not fail it for being a stub.

### 5.4 States
- **Loading:** skeleton — avatar square + two text lines with the standard shimmer (`linear-gradient(90deg, #F3F4F6 25%, #fff 50%, #F3F4F6 75%)`, 1.5s).
- **Signed out:** redirect to `/login?next=/profile` (same pattern as header's Sign in link).
- **Error:** session fetch fails → treat as signed out (mirrors `useAuth` behavior).

---

## 6. Settings Page (`/settings`) — Configure

### 6.1 Layout
Same shell as Profile: `max-w-[560px] mx-auto px-6 py-14`, kicker `ADROIT ACADEMY — SETTINGS`, h1 `Settings`. Single column of **sectioned white cards** (`rounded-[20px] border-gray-200 shadow-card`), each with a mono section kicker (red dot + label) + hairline divider under the header. Max 2 sections for now — restraint is the point.

### 6.2 Form patterns (shared language steel applies everywhere)
- **Labels:** 12px semibold `gray-600` ABOVE inputs (not placeholder-only).
- **Inputs:** `border-gray-200 rounded-md px-3 py-2 text-sm` → `focus:border-red` + red focus ring (existing global).
- **Primary button:** navy (`bg-navy text-white rounded-sm`), `hover:bg-navy-light hover:-translate-y-px active:scale-[0.98]` — the established button language.
- **Save bar:** bottom-right of each card (`Save` navy + `Discard` ghost); save disabled until dirty.
- **Destructive row:** red text button (`text-red hover:text-red-dark`) + 12px `gray-400` caption explaining consequence; uses a confirm dialog (§6.4).
- **Toggle:** custom switch — track `bg-gray-200` (off) / `bg-navy` (on), white knob, red focus ring, 24px hit area min.

### 6.3 Sections (minimal, honest)
1. **Reading progress** (real data exists — progress rows/quiz stats per user)
   - Destructive row: **Clear reading history** — wipes read/unread + quiz stats. **STUB** — needs a new `/api/progress/clear` (or similar) route; no backend today.
2. **Email updates** (the footer newsletter is a real system — a per-user toggle would need a new subscribe table)
   - Toggle: `Email me new posts` — **STUB** — needs new backend. Mockup shows it with a "coming soon" mono badge rather than a functional lie.

**Rule for execution:** every stub control gets a visible marker (mono `COMING SOON` badge or muted "requires setup" caption). No control may look functional when there is no API behind it — zod will check.

### 6.4 Confirm dialog (new pattern, shared)
For destructive actions: centered dialog card (`max-w-[380px]`, white, `rounded-xl`, **new `shadow-dialog` token**, border-gray-200), title 16px bold navy, body 13px gray-600, buttons right-aligned: gray ghost `Cancel` + red solid `Clear` (`bg-red text-white hover:bg-red-dark`). Backdrop: `bg-navy-dark/40` (no blur needed — "unearned blur" rule). Esc/cancel closes; focus moves into dialog on open.

---

## 7. Design Token Additions (draft)

`design/discovery/design-tokens-avatar-profile-settings.css` — paste into the existing `@theme inline` block in `globals.css`:

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

Utility patterns for steel (drop-in class strings):
- `.menu-item` — dropdown rows (§4.1)
- `.kicker` — mono red-dot label (already used on /login; reuse)
- `.field-label` — 12px semibold gray-600 label above inputs
- `.destructive-row` — red text row + gray caption
- `.switch` — custom toggle (§6.2)
- `.dialog-backdrop` / `.dialog-card` — confirm dialog (§6.4)

---

## 8. Motion Notes (for execution)

- Dropdown open/close: 150ms ease-out fade + 4px rise. No bounce — menus are Operate surfaces, not celebration moments (Moment springs stay reserved for accomplishment per the motion system pass).
- Avatar ring color change: 150ms ease-out.
- All interactive rows: `transition-colors duration-150`; primary buttons keep `duration-150` + press feedback.
- Respect the existing `prefers-reduced-motion` block — CSS-only transitions are covered automatically.

---

## 9. What Stays EXACTLY the Same (do not touch)

- `src/lib/hooks/useAuth.ts` interface (`AuthUser { id, email }`) — the only data surface.
- `src/components/Header.tsx` nav links, logo, Contact Us button, hamburger/drawer structure. Only the `authControl` block changes (desktop + mobile drawer).
- Navy/red palette, Inter, mono stack, rounded-xl, kicker language, `shadow-card` family.
- Existing `prefers-reduced-motion` block. No changes to `content/`, `src/lib/sort.ts`, build scripts.

## 10. Handoff Files

- `design/discovery/direction-brief-avatar-profile-settings.md` — THIS brief
- `design/discovery/design-tokens-avatar-profile-settings.css` — token additions draft
- `design/discovery/moodboards/moodboard-avatar-menu.png` — dropdown direction
- `design/discovery/moodboards/moodboard-profile.png` — Profile page direction
- `design/discovery/moodboards/moodboard-settings.png` — Settings page direction

## 11. Acceptance Criteria (for zod/QA after execution + steel)

1. Header shows initials avatar (not raw email) when signed in; avatar is square-ish `rounded-lg`, white initials on brand hue, deterministic per email.
2. Clicking avatar opens a right-aligned dropdown with **Profile / Settings / Sign out**; click-outside and Esc close it; keyboard arrow navigation works; focus returns to trigger.
3. Sign out still works (existing `/api/auth/logout` path), no confirm dialog.
4. `/profile` shows avatar + email + sign-in method; layout matches kicker/h1/card language; signed-out users redirect to `/login?next=/profile`.
5. `/settings` uses sectioned cards, label-above inputs, red focus rings, navy save button; destructive action has confirm dialog; every stub is visibly marked (no fake-functional controls).
6. Mobile: drawer shows a "Signed in as" block (avatar + email) + Profile/Settings/Sign out rows; header keeps hamburger behavior.
7. New tokens (`shadow-menu`, `shadow-dialog`, `--avatar-*`) present in globals.css `@theme inline`; `prefers-reduced-motion` still respected.
8. No changes to `useAuth.ts` interface, nav links, content/, sort logic; build passes.
