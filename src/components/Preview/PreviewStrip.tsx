/**
 * PreviewStrip — full-width amber band above the article on /preview/*.
 *
 * Per kara's draft-state design (t_417a1026): NOT inside the 720px article
 * column (1120 gutter), not sticky (ReadingProgress owns the top edge).
 * Kicker row (mono, pulsing amber dot + DRAFT), title row, message, back
 * link right-aligned. Light/dark via semantic tokens.
 *
 * Semantics: <div role="region" aria-label="Draft preview notice"> placed
 * BEFORE the <article> — never inside it.
 */
import Link from "next/link";

interface PreviewStripProps {
  title: string;
  status: "draft" | "published";
  /** Where the back link points (e.g. /blog, /learn/<series>). */
  backHref: string;
}

export default function PreviewStrip({
  title,
  status,
  backHref,
}: PreviewStripProps) {
  const isDraft = status === "draft";
  return (
    <div role="region" aria-label="Draft preview notice" className="preview-strip">
      <div className="preview-strip-inner">
        <div className="flex items-center gap-4 min-w-0">
          <span className="preview-strip-kicker">
            <span className="dot" aria-hidden="true" />
            Draft · preview
          </span>
          <span
            role="status"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-wider draft-badge"
          >
            <span className="dot" aria-hidden="true" />
            {isDraft ? "Draft" : "Published"}
          </span>
          <div className="min-w-0">
            <div className="preview-strip-title">{title}</div>
            <div className="preview-strip-msg">
              {isDraft
                ? "Not yet published - this preview is only visible to you."
                : "Published content - this preview matches the public page."}
            </div>
          </div>
        </div>
        <Link href={backHref} className="preview-strip-back-link no-underline">
          &larr; Back to {backHref.startsWith("/learn") ? "Series" : "Blog"}
        </Link>
      </div>
    </div>
  );
}
