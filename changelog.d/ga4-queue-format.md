### GA4 actually sends hits (ga4-queue-format)

**What** - `initAnalytics()` in `src/lib/analytics.ts` now queues gtag commands
as the `arguments` object instead of a rest-args Array, emits the Consent Mode
`default` before `js`/`config`, and defaults `analytics_storage` to granted
when the visitor has granted (denied otherwise).

**Why** - GA4 had never sent a single hit, and nothing looked wrong: gtag.js
loaded, `window.google_tag_manager` held the container, `dataLayer` carried the
config, there were no CSP violations and no console errors. The stub was
`function (...args) { dataLayer.push(args) }`; gtag.js reads each queued entry
as an array-like `arguments` object and silently discards a real Array. Proven
by A/B on one page of a local production build: identical snippet with
`push(args)` produced zero requests and no `_ga` cookie, `push(arguments)`
produced `POST /g/collect` 204 and the cookie. The consent-default ordering was
also wrong (default after `js`), which Google's Consent Mode contract forbids.

**Verified** - Headless Chrome against `next start` of a production build with
`NEXT_PUBLIC_GA_MEASUREMENT_ID` set: before Accept, no Google request and no
cookie; after Accept, `/g/collect` returns 204 and `_ga` is set. Unit tests pin
the queue shape (no real Arrays, `consent default` first, `config` last). Lint,
full suite and build run locally.

**Known Issues** - The visitor's own ad/tracker blocker still suppresses hits;
that is expected and not something the code can override.