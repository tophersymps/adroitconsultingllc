/**
 * /profile — account identity page (server component).
 *
 * Session gate: reads the HttpOnly session cookie via the SSR Supabase client;
 * guests are redirected to /login?next=/profile. Loads the profile row
 * (lazily upserted by GET /api/profile) and renders ProfileForm (client,
 * edits name/username) + CertificateSection (derived certificates).
 */
import type { Metadata } from "next";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StubBadge from "@/components/StubBadge";
import ProfileForm from "@/components/Profile/ProfileForm";
import CertificateSection from "@/components/Profile/CertificateSection";
import LockedSkyTeaser from "@/components/Constellations/LockedSkyTeaser";
import FullSkySection from "@/components/Constellations/FullSkySection";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadProfileSky } from "@/lib/sky-server";
import { avatarHueClass, initialsFromEmail } from "@/lib/avatar";
import { buildMetadata } from "@/lib/seo";
import type { UserProfile } from "@/shared/contracts-account";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Your profile — Adroit Blog",
  path: "/profile",
  description: "Your account identity for Adroit Academy.",
});

export default async function ProfilePage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guest → locked-sky value preview (B-18 LockedSkyTeaser) instead of a
  // redirect wall. One real CTA to /login?next=/profile.
  if (!user) return <LockedSkyTeaser />;

  const email = user.email ?? "";

  // Read the profile row server-side (lazy upsert on first read).
  let profile: UserProfile = {
    userId: user.id,
    displayName: null,
    username: null,
    themePref: "system",
  };
  try {
    const { data } = await supabase
      .from("user_profiles")
      .select("user_id, display_name, username, theme_pref")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      profile = {
        userId: data.user_id,
        displayName: data.display_name,
        username: data.username,
        themePref: ["system", "light", "dark"].includes(data.theme_pref)
          ? data.theme_pref
          : "system",
      };
    }
  } catch {
    // fall back to defaults — ProfileForm re-reads via GET /api/profile
  }

  const initials = profile.displayName
    ? (profile.displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A")
    : initialsFromEmail(email);

  // Constellation + Chronicle (B-18): full-sky hero — the hero IS the starfield.
  // Loads completion events → rank/streak/stats + every course constellation.
  const sky = await loadProfileSky(user.id);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main" className="flex-1">
        {/* Sky hero */}
        <FullSkySection sky={sky} />
        <div className="max-w-[640px] mx-auto px-6 py-14">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-[var(--accent)] uppercase tracking-[0.08em] mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            Adroit Academy — Account
          </div>
          <h1 className="text-3xl font-extrabold text-[var(--ink-primary)] tracking-[-0.02em] mb-2">Your profile</h1>
          <p className="text-[14px] text-[var(--ink-muted)] mb-7">
            Your identity across Adroit Academy — name, username, email, and the certificates
            you&apos;ve earned.
          </p>

          {/* Identity card */}
          <div className="bg-[var(--surface-card)] rounded-[20px] border border-[var(--border-default)] shadow-card p-8 mb-6">
            <div className="flex items-center gap-[18px] mb-4">
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white ${avatarHueClass(email)}`}
              >
                {initials}
              </span>
              <div className="min-w-0">
                {profile.displayName ? (
                  <div className="truncate text-xl font-extrabold text-[var(--ink-primary)] tracking-[-0.01em]">
                    {profile.displayName}
                  </div>
                ) : null}
                {profile.username ? (
                  <div className="font-mono text-[13px] text-[var(--ink-muted)]">@{profile.username}</div>
                ) : null}
                <div className="mt-1 break-all font-mono text-[11.5px] text-[var(--ink-faint)]">{email}</div>
              </div>
            </div>
            <hr className="mb-5 border-t border-[var(--border-subtle)]" />
            <div className="flex items-center justify-between gap-4 mb-6">
              <span className="text-[14px] font-semibold text-[var(--ink-body)]">Password</span>
              <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ink-faint)]">
                Change password
                <StubBadge />
              </span>
            </div>

            {/* Editable name/username (WS-5) */}
            <div className="border-t border-[var(--border-subtle)] pt-5">
              <div className="font-mono text-[11px] font-bold text-[var(--accent)] uppercase tracking-[0.08em] mb-4">
                Profile
              </div>
              <ProfileForm />
            </div>
          </div>

          {/* My certificates (WS-5) */}
          <div className="bg-[var(--surface-card)] rounded-[20px] border border-[var(--border-default)] shadow-card p-8">
            <div className="flex items-center justify-between mb-5">
              <div className="font-mono text-[11px] font-bold text-[var(--accent)] uppercase tracking-[0.08em]">
                My certificates
              </div>
            </div>
            <CertificateSection supabase={supabase} userId={user.id} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
