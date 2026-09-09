import Link from "next/link";
import MDXArticle from "@/components/MDX/MDXArticle";
import type { PaywallView } from "@/shared/contracts-course-catalog";
import { getAuthorInitials } from "@/lib/learn";
import type { LearnLesson } from "@/data/types";

/**
 * PreviewFirstLesson — the read-only preview variant of lesson 1 (ADR-221).
 * Rendered by /learn/[series]/preview for a `paywall`-decided user. Amber
 * strip + lesson-1 hero + readable excerpt + locked seam + unlock CTA. Never
 * renders the Paywall panel itself — the CTA returns to the Paywall access
 * options (the real lesson route re-runs the seam → paywall). Read-only: no
 * quiz/complete/completion in preview.
 */
export default function PreviewFirstLesson({
  view,
  lesson,
  mdx,
  seriesSlug,
  totalLessons,
}: {
  view: PaywallView;
  lesson: LearnLesson;
  mdx: string;
  seriesSlug: string;
  totalLessons: number;
}) {
  // CTA target: the first lesson's real route. For a still-`paywall` user that
  // route re-runs decideCourseAccess → renders the Paywall with these exact
  // access options. This is the intended terminal — NOT a loop.
  const ctaHref = `/learn/${seriesSlug}/${view.peekLessonSlug ?? lesson.slug}`;
  const unlockLabel = "Unlock full course →";

  return (
    <main id="main" className="flex-1">
      <div className="max-w-[820px] mx-auto px-6 pt-8 pb-16">
        {/* Amber preview strip — badge + message + dismissible × + unlock CTA */}
        <div
          className="flex items-center gap-3 flex-wrap rounded-xl border px-4 py-3 text-[13px] font-semibold mb-6"
          style={{
            background: "var(--preview-strip-bg)",
            color: "var(--preview-strip-ink)",
            borderColor: "rgba(245,158,11,0.35)",
          }}
        >
          <span
            className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] rounded-full px-2 py-1 whitespace-nowrap"
            style={{ background: "rgba(146,64,14,0.12)" }}
          >
            Preview
          </span>
          <span>
            You&rsquo;re previewing <strong>lesson 1 of {totalLessons}</strong>. You can
            read the first lesson — the full course unlocks when you subscribe.
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-red)] text-white text-[12px] font-bold px-3.5 min-h-[44px] no-underline hover:bg-[var(--color-red-dark)] whitespace-nowrap"
            >
              {unlockLabel}
            </Link>
          </span>
        </div>

        {/* Breadcrumb */}
        <Link
          href={`/learn/${seriesSlug}`}
          className="inline-flex items-center gap-1.5 text-[12px] text-gray-500 no-underline mb-5 hover:text-navy"
        >
          &larr; Back to {view.courseName}
        </Link>

        {/* Lesson meta */}
        <div className="flex items-center gap-2 font-mono text-[11px] text-gray-500 mb-4">
          <span className="bg-navy text-white px-2 py-0.5 rounded-[5px] font-bold">Lesson 1</span>
          <span>
            of {totalLessons} ·{" "}
            <Link href={`/learn/${seriesSlug}`} className="text-gray-500 no-underline hover:text-navy">
              {view.courseName}
            </Link>
          </span>
          <span className="text-[var(--signal-pending)] font-bold">◈ previewing — not enrolled</span>
        </div>

        {/* Title */}
        <h1 className="text-[clamp(1.7rem,4vw,2.2rem)] font-extrabold text-navy tracking-[-0.02em] leading-[1.15] mb-4">
          {lesson.title}
        </h1>

        {/* Author row */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-navy to-navy-light ring-2 ring-white shadow-sm flex items-center justify-center text-white font-bold text-xs">
            {getAuthorInitials(lesson.author)}
          </div>
          <div className="flex flex-col">
            <span className="text-[13.5px] font-semibold text-gray-800">{lesson.author}</span>
            <span className="text-[11.5px] text-gray-500">
              {lesson.date} · {lesson.readTime}
            </span>
          </div>
        </div>

        {/* Tags */}
        {lesson.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {lesson.tags.map((tag) => (
              <span key={tag} className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Readable excerpt — the peek (leading paragraphs), then locked seam */}
        <div className="preview-excerpt relative">
          <article className="article-body max-w-none">
            <MDXArticle mdx={mdx} kind="learn" />
          </article>

          {/* Locked seam — fade to locked + seam note */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[220px]"
            style={{ background: "var(--preview-lock-seam)" }}
            aria-hidden
          />
          <div className="relative text-center pt-8 pb-6">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{
                color: "var(--ink-muted)",
                background: "var(--surface-card, #FFFFFF)",
                borderColor: "var(--admin-table-border, #E5E7EB)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <span aria-hidden className="text-[var(--signal-pending)]">🔒</span>
              Content locked — subscribe to continue
            </span>
          </div>
        </div>

        {/* Unlock CTA block — returns to Paywall access options */}
        <div
          className="relative overflow-hidden rounded-[18px] text-center px-8 py-9 mt-5 text-white"
          style={{ background: "var(--color-navy)" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(60% 90% at 85% 15%, rgba(200,16,46,0.22) 0%, transparent 55%)",
            }}
          />
          <div className="relative">
            <h3 className="text-[1.45rem] font-extrabold tracking-[-0.02em] mb-2">Unlock the full course</h3>
            <p className="text-[14px] text-white/70 mb-5 max-w-[520px] mx-auto">
              Read all {totalLessons} lessons, run the practice checks, and earn
              the certificate — with the access plan that fits how you learn.
            </p>
            <div className="flex justify-center gap-5 flex-wrap mb-5">
              <span className="inline-flex items-center gap-2 text-[12.5px] text-white/85">
                <span aria-hidden className="text-[var(--color-red-light)]">✓</span> All {totalLessons} lessons
              </span>
              <span className="inline-flex items-center gap-2 text-[12.5px] text-white/85">
                <span aria-hidden className="text-[var(--color-red-light)]">✓</span> Practice checks
              </span>
              <span className="inline-flex items-center gap-2 text-[12.5px] text-white/85">
                <span aria-hidden className="text-[var(--color-red-light)]">✓</span> Certificate
              </span>
            </div>
            <Link
              href={ctaHref}
              className="inline-flex flex-col items-center rounded-[11px] bg-[var(--color-red)] text-white text-[14.5px] font-bold px-8 py-3 no-underline hover:bg-[var(--color-red-dark)] shadow-[0_18px_34px_-14px_rgba(200,16,46,0.6)]"
            >
              {unlockLabel}
              <span className="font-mono text-[9px] font-medium uppercase tracking-[0.05em] text-white/70">
                back to access options · never loops
              </span>
            </Link>
            <div className="font-mono text-[10px] text-white/50 mt-4">
              You&rsquo;ve already previewed lesson 1 · choose{" "}
              <Link href={ctaHref} className="text-white/80 underline">subscription</Link> or{" "}
              <Link href={ctaHref} className="text-white/80 underline">one-time</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
