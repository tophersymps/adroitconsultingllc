/**
 * /profile — guest locked-preview (backlog B-09 / constellation "locked sky").
 *
 * Per B-09, a guest hitting /profile must NOT be redirected away or shown a
 * wall of dead "Sign in" strings: they get a locked-preview value demo with a
 * single real CTA to /login?next=/profile. This test locks that behaviour.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const getUser = vi.fn();
  return { mocks: { getUser } };
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }),
      }),
    }),
  }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock("@/components/StubBadge", () => ({ default: () => <span data-testid="stub" /> }));
vi.mock("@/components/Profile/ProfileForm", () => ({ default: () => <div data-testid="profile-form" /> }));
vi.mock("@/components/Profile/CertificateSection", () => ({
  default: () => <div data-testid="cert-section" />,
}));
vi.mock("@/lib/sky-server", () => ({
  loadProfileSky: () =>
    Promise.resolve({
      constellations: [],
      events: [],
      chronicle: [],
      rank: { id: "starseed", lessons: 0, courses: 0 },
      streakDays: 0,
      longestStreakDays: 0,
      coursesCompleted: 0,
      tracksCompleted: 0,
      nextProgressPct: 0,
    }),
}));
vi.mock("@/components/Constellations/FullSkySection", () => ({
  default: () => <div data-testid="full-sky" />,
}));
vi.mock("@/components/Constellations/LockedSkyTeaser", () => ({
  default: () => (
    <main data-testid="guest-teaser">
      <a data-testid="guest-cta" href="/login?next=/profile">
        Sign in or create account →
      </a>
    </main>
  ),
}));

import Page from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockReset();
});

describe("/profile — guest (B-09)", () => {
  it("renders the guest locked-preview teaser instead of redirecting", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { default: R } = await import("react-dom/server");
    const result = await Page();
    const html = R.renderToString(result as never);
    expect(html).toContain("guest-teaser");
    expect(html).toContain("guest-cta");
    // Single real CTA to /login?next=/profile
    expect(html).toContain("/login?next=/profile");
    expect(html).toContain("Sign in or create account");
  });

  it("redirects an authenticated user away from the teaser (to normal profile render)", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.c" } },
      error: null,
    });

    const { default: R } = await import("react-dom/server");
    const result = await Page();
    const html = R.renderToString(result as never);
    // Authed users get the real profile, not the guest teaser.
    expect(html).not.toContain("guest-teaser");
    expect(html).not.toContain("guest-cta");
  });
});
