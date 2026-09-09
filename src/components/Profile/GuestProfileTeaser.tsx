import Link from "next/link";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * GuestProfileTeaser — locked-preview value demo for /profile (backlog B-09 /
 * constellation "locked sky" teaser, kara §3.7 LockedSkyTeaser).
 *
 * Replaces the wall of dead "Sign in" strings with a single real CTA to
 * /login?next=/profile. Renders the constellation sky LOCKED (dim pinpricks,
 * soft starfield) as the members value demo — your profile is where your
 * progress, streak, and certificates light up.
 */
export default function GuestProfileTeaser() {
  const stars = Array.from({ length: 24 });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main" className="flex-1">
        <div className="relative overflow-hidden">
          {/* Locked sky canvas */}
          <div className="absolute inset-0 bg-navy" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, rgba(200,16,46,0.14) 0%, transparent 55%)",
            }}
          />
          {/* Dim pinprick constellation — future-gated (locked state) */}
          <div className="absolute inset-0 flex flex-wrap justify-center items-center gap-x-8 gap-y-6 px-8 pt-10 pb-8 opacity-40">
            {stars.map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="w-[6px] h-[6px] rounded-full"
                style={{
                  background:
                    i % 4 === 0 ? "rgba(200,16,46,0.5)" : "rgba(125,211,252,0.4)",
                }}
              />
            ))}
          </div>

          {/* Content over the sky */}
          <div className="relative max-w-[720px] mx-auto px-6 pt-16 pb-16 text-center">
            <div className="font-mono text-[11px] font-bold text-white/70 uppercase tracking-[0.14em] mb-4">
              <span className="w-2 h-2 inline-block rounded-full bg-red mr-2" />
              Your sky awaits
            </div>
            <h1 className="text-[clamp(2rem,5vw,2.75rem)] font-extrabold text-white tracking-[-0.02em] leading-tight mb-4">
              One profile. Every star you&apos;ve earned.
            </h1>
            <p className="text-white/70 text-[15px] max-w-[520px] mx-auto leading-relaxed mb-8">
              Sign in to see your learning path, day streak, and certificates
              light up across every course you complete — your progress lives
              here.
            </p>

            {/* Value demo rows (what members unlock) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-[560px] mx-auto mb-9">
              {[
                {
                  glyph: "✦",
                  label: "Your constellations",
                  sub: "each course lights a star",
                },
                {
                  glyph: "⚡",
                  label: "Day streak",
                  sub: "keep the flame going",
                },
                {
                  glyph: "✓",
                  label: "Certificates",
                  sub: "everything you&apos;ve earned",
                },
              ].map((f) => (
                <div
                  key={f.label}
                  className="bg-white/8 border border-white/12 rounded-xl p-4 backdrop-blur-sm"
                >
                  <div className="text-red text-lg leading-none mb-2">{f.glyph}</div>
                  <div className="text-white text-[13px] font-semibold">{f.label}</div>
                  <div className="text-white/55 text-[11.5px] mt-0.5">{f.sub}</div>
                </div>
              ))}
            </div>

            {/* Single real CTA */}
            <Link
              href="/login?next=/profile"
              className="inline-flex items-center gap-2 bg-red text-white text-[14px] font-semibold px-7 h-12 rounded-sm hover:bg-red-dark hover:-translate-y-px transition-all duration-150 no-underline"
            >
              Sign in or create account <span aria-hidden>&rarr;</span>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
