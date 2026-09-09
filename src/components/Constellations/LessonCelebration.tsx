/**
 * LessonCelebration — client adapter that feeds the live streak (from
 * useAchievement) into ConstellationCelebration. The server lesson page passes
 * the static lesson/course facts; the client supplies the as-of-now streak.
 */
"use client";

import { useAchievement } from "@/lib/hooks/useAchievement";
import { ConstellationCelebration } from "@/components/Constellations/ConstellationCelebration";
import type { ConstellationCelebrationProps } from "@/shared/contracts-constellations";

export function LessonCelebration(props: Omit<ConstellationCelebrationProps, "streakDays">) {
  const { stats } = useAchievement();
  return <ConstellationCelebration {...props} streakDays={stats.streakDays} />;
}

export default LessonCelebration;
