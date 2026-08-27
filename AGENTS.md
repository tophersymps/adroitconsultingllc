# AGENTS.md

## Cursor Cloud specific instructions

This is a monorepo, but the only runnable app is the Next.js site in `apps/web`. Run all
commands from `apps/web` (not the repo root). Node 22 is required.

Standard commands (see `apps/web/package.json` / `apps/web/README.md`):
- Dev server: `npm run dev` (serves on http://localhost:3000)
- Lint: `npm run lint`
- Build: `npm run build`

Non-obvious notes:
- `npm run lint` currently reports pre-existing `react-hooks` errors in app code
  (`contact/page.tsx`, `GoogleAnalytics.tsx`, `CookieConsent.tsx`). These are not caused by
  environment setup and do NOT block `next build` (the Next 16 / Turbopack build does not run
  ESLint), so `build` and `dev` succeed despite them.
- The contact form (`/api/contact`) is the site's main interactive flow. It degrades
  gracefully without secrets: with no `SALESFORCE_OID` set it returns a "Contact form is not
  configured yet" message; client-side validation still works. To exercise the full success
  path locally, put `SALESFORCE_OID` (and optionally `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`,
  `RECAPTCHA_SECRET_KEY`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_SITE_URL`) in
  `apps/web/.env.local` (gitignored). reCAPTCHA verification is skipped in development.
