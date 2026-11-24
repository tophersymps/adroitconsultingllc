/**
 * `<Steps>` / `<Step>` — procedural sections as a real ordered list.
 *
 * Server components. `Steps` is an `<ol>` (so it is exposed to assistive tech as
 * a list and numbering is real, not painted), and each `Step` is an `<li>` whose
 * lead-in `title` is a block-level `<span>` with `font-weight: 700` — deliberately
 * NOT a heading, so it never enters the document outline (ADR-705).
 */
import type { ReactNode } from "react";

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="fn-steps">{children}</ol>;
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="fn-step">
      <span className="fn-step-title">{title}</span>
      {children}
    </li>
  );
}
