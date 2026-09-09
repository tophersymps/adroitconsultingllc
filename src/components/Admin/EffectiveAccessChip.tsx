import type { EffectiveAccessState } from "@/lib/access";

/**
 * EffectiveAccessChip — the honest five-state chip (ADR-220). Renders the
 * effective-access language (granted/one-time/subscribed/free/none), never
 * "empty = no access". Two variants:
 *   - pill: the Access Panel / roster label (mono uppercase, tinted bg)
 *   - cell: the AccessGrid 26px circle, single mono letter G/O/S/F/—
 *
 * kara tokens (admin-experience-tokens.css §1): bg = tint, text = dark hue
 * (light) / bright hue (dark). Dark mode is handled by the --access-* tokens'
 * html.dark remap.
 */
const RGB: Record<EffectiveAccessState, string> = {
  granted: "225,29,72",
  "one-time": "13,148,136",
  subscribed: "124,58,237",
  free: "14,165,233",
  none: "",
};

const LABEL: Record<EffectiveAccessState, string> = {
  granted: "Granted",
  "one-time": "One-time",
  subscribed: "Subscribed",
  free: "Free",
  none: "None",
};

const LETTER: Record<EffectiveAccessState, string> = {
  granted: "G",
  "one-time": "O",
  subscribed: "S",
  free: "F",
  none: "—",
};

export function EffectiveAccessChip({
  state,
  variant = "pill",
  title,
}: {
  state: EffectiveAccessState;
  variant?: "pill" | "cell";
  /** Optional tooltip / aria-label override (e.g. per-user context). */
  title?: string;
}) {
  const rgb = RGB[state];
  const label = LABEL[state];

  if (variant === "cell") {
    const style =
      state === "none"
        ? { backgroundColor: "var(--access-none-bg)", color: "var(--access-none)" }
        : {
            backgroundColor: `rgba(${rgb}, 0.14)`,
            color: `var(--access-${state})`,
          };
    return (
      <span
        role="img"
        aria-label={title ?? label}
        title={title ?? label}
        className="inline-flex items-center justify-center font-mono text-[11px] font-bold rounded-full"
        style={{ width: "var(--admin-chip-size)", height: "var(--admin-chip-size)", ...style }}
      >
        {LETTER[state]}
      </span>
    );
  }

  const style =
    state === "none"
      ? { backgroundColor: "var(--access-none-bg)", color: "var(--access-none)" }
      : {
          backgroundColor: `rgba(${rgb}, 0.12)`,
          color: `var(--access-${state})`,
        };
  return (
    <span
      className="inline-flex items-center rounded-full font-mono text-[10px] font-bold uppercase tracking-[0.04em] px-2.5 py-1 whitespace-nowrap"
      style={style}
    >
      {label}
    </span>
  );
}
