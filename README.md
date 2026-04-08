# Adroit Consulting — Website repository

Monorepo layout: **planning docs**, **brand source assets**, and the **Next.js (React) site** live side by side. The app under `apps/web` is what you run and deploy; `brand/` is the canonical place for logo masters and exports.

## Layout

```
adroitconsultingllc/
├── apps/
│   └── web/                 # Next.js 16 + React + TypeScript + Tailwind (App Router, src/)
│       ├── public/          # Static files served at / (favicons, manifest, OG image — synced from brand/logo)
│       ├── src/app/         # Routes, layout, global styles
│       └── package.json
├── brand/
│   └── logo/                # Logo pack: source masters, web/social/print/email, guidelines, generator script
├── docs/
│   └── planning/            # Site outline, SOW, timeline, tech stack notes, pitch outline
└── README.md
```

### What goes where

| Area | Purpose |
|------|---------|
| `apps/web` | Application code only: components, pages, API routes, config. Run `npm install` and `npm run dev` here. |
| `apps/web/public` | Files referenced by URL (`/favicon.ico`, Open Graph images, `site.webmanifest`). Keep in sync with `brand/logo/web` (and key `social/` assets) when you regenerate logos. |
| `brand/logo` | **Source of truth** for all logo derivatives. Do not edit files in `public/` by hand long-term—regenerate here and copy into `public/` (or automate later). |
| `docs/planning` | Markdown deliverables: copy, IA, commercial framing—not shipped with the site. |

## Commands

From the site app:

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## React / Next.js file structure (inside `apps/web`)

Typical patterns you will grow into:

```
apps/web/
├── public/                 # Static assets (no bundling)
├── src/
│   ├── app/                # App Router: layout.tsx, page.tsx, route segments, api/…
│   ├── components/         # ui/, layout/, sections/, effects/ (add as you build)
│   └── lib/                # Shared helpers, constants, types
├── next.config.ts
├── tsconfig.json
└── package.json
```

- **`src/app`**: Each folder with a `page.tsx` is a URL segment. Colocated `layout.tsx`, `loading.tsx`, and `error.tsx` are optional.
- **`src/components`**: Reusable UI; import with the `@/*` alias from `tsconfig.json`.
- **`public`**: Favicon, manifest, robots.txt, large images referenced by path only.

## Optional next steps

- Add Framer Motion and tsParticles under `src/components/effects/` (per project plan).
- Point `metadata` in `src/app/layout.tsx` at production URLs when the domain is live.
- Add a root `package.json` with npm workspaces only if you introduce shared packages (e.g. `packages/ui`); not required for a single app.
