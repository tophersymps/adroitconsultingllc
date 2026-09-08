This is the **Adroit Consulting** marketing site built with [Next.js](https://nextjs.org) (App Router), React, TypeScript, and Tailwind CSS v4. The repo root is one level up; planning docs live in `../../docs/planning` and brand masters in `../../brand/logo`.

## Getting Started

From this directory, install and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `src/app/` — Routes, layouts, API routes, global styles
- `src/components/` — Reusable UI, layout, section, and effect components
- `src/lib/` — Constants and shared utilities
- `public/` — Static assets (favicons, logos, OG image, web manifest)
- `scripts/` — Asset generation (favicon/OG image from SVG sources)

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

| Variable | Purpose |
|----------|---------|
| `SALESFORCE_OID` | Salesforce org ID for Web-to-Lead |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Google reCAPTCHA v3 site key |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA v3 secret key |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 measurement ID |
| `NEXT_PUBLIC_SITE_URL` | Production URL for OG images and sitemap |

## Fonts

The site uses [Inter](https://fonts.google.com/specimen/Inter) via `next/font/google` for automatic optimization and self-hosting.

## Regenerating Assets

Favicon PNGs, ICO, and the OG image are generated from the SVG logos in `public/`:

```bash
node scripts/generate-assets.mjs
```

## Deployment

Set all environment variables in your hosting platform (e.g. Vercel) and deploy. The [Vercel Platform](https://vercel.com) is recommended for zero-config Next.js deployment.
