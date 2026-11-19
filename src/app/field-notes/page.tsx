/**
 * /field-notes listing — server component.
 *
 * PERF (t_dc2f7d85): this route is PRERENDERED (○) + ISR and CDN-served, not
 * dynamically rendered.
 *
 * History: B-08 threaded the URL `searchParams` into <BlogListingClient> as a
 * plain prop so the island would NOT call `useSearchParams()` itself — that call
 * forces the client tree up to the nearest Suspense boundary to bail out to
 * client-side rendering, leaving only a "Loading posts…" fallback in the initial
 * HTML (the LCP/CWV fix from Brainiac #3 + #9). Reading `searchParams` is a
 * request-time API, though, so the route rendered per request: measured
 * 2026-11-15, crawlers re-fetch this index ~860x/day, and with the project at
 * 90.8% of the Hobby Fluid Active CPU allowance (crossing 100% pauses the
 * deployment) every one of those was a full SSR render.
 *
 * The CWV goal is preserved WITHOUT a request-time API. The island renders the
 * unfiltered first page (hero + featured + 8 cards) from the `posts` prop alone,
 * so that markup is in the prerendered document, and the URL query string
 * (?category= / ?read= / ?sort=) is adopted by the island after mount from
 * `window.location`. Nothing here reads searchParams, cookies() or headers(), so
 * the route is prerendered at build time, served from the CDN (`x-vercel-cache:
 * HIT`) and revalidated by ISR instead of re-rendered per request.
 *
 * The 48 KB `posts.ts` dataset is still resolved server-side only and passed in
 * as a serialized RSC prop — it does not ride in the client JS bundle.
 *
 * Trade-off, stated plainly: a filtered deep link (?category=sf etc.) now
 * receives the same prerendered unfiltered first page and applies the filter
 * once hydrated, instead of being server-rendered filtered. The canonical,
 * search-visible index URL is the unfiltered one, and filtered URLs are never
 * crawled (they are not in sitemap.xml).
 */
import { posts } from "@/data/posts";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BlogListingClient from "@/components/BlogListing/BlogListingClient";

/**
 * Prerender + CDN cache. Explicit because it is load-bearing, exactly like
 * /atlas: an accidental `await searchParams`, `cookies()` or `headers()` in this
 * segment would silently flip the route back to ƒ (per-request rendering) and
 * hand the CPU back to the crawlers. `force-static` makes that failure mode
 * impossible — request-time APIs resolve to empty during prerendering.
 */
export const dynamic = "force-static";

/**
 * ISR: the route stays prerendered and CDN-served, and the browser-visible
 * article set only changes through a deploy anyway (`data/posts.ts` is generated
 * by `scripts/build-posts.js` in prebuild). Hourly revalidation matches /atlas
 * and self-heals a bad render instead of freezing it until the next release.
 */
export const revalidate = 3600;

export default function BlogListing() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main id="main" className="flex-1">
        <BlogListingClient posts={posts} />
      </main>

      <Footer />
    </div>
  );
}
