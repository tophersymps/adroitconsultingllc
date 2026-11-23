### Vercel Web Analytics, consent-gated (vercel-web-analytics)

**What** - Adds `@vercel/analytics` and mounts it through
`src/components/Analytics/VercelAnalytics.tsx`, a client wrapper that renders
`<Analytics />` only after cookie consent is granted. `src/lib/analytics.ts`
gains `CONSENT_CHANGE_EVENT`, dispatched by `grantAnalyticsConsent()` and
`revokeAnalyticsConsent()` so the gate reacts to an Accept click in the same
tab (`storage` events only reach other tabs).

**Why** - The site already ships GA4 consent mode: `analytics_storage` defaults
to denied and gtag.js only loads after the banner grants. `<Analytics />` sends
pageviews as soon as it mounts, so wiring it into the root layout unmodified
would measure visitors before their consent decision and contradict that
posture. `NEXT_PUBLIC_GA_MEASUREMENT_ID` is unset in production, so GA4 has
never actually run and this is the site's first live analytics.

**Verified** - No CSP change needed: the script and beacon are same-origin
(`/_vercel/insights/script.js`, `/_vercel/insights/view`), covered by the
existing `script-src 'self'` and `connect-src 'self'`. Tests cover undecided,
declined, saved-grant and same-tab grant/revoke transitions.

**Known Issues** - Off Vercel the insights endpoints 404 and the component is
inert, so analytics is tied to Vercel hosting.