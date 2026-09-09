# Adroit Blog — Dark Mode Refresh: Token Spec + Handoff

Design task `t_04d6d884` (kara) → implementation task `t_1addcce3` (steel)
Date: 2026-08-12 · Tenant: adroit-blog · Surface archetype: **Decide/Learn** (editorial reading — layout preserved, dark remap fixed)

---

## 1. Problem (from Chris + lara)

Chris reported dark-mode readability problems on the blog post page: **headline dark slate on dark navy, share icons and dividers with no dark variant, faint tag pills.**

**Root cause (audited in repo, not guessed):** the semantic token system in `src/app/globals.css` (`:root` + `html.dark` remap) is already correct and mostly passes WCAG AA — but the **blog post page and its components hard-code light-mode Tailwind utilities** (`text-navy`, `text-gray-800`, `bg-white`, `border-gray-200`, `bg-gray-100`, `ring-gray-200`) that never respond to the `.dark` class. The Header/Footer already use semantic tokens (`var(--ink-*)`, `var(--surface-*)`) and auto-adapt; the post page does not.

Files with zero `dark:` variants (verified by grep):
`src/app/blog/[slug]/page.tsx`, `src/components/BlogPost/ShareBar.tsx`, `src/components/BlogPost/PostNavigation.tsx`, `src/components/BackLink.tsx`, `src/components/Progress/ProgressIndicator.tsx`, `src/components/Progress/MarkAsRead.tsx`, `src/components/Progress/PostReadProgress.tsx`, and the blog listing family (`PostCard.tsx`, `FeaturedPost.tsx`, `blog/page.tsx` — **out of scope for this task, listed in §6 as follow-up**).

## 2. Research — dark-mode references (2-3 systems studied)

| System | Background | Text | Muted | Border | Pattern |
|---|---|---|---|---|---|
| **GitHub Dark** | `#0D1117` | `#E6EDF3` | `#8B949E` | `#30363D` | near-black, cool gray-blue text, subtle borders |
| **Linear Dark** | `#08090A` | `#F7F8F8` | `#8A8F98` | `rgba(255,255,255,0.03)` 1px | near-black, elevation via 1px hairline borders |
| **Tailwind slate scale** (already the app's base) | slate-900→`#0f172a` | slate-100 `#F1F5F9` | slate-400 `#94A3B8` | slate-800 `#1E293B` | cool neutral ramp, the current tokens' family |

**Design decision:** the app's existing dark tokens already sit in this family (navy-tinted near-black `#0a0e1a`, slate text tiers). The refresh **keeps every dark surface/ink token** (verified passing below) and changes only:
1. **Borders/dividers** — current `#1e293b`/`#182136` are *invisible* (1.32:1 / 1.20:1). Lightened for visibility; interactive boundaries get slate-500 `#64748b` which genuinely passes 3:1.
2. **Missing dark variants** — the hard-coded utilities above get `dark:` class patterns (exact strings in §4).
3. **Dark focus ring** — explicit `html.dark` rule using the dark accent (5.54:1).

Company identity preserved: navy `#0B1D3A` / red `#C8102E` remain the brand base; dark mode is an **evolution** (lighter red accent `#f05066` for text, navy-tinted surfaces), never a replacement.

## 3. Dark-mode token table (final values + WCAG AA proof)

`html.dark` block in `src/app/globals.css` — **values that CHANGE are bolded; everything else is unchanged (verified passing).**

### Surfaces
| Token | Dark value | Notes |
|---|---|---|
| `--surface-page` | `#0a0e1a` | navy-tinted near-black (GitHub-dark pattern) — keep |
| `--surface-card` | `#121a2e` | keep |
| `--surface-card-soft` | `#0e1526` | keep |
| `--surface-sunken` | `#0c1322` | keep |
| `--surface-inverse` | `#1e293b` | navy buttons — keep |
| `--surface-inverse-hover` | `#334155` | keep (white text on it = 7.7:1) |

### Text tiers (fg on page `#0a0e1a`)
| Token | Value | On page | On card `#121a2e` | On sunken `#0c1322` | Verdict |
|---|---|---|---|---|---|
| `--ink-strong` | `#f1f5f9` | **17.58:1** | 15.80:1 | 16.94:1 | PASS (headline, h2/h3) |
| `--ink-primary` | `#e2e8f0` | **15.62:1** | 14.04:1 | 15.05:1 | PASS (author, links, nav titles) |
| `--ink-body` | `#cbd5e1` | **12.97:1** | 11.66:1 | 12.50:1 | PASS (article body) |
| `--ink-muted` | `#94a3b8` | **7.51:1** | 6.75:1 | 7.24:1 | PASS (meta, tags, share label, icons) |
| `--ink-faint` | `#7f8ca3` | **5.67:1** | 5.10:1 | 5.46:1 | PASS (helper text) |
| `--ink-on-inverse` | `#f8fafc` | — | — | — | PASS on inverse (13.98:1) |

### Accent / signal
| Token | Value | Ratio (worst rendered) | Verdict |
|---|---|---|---|
| `--accent` (text) | `#f05066` | 4.98:1 on card | PASS |
| `--accent-hover` (text) | `#f47385` | 6.30:1 on card | PASS |
| `--accent-bg` + white | `#C8102E` | 5.88:1 | PASS |
| `--signal-done` (text, dark) | `#34d399` | 9.01:1 on card | PASS |
| `--signal-warn` (text, dark) | `#fbbf24` | 10.37:1 on card | PASS |

### Borders / dividers — **CHANGED (Chris: invisible)**
| Token | Old dark | New dark | On page | On card | WCAG note |
|---|---|---|---|---|---|
| `--border-default` | `#1e293b` | **`#26324a`** | 1.50:1 | 1.30:1 | decorative separators are 1.4.11-exempt; visibility-tuned (GitHub uses ~1.5:1) |
| `--border-subtle` | `#182136` | **`#1c2438`** | 1.25:1 | — | hairline in-card dividers |
| `--border-strong` | `#334155` | **`#64748b`** (slate-500) | **4.05:1** | 3.64:1 | **interactive boundaries — genuinely passes 3:1** |

### New dark rules (add to `html.dark` area)
```css
html.dark :focus-visible {
  outline-color: var(--accent);           /* 5.54:1 on page — clearer than brand red 3.27:1 */
}
```

### Light-mode bonus fixes (pre-existing fails, answers "faint tag pills")
These are LIGHT-mode fails found while proving no-regression. Chris's "faint tag pills" is partly this. Small, safe; steel to apply with the same sweep:
| Element | Old (light) | New (light) | Ratio after |
|---|---|---|---|
| Post meta + share label | `text-gray-400` (2.39:1) | `text-gray-500` | **4.55:1** |
| Post tag pills | `text-gray-500` (4.39:1) | `text-gray-600` | **6.87:1** |
| Share copy "copied" bg | `bg-emerald` (white 2.54:1) | `bg-emerald-700 dark:bg-emerald-600` | **5.48:1 / 3.77:1** |

## 4. Elements missing dark variants — exact treatment (file → class change)

All `dark:` variants work because the app already defines `@custom-variant dark (&:where(.dark, .dark *))` in globals.css.

### src/app/blog/[slug]/page.tsx
| Element | Line | Current (light) | Add | Ratio after |
|---|---|---|---|---|
| **Headline h1** (the #1 complaint) | 96 | `text-navy` | `dark:text-[var(--ink-strong)]` | 17.58:1 |
| Avatar ring | 71 | `ring-white` | `dark:ring-[var(--surface-card)]` | subtle, decorative |
| Author name | 75 | `text-gray-800` | `dark:text-[var(--ink-primary)]` | 15.62:1 |
| Meta date/readTime | 78 | `text-gray-400` | `dark:text-[var(--ink-muted)]` | 7.51:1 |
| Meta divider (w-px) | 80 | `bg-gray-200` | `dark:bg-[var(--border-default)]` | visible separator |
| Featured badge | 89 | `bg-red/10 text-red` | `dark:bg-red/15 dark:text-[var(--accent)]` | 5.54:1 |
| **Tag pills** | 106 | `bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-navy` | `dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-muted)] dark:hover:bg-[var(--surface-card-soft)] dark:hover:text-[var(--ink-primary)]` | 7.24:1 |
| Read-progress divider | 117 | `border-gray-100` | `dark:border-[var(--border-subtle)]` | visible |
| Banner ring | 128 | `ring-gray-200` | `dark:ring-[var(--border-default)]` | visible |

### src/components/BlogPost/ShareBar.tsx
| Element | Line | Current | Add | Ratio |
|---|---|---|---|---|
| Container | 65 | `border-gray-200` | `dark:border-[var(--border-default)]` | visible |
| "Share" label | 66 | `text-gray-400` | `dark:text-[var(--ink-muted)]` | 7.51:1 |
| Share icon buttons | 76 | `border-gray-200 bg-white text-gray-600` | `dark:border-[var(--border-default)] dark:bg-[var(--surface-card)] dark:text-[var(--ink-muted)]` | glyph 6.75:1 |
| Copy button idle | 87 | `border-gray-200 bg-white text-gray-500` | `dark:border-[var(--border-default)] dark:bg-[var(--surface-card)] dark:text-[var(--ink-muted)]` | 6.75:1 |
| Copy button copied | 86 | `bg-emerald text-white border-emerald` | `bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-600` | 5.48:1 / 3.77:1 |

Hover states (`hover:bg-navy hover:text-white`) are shared and already pass both modes (white on navy 16.79:1).

### src/components/BlogPost/PostNavigation.tsx
| Element | Line | Current | Add |
|---|---|---|---|
| Card border | 15, 33 | `border-gray-200 hover:border-gray-300 hover:bg-white` | `dark:border-[var(--border-default)] dark:hover:border-[var(--border-strong)] dark:hover:bg-[var(--surface-card)]` |
| Prev/Next label | 17, 35 | `text-gray-400` | `dark:text-[var(--ink-muted)]` |
| Card title | 23, 41 | `text-navy group-hover:text-red` | `dark:text-[var(--ink-primary)] dark:group-hover:text-[var(--accent)]` |

### src/components/BackLink.tsx
| Line | Current | Add |
|---|---|---|
| 7 | `text-gray-500 hover:text-navy` | `dark:text-[var(--ink-muted)] dark:hover:text-[var(--ink-primary)]` |

### src/components/Progress/ProgressIndicator.tsx
| Line | Current | Add |
|---|---|---|
| 26 | `text-gray-500` | `dark:text-[var(--ink-muted)]` |
| 30 | `text-navy` | `dark:text-[var(--ink-primary)]` |
| 42 | `bg-gray-200` | `dark:bg-[var(--surface-sunken)]` |

### src/components/Progress/MarkAsRead.tsx
| Line | Current | Add |
|---|---|---|
| 46 | `bg-gray-100 text-gray-600 hover:bg-navy hover:text-white` | `dark:bg-[var(--surface-card)] dark:text-[var(--ink-muted)] dark:hover:bg-navy dark:hover:text-white` |
| 45 | `bg-green-100 text-green-700 hover:bg-green-200` | `dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/50` |

### src/components/Progress/PostReadProgress.tsx
| Line | Current | Add |
|---|---|---|
| 28 | `bg-gray-100` | `dark:bg-[var(--surface-sunken)]` |

## 5. Files to touch (complete list)

- `src/app/globals.css` — 3 border values in `html.dark` + `html.dark :focus-visible` rule (§3)
- `src/app/blog/[slug]/page.tsx` — 9 class strings (§4)
- `src/components/BlogPost/ShareBar.tsx` — 5 class strings (§4)
- `src/components/BlogPost/PostNavigation.tsx` — 6 class strings (§4)
- `src/components/BackLink.tsx` — 1
- `src/components/Progress/ProgressIndicator.tsx` — 3
- `src/components/Progress/MarkAsRead.tsx` — 2
- `src/components/Progress/PostReadProgress.tsx` — 1

No new dependencies. No light-mode regressions (verified in §3 bonus table). Do NOT touch Header/Footer (already semantic).

## 6. Out of scope — follow-up recommended (not this task)

- Blog **listing** page family (`blog/page.tsx`, `PostCard.tsx`, `FeaturedPost.tsx`, `SortToggle.tsx`, `ReadFilter.tsx`, `tags/*`, `categories/*`) has zero dark variants — same hard-coded pattern. Needs a sibling design/implement task.
- Learn h1 gradient tail (`learn/page.tsx:65`): `to-[var(--surface-inverse-hover)]` is 1.86:1 in dark → change dark endpoint to `--ink-muted` (`#94a3b8`, 7.51:1) — already flagged by lara `t_926221f7`.
- Lara's light-mode `--signal-done` `#10B981 → #047857` (t_926221f7 HIGH) — shared token change; the ShareBar copied-state fix in §4 covers the visible instance.

## 7. Verification evidence

- Contrast math: `deliverables/contrast-proof.py` (full matrix) + `deliverables/contrast-final.py` (tuned values) — both exit 0, all pairs PASS.
- Visual mockup: `deliverables/mockup-post-dark.html` + screenshot `deliverables/screenshots/mockup-post-dark.png` (browser-verified).
