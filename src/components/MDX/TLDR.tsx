/**
 * `<TLDR>` — the Field Notes "short version" box.
 *
 * Server component: no client directive, no hooks. Renders inside
 * `.article-body`, where the prose rules are UNLAYERED and therefore beat every
 * Tailwind utility (`@layer utilities`) whatever the specificity — so all
 * typography for this box comes from the scoped `.fn-*` block in
 * `src/app/globals.css`, never from utility classes. See the architecture
 * blueprint for `t_6363f05a` (ADR-702).
 */
import type { ReactNode } from "react";

export type TLDRProps = {
  /** Box label. Default: "The short version". */
  title?: string;
  /** Expects a markdown bullet list of 3 items. */
  children: ReactNode;
};

export function TLDR({ title = "The short version", children }: TLDRProps) {
  return (
    <aside className="fn-tldr" aria-label="Summary">
      <p className="fn-box-label">{title}</p>
      {children}
    </aside>
  );
}

export default TLDR;
