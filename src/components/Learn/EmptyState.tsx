import Link from "next/link";

interface EmptyStateProps {
  title?: string;
  body?: string;
  ctaHref?: string;
  ctaLabel?: string;
}

/**
 * Graceful "coming soon" state for empty series (BA edge case).
 * Never 404s, never breaks layout.
 *
 * a11y (R3 follow-up t_42efdd92 F2/F6): the decorative "00 / 00" counter is
 * bumped to --ink-muted (≥4.5:1, was text-gray-300 ≈1.47:1), and the surface/
 * border/text utilities are tokenized so the state fully restyles in dark
 * mode (the global html.dark remap does not cover border/white surfaces).
 */
export default function EmptyState({
  title = "No lessons published yet",
  body = "This track is being written. New lessons publish daily once the series launches — check back soon.",
  ctaHref = "/learn",
  ctaLabel = "Browse other tracks",
}: EmptyStateProps) {
  return (
    <div className="border border-dashed border-[var(--border-strong)] rounded-2xl px-6 py-12 text-center">
      <div className="font-mono text-3xl font-bold text-[var(--ink-muted)] tracking-tight mb-3.5">
        00 / 00
      </div>
      <div className="text-[15px] font-bold text-[var(--ink-body)] mb-1.5">{title}</div>
      <p className="text-[12.5px] text-[var(--ink-muted)] leading-relaxed max-w-[240px] mx-auto mb-[18px]">
        {body}
      </p>
      <Link
        href={ctaHref}
        className="inline-flex items-center text-xs font-bold text-[var(--ink-on-inverse)] bg-[var(--surface-inverse)] px-[18px] py-2.5 rounded-lg no-underline hover:bg-[var(--surface-inverse-hover)] transition-colors duration-150"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
