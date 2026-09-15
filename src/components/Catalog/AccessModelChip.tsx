import type { AccessModel } from "@/shared/contracts-course-catalog";

/**
 * AccessModelChip — access-model hue pill (free/subscription/one-time/
 * sub-or-one-time/granted), shared across catalog + admin. kara tokens
 * (design-tokens-course-catalog-admin.css §2): hue at ~12% bg + darkened text.
 */
const MODELS: Record<AccessModel, { label: string; fg: string }> = {
  free: { label: "Free", fg: "var(--am-free-text)" },
  subscription: { label: "Subscription", fg: "var(--am-subscription-text)" },
  "one-time": { label: "One-time", fg: "var(--am-one-time-text)" },
  "sub-or-one-time": { label: "Sub or one-time", fg: "var(--am-sub-or-one-time-text)" },
  granted: { label: "Granted", fg: "var(--am-granted-text)" },
};

/** Hue rgb for the ~12% tinted background (matches the kara token pairs). */
const MODEL_RGB: Record<AccessModel, string> = {
  free: "14,165,233",
  subscription: "124,58,237",
  "one-time": "13,148,136",
  "sub-or-one-time": "79,70,229",
  granted: "225,29,72",
};

export function AccessModelChip({ model }: { model: AccessModel }) {
  const m = MODELS[model];
  return (
    <span
      className="inline-flex items-center rounded-md font-mono text-[11px] font-semibold uppercase tracking-[0.05em] px-2 py-0.5"
      style={{
        backgroundColor: `rgba(${MODEL_RGB[model]}, 0.12)`,
        color: m.fg,
      }}
    >
      {m.label}
    </span>
  );
}
