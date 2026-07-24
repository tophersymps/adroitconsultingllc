# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single Next.js 16 (App Router, React 19, TypeScript, Tailwind v4) marketing site. The only runnable app lives in `apps/web`; run all commands from that directory. Node 22 is required (already present on the VM). Dependencies are refreshed automatically by the startup update script (`npm ci` in `apps/web`).

Commands (see `apps/web/package.json`), run from `apps/web`:
- Dev server: `npm run dev` (http://localhost:3000)
- Build: `npm run build` — Production build: `npm run start`
- Lint: `npm run lint`

Non-obvious notes:
- Lint currently reports 3 pre-existing errors (React Hooks rules in `contact/page.tsx`, `GoogleAnalytics.tsx`, `CookieConsent.tsx`). These are code issues that exist on `main`, not environment problems — `npm run lint` itself works.
- There is no automated test framework configured in this repo.
- All env vars are optional for local dev and are `sync: false` secrets in `render.yaml` (`SALESFORCE_OID`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_SITE_URL`). None are needed just to run/browse the site.
- Contact form (`/contact` → `POST /api/contact`): reCAPTCHA verification is skipped when `NODE_ENV=development`. Validation always runs. Without `SALESFORCE_OID` set, a valid submission returns HTTP 500 `"Contact form is not configured yet."`; set `SALESFORCE_OID` (e.g. `SALESFORCE_OID=... npm run dev`) to get `{"success":true}` and exercise the full lead-capture path. Invalid/placeholder OIDs are silently discarded by Salesforce Web-to-Lead (no real lead created).
