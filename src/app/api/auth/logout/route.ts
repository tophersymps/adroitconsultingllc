/**
 * POST /api/auth/logout — sign out the current user (clears the session cookie).
 */
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.signOut();
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "ok" });
  }
}
