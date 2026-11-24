/**
 * `<KeyTakeaways>` — the closing takeaways box.
 *
 * Same shape as `<TLDR>` but a distinct class and a distinct accent family
 * (emerald tint + top rule vs the TLDR's neutral card + red left rule), so the
 * two never read as the same box (ADR-703). Server component; styling comes from
 * the scoped `.fn-*` block in `src/app/globals.css`, not from Tailwind utilities
 * (see `TLDR.tsx` for why utilities are a no-op inside `.article-body`).
 */
import type { ReactNode } from "react";

export type KeyTakeawaysProps = {
  /** Box label. Default: "Key takeaways". */
  title?: string;
  /** Expects a markdown bullet list of 4 items. */
  children: ReactNode;
};

export function KeyTakeaways({
  title = "Key takeaways",
  children,
}: KeyTakeawaysProps) {
  return (
    <aside className="fn-takeaways" aria-label="Key takeaways">
      <p className="fn-box-label">{title}</p>
      {children}
    </aside>
  );
}

export default KeyTakeaways;
