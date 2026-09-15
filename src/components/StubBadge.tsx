/**
 * StubBadge — visible "COMING SOON" marker for controls that have no
 * backend yet. Honest-stub rule: anything rendered next to this badge
 * must be static/non-functional (no fake triggers, no save bars).
 */
export default function StubBadge() {
  return (
    <span className="inline-block rounded-full bg-amber-light px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-amber-800">
      Coming soon
    </span>
  );
}
