/**
 * `<Callout>` — an inline editorial callout with exactly three variants.
 *
 * Server component. `kind` is normalised against a whitelist because MDX is not
 * type-checked: a `kind="typo"` would otherwise reach us at build time and emit an
 * unknown class. A typo degrades to the `rule` variant (visibly wrong, but the
 * article still renders) rather than throwing and failing the whole site build
 * (ADR-704).
 */
import type { ReactNode } from "react";

export type CalloutKind = "rule" | "warning" | "proof";
export type CalloutProps = { kind: CalloutKind; children: ReactNode };

const KINDS = ["rule", "warning", "proof"] as const;
const LABEL: Record<CalloutKind, string> = {
  rule: "Rule",
  warning: "Warning",
  proof: "Proof",
};

export function Callout({ kind, children }: CalloutProps) {
  // MDX is not type-checked, so a typo can reach us at build time. Normalise
  // against the whitelist: the class string must never leave these three.
  const safe: CalloutKind = KINDS.includes(kind) ? kind : "rule";
  if (safe !== kind) {
    console.warn(`[Callout] unknown kind="${kind}", falling back to "rule"`);
  }
  return (
    <aside className={`fn-callout fn-callout--${safe}`} aria-label={LABEL[safe]}>
      <p className="fn-box-label">{LABEL[safe]}</p>
      {children}
    </aside>
  );
}

export default Callout;
