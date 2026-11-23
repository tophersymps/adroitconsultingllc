### Funnel events reach Vercel Web Analytics (vercel-funnel-events)

**What** - `trackEvent()` in `src/lib/analytics.ts` now sends each funnel event
to Vercel Web Analytics (`track()` from `@vercel/analytics`) before the GA4
path, gated on `getConsentState() === "granted"`. A `toVercelProperties()`
filter narrows params to the scalar values Vercel accepts, leaving the typed
helper signatures unchanged.

**Why** - `trackLessonComplete`, `trackQuizTierComplete`, `trackExamComplete`
and `trackCertificateViewed` only ever fired into GA4, and that path returns
early when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is unset, which is the case in
production. So the lesson to quiz to exam to certificate funnel was
unmeasurable on every backend. Vercel `track()` no-ops while `window.va` is
undefined, which is the pre-consent state because `VercelAnalytics` only
injects the script after a grant; the explicit consent check is defence in
depth.

**Verified** - Tests cover undecided, declined, granted, scalar-param
forwarding, dropping non-scalar params, and a gtag stub receiving the same
event. Lint, full test suite and build run locally.

**Known Issues** - Events fired before the consent gate mounts are dropped
rather than buffered, which matches the GA4 behaviour when the gtag stub is
absent.