import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface Props {
  /**
   * Which surface degraded — used only for the test hook / markup contract.
   * Never render the series name here: a stealth series must not be named by
   * this page (security t_c4eafa3b F-2, CWE-200).
   */
  surface: "lesson" | "check" | "exam" | "certificate";
}

/**
 * src/components/Learn/AtlasUnavailable.tsx — the fail-CLOSED degrade page.
 *
 * Rendered when `decideCourseAccess` reports `{ kind: "unavailable" }` (the
 * Data API credential bridge could not mint a JWT, t_223f8b3d) on a content
 * route of a series that is statically known to be launched.
 *
 * It ships NO lesson MDX body, NO quiz/exam question text, NO certificate
 * identity — only an availability notice — because "we could not decide" must
 * never read as "you may read this" (security t_c4eafa3b F-1). Stealth and
 * unknown series never reach this component: they 404 upstream.
 */
export default function AtlasUnavailable({ surface }: Props) {
  return (
    <div className="min-h-screen flex flex-col" data-degraded="true">
      <Header />
      <main id="main" className="flex-1">
        <div className="max-w-[720px] mx-auto px-6 pt-12 pb-24">
          <div
            role="status"
            aria-live="polite"
            data-testid="atlas-unavailable"
            data-surface={surface}
            className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card-soft)] p-7"
          >
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-[var(--ink-faint)] uppercase tracking-[0.09em] mb-3">
              <span
                aria-hidden="true"
                className="w-[3px] h-3 rounded-sm bg-[var(--accent)]"
              />
              Temporarily unavailable
            </div>
            <h1 className="text-[clamp(1.35rem,3vw,1.75rem)] font-extrabold text-[var(--ink)] tracking-[-0.02em] leading-tight mb-3">
              This page is temporarily unavailable
            </h1>
            <p className="text-[14.5px] text-[var(--ink-muted)] leading-relaxed mb-6">
              We can&apos;t read live course data right now, so we&apos;re not
              showing this page until we can. Nothing has changed about your
              access or your progress — please retry in a minute.
            </p>
            <Link
              href="/atlas"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold no-underline hover:bg-navy-light transition-colors duration-150"
            >
              Back to Learn
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
