/**
 * LockedSkyTeaser — the guest "locked sky" teaser for /profile (P2, pairs with
 * B-09). A dark sky canvas with faint unborn stars and one real CTA to
 * /login?next=/profile. No dead "Sign in" strings.
 */
"use client";

import Link from "next/link";

export function LockedSkyTeaser({ ctaHref = "/login?next=/profile" }: { ctaHref?: string }) {
  // Static faint starfield (decorative, non-interactive).
  const dots = Array.from({ length: 24 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    top: `${(i * 53) % 100}%`,
    delay: `${(i % 6) * 0.4}s`,
  }));

  return (
    <section
      className="cx-sky overflow-hidden"
      data-testid="locked-sky-teaser"
    >
      <div className="relative px-6 py-16 text-center md:px-10">
        {/* Decorative starfield */}
        <div aria-hidden className="absolute inset-0">
          {dots.map((d, i) => (
            <span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-white/20"
              style={{ left: d.left, top: d.top }}
            />
          ))}
        </div>

        <div className="relative mx-auto max-w-[440px]">
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--sky-ink-muted)]">
            YOUR SKY
          </p>
          <h1 className="mt-3 text-[clamp(1.9rem,4vw,2.5rem)] font-extrabold leading-tight tracking-[-0.02em] text-[var(--sky-ink)]">
            Your sky is waiting to be charted.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--sky-ink-muted)]">
            Complete lessons across the Learn catalog to light your stars, build a
            streak, and earn certificates.
          </p>
          <Link
            href={ctaHref}
            data-testid="locked-sky-cta"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-[var(--constellation-star-lit)] px-6 py-3 text-[14px] font-bold text-white no-underline shadow-lg transition-transform duration-150 hover:-translate-y-0.5"
          >
            Sign in or create account →
          </Link>
        </div>
      </div>
    </section>
  );
}

export default LockedSkyTeaser;
