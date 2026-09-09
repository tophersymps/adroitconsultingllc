import Link from "next/link";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * /not-found — branded 404 (backlog B-03, Kara #2 + Lois #11).
 *
 * 404s are a frequent destination right now (6/7 series certificate pages and
 * deep Learn URLs currently 404), so this is a navy/red display moment with
 * three CTAs instead of a dead end. The Learn CTA goes to the hub (/learn).
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-page)]">
      <Header />
      <main id="main" className="flex-1 flex items-center">
        <div className="max-w-[680px] mx-auto px-6 py-20 text-center">
          {/* Navy/red display moment */}
          <div className="font-mono text-[11px] font-bold text-[var(--accent)] uppercase tracking-[0.14em] mb-5">
            <span className="w-2 h-2 inline-block rounded-full bg-[var(--accent)] mr-2" />
            Page not found
          </div>
          <h1 className="text-[clamp(3rem,9vw,5rem)] font-extrabold text-navy tracking-[-0.03em] leading-none mb-4">
            4<span className="text-[var(--accent)]">0</span>4
          </h1>
          <p className="text-[15px] text-gray-600 max-w-[460px] mx-auto leading-relaxed mb-9">
            The page you&apos;re looking for has drifted out of the Fortress.
            It may have moved, been renamed, or never existed. Let&apos;s get you
            back on course.
          </p>

          {/* 3 CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-navy text-white text-[13.5px] font-semibold px-6 h-12 rounded-sm hover:bg-navy-light hover:-translate-y-px transition-all duration-150 no-underline"
            >
              <span aria-hidden>&larr;</span> Back to home
            </Link>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 bg-[var(--accent)] text-white text-[13.5px] font-semibold px-6 h-12 rounded-sm hover:bg-[var(--accent-hover)] hover:-translate-y-px transition-all duration-150 no-underline"
            >
              Browse the blog <span aria-hidden>&rarr;</span>
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 border border-[var(--border-strong)] text-[var(--ink-body)] text-[13.5px] font-semibold px-6 h-12 rounded-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors duration-150 no-underline"
            >
              Contact us
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
