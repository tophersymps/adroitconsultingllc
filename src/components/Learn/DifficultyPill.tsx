import type { Difficulty } from "@/shared/contracts-course-catalog";

/**
 * DifficultyPill — catalog-wide difficulty scale (Beginner/Intermediate/
 * Advanced, plan §3c / ADR-208). Rendered on cards + course outlines.
 * Color-coded, muted, consistent with the Learn design tokens.
 */
const STYLES: Record<Difficulty, string> = {
  Beginner: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/25",
  Intermediate: "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/25",
  Advanced: "text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/25",
};

export default function DifficultyPill({
  difficulty,
  onGradient,
}: {
  difficulty: Difficulty | null | undefined;
  onGradient?: boolean;
}) {
  if (!difficulty) return null;
  return (
    <span
      className={`inline-flex items-center font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] px-2.5 py-1 rounded-full border ${
        onGradient
          ? "text-white bg-black/55 border-white/25 backdrop-blur-sm"
          : STYLES[difficulty]
      }`}
    >
      {difficulty}
    </span>
  );
}
