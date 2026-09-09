/**
 * DraftBadge — status pill per kara's draft-state design (t_417a1026).
 *
 * Draft: amber tint + dashed border + pulsing dot ("live" state).
 * Published: emerald (--signal-done-bg), no pulse — used on index rows only,
 * never on the preview strip itself.
 *
 * Semantics: <span role="status"> with the status string; the pulsing dot is
 * aria-hidden (decorative). Motion auto-covered by the global
 * prefers-reduced-motion block.
 */
interface DraftBadgeProps {
  status: "draft" | "published";
}

export default function DraftBadge({ status }: DraftBadgeProps) {
  const isDraft = status === "draft";
  return (
    <span
      role="status"
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "font-mono text-[0.65rem] font-bold uppercase tracking-wider",
        isDraft ? "draft-badge" : "draft-badge is-published",
      ].join(" ")}
    >
      <span className="dot" aria-hidden="true" />
      {isDraft ? "Draft" : "Published"}
    </span>
  );
}
