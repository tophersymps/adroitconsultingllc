/**
 * /settings — account settings page (server component).
 *
 * Session gate: same pattern as /profile — SSR client reads the HttpOnly
 * cookie; guests redirect to /login?next=/settings.
 *
 * Appearance section (WS-2): ThemeToggle persists themePref per-account via
 * PATCH /api/profile. Honest-stub rule still applies to every control with no
 * backend (Email updates, Clear history) — those render static + COMING SOON.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StubBadge from "@/components/StubBadge";
import ThemeToggle from "@/components/Theme/ThemeToggle";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildMetadata } from "@/lib/seo";
import type { ThemePref } from "@/shared/contracts-account";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Settings — Adroit Blog",
  path: "/settings",
  description: "Account and reading preferences for Adroit Academy.",
});

const kicker = "inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-[var(--accent)] uppercase tracking-[0.08em] mb-3";

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  // Seed ThemeProvider with the account's persisted theme (avoids a flash of
  // guest-localStorage theme before the account pref applies).
  let accountPref: ThemePref = "system";
  try {
    const { data } = await supabase
      .from("user_profiles")
      .select("theme_pref")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data && ["system", "light", "dark"].includes(data.theme_pref)) {
      accountPref = data.theme_pref as ThemePref;
    }
  } catch {
    // fall back to system
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main" className="flex-1">
        <div className="max-w-[560px] mx-auto px-6 py-14">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold text-[var(--accent)] uppercase tracking-[0.08em] mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            Adroit Academy — Settings
          </div>
          <h1 className="text-3xl font-extrabold text-[var(--ink-primary)] tracking-[-0.02em] mb-2">Settings</h1>
          <p className="text-[14px] text-[var(--ink-muted)] mb-7">
            Manage your identity, appearance, and reading preferences. Controls without a backend
            yet are clearly marked — nothing here pretends to work when it can&apos;t.
          </p>

          {/* Section — Appearance (WS-2: the dark mode toggle) */}
          <section
            aria-labelledby="sec-appearance"
            className="bg-[var(--surface-card)] rounded-[20px] border border-[var(--border-default)] shadow-card p-6 mb-6"
          >
            <h2 id="sec-appearance" className={kicker}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              Appearance
            </h2>
            <ThemeToggle authed accountPref={accountPref} />
            <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-faint)] mt-2.5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-[13px] w-[13px] text-[var(--signal-done)]"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Follows your device unless you pick a manual override. Saved to your account.
            </div>
          </section>

          {/* Section — Reading progress (real data exists, but clearing needs a new API) */}
          <section
            aria-labelledby="sec-reading"
            className="bg-[var(--surface-card)] rounded-[20px] border border-[var(--border-default)] shadow-card p-6 mb-6"
          >
            <h2 id="sec-reading" className={kicker}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              Reading progress
            </h2>
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <div className="text-[14px] font-semibold text-[var(--ink-body)]">Clear reading history</div>
                <div className="text-xs text-[var(--ink-faint)]">
                  Wipes read/unread and quiz stats from your account.
                </div>
              </div>
              <StubBadge />
            </div>
          </section>

          {/* Section — Email updates (needs a subscribe table; no backend today) */}
          <section
            aria-labelledby="sec-email"
            className="bg-[var(--surface-card)] rounded-[20px] border border-[var(--border-default)] shadow-card p-6"
          >
            <h2 id="sec-email" className={kicker}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              Email updates
            </h2>
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <div className="text-[14px] font-semibold text-[var(--ink-body)]">Email me new posts</div>
                <div className="text-xs text-[var(--ink-faint)]">When the Adroit blog publishes.</div>
              </div>
              <span className="flex items-center gap-2">
                <StubBadge />
                {/* Static non-functional switch — aria-hidden, no interaction */}
                <span
                  aria-hidden="true"
                  className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-[var(--border-strong)]"
                >
                  <span className="inline-block h-4 w-4 translate-x-0.5 rounded-full bg-[var(--surface-card)] shadow-sm" />
                </span>
              </span>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
