/**
 * /api/profile — read + update the authenticated user's profile row.
 *
 * GET  → upsert a user_profiles row on first read (lazy creation), then return
 *        `{ user, profile }`. 401 → `{ user: null }` (mirrors /api/auth/session).
 *        Rate-limited by IP (F2) — the lazy upsert is a DB write on first read,
 *        so the read path is gated just like PATCH to block write amplification.
 * PATCH → update displayName / username / themePref. Server-side session check
 *        (HttpOnly cookie) — writes are enforced server-side only, never via
 *        client RLS. Gated on `checkOrigin` (CSRF) + `checkRateLimit` (IP),
 *        matching sibling progress/account routes. 401 on no session.
 *
 * Contract: src/shared/contracts-account.ts (brainiac, t_cde0e74a).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkOrigin,
  checkRateLimit,
  getClientIp,
} from "@/lib/api-security";
import type {
  ProfilePatchRequest,
  UserProfile,
} from "@/shared/contracts-account";

const THEME_PREFS = ["system", "light", "dark"] as const;

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  theme_pref: string;
}

function toProfile(row: ProfileRow): UserProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    username: row.username,
    themePref: (THEME_PREFS as readonly string[]).includes(row.theme_pref)
      ? (row.theme_pref as UserProfile["themePref"])
      : "system",
  };
}

export async function GET(req: NextRequest) {
  try {
    /* --- Rate limit (F2) — protects the lazy-upsert DB write on first read --- */
    if (!checkRateLimit(getClientIp(req))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ user: null });
    }

    // Read own row; lazily upsert a default row so theme_pref has a home.
    let { data } = await supabase
      .from("user_profiles")
      .select("user_id, display_name, username, theme_pref")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      const { data: inserted, error } = await supabase
        .from("user_profiles")
        .upsert(
          { user_id: user.id, theme_pref: "system" },
          { onConflict: "user_id" },
        )
        .select("user_id, display_name, username, theme_pref")
        .single();
      if (error) throw error;
      data = inserted;
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email ?? "" },
      profile: toProfile(data as ProfileRow),
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    /* --- Origin / CSRF check (F6) — matches sibling account/progress routes --- */
    const originErr = checkOrigin(req);
    if (originErr) {
      return NextResponse.json({ error: originErr }, { status: 403 });
    }

    /* --- Rate limit (F2) --- */
    if (!checkRateLimit(getClientIp(req))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let body: ProfilePatchRequest;
    try {
      body = (await req.json()) as ProfilePatchRequest;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Validate shape: object with at least one known field.
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const hasField =
      "displayName" in body || "username" in body || "themePref" in body;
    if (!hasField) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }
    if (body.themePref !== undefined && !THEME_PREFS.includes(body.themePref)) {
      return NextResponse.json(
        { error: "themePref must be system, light, or dark" },
        { status: 400 },
      );
    }

    // Sanitize string fields (null clears them; non-string non-null → reject).
    for (const key of ["displayName", "username"] as const) {
      const v = body[key];
      if (v !== undefined && v !== null && typeof v !== "string") {
        return NextResponse.json(
          { error: `${key} must be a string or null` },
          { status: 400 },
        );
      }
    }
    const displayName =
      body.displayName === undefined
        ? undefined
        : (body.displayName ?? "").trim() || null;
    const username =
      body.username === undefined
        ? undefined
        : (body.username ?? "").trim().toLowerCase() || null;
    // Username charset (social-ready, enforced now to avoid bad rows later).
    if (
      username !== undefined &&
      username !== null &&
      !/^[a-z0-9_]{1,30}$/.test(username)
    ) {
      return NextResponse.json(
        { error: "Username: lower-case letters, numbers, underscores, ≤30 chars" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (username !== undefined) updates.username = username;
    if (body.themePref !== undefined) updates.theme_pref = body.themePref;
    updates.updated_at = new Date().toISOString();

    // Upsert the full row (handles both first-write and update) then read back.
    const { data, error } = await supabase
      .from("user_profiles")
      .upsert(
        { user_id: user.id, ...updates },
        { onConflict: "user_id" },
      )
      .select("user_id, display_name, username, theme_pref")
      .single();
    if (error) throw error;

    return NextResponse.json({ profile: toProfile(data as ProfileRow) });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
