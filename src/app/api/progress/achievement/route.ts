/**
 * GET /api/progress/achievement — achievement stats (rank, streak, course
 * counts) for the P1 lesson-complete pop + learn hub preview (B-18).
 *
 * Guests and signed-out callers get an empty (guest) stats block — never 401,
 * so the hub preview stays functional pre-login. Reads completion_events via
 * the RLS cookie-bound client (scoped to owner). Derivation is pure
 * (completion.ts) — no denormalized storage.
 */
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadAchievementStats } from "@/lib/sky-server";
import type { AchievementResponse } from "@/shared/contracts-constellations";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<AchievementResponse>> {
  let userId: string | null = null;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const stats = await loadAchievementStats(userId);
  return NextResponse.json({ stats } satisfies AchievementResponse);
}
