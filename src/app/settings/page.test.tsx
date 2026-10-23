/**
 * /settings — identity states (t_e7dac838, from a11y/SEO audit t_e653885e).
 *
 * The JWT-bridge degrade patch (e0bf096a) folded the plain-guest case into the
 * outage branch, so a healthy guest saw a false "can't verify your session"
 * dead end with no sign-in link and no controls. These tests lock the three
 * states at the Data API boundary:
 *   1. guest   → redirect("/login?next=/settings"), no outage copy
 *   2. outage  → honest unavailable state, no redirect, page does not throw
 *   3. signed-in → the real settings controls render
 * Plus: the route is declared noindex (account-only page).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    factory: vi.fn(),
    redirect: vi.fn((url: string): never => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
  },
}));

class DbAuthUnavailableError extends Error {
  constructor(message = "auth unavailable") {
    super(message);
    this.name = "DbAuthUnavailableError";
  }
}

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: (...args: unknown[]) => mocks.factory(...args),
  DbAuthUnavailableError,
}));

vi.mock("@/components/Header", () => ({ default: () => <header>HEADER</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>FOOTER</footer> }));
vi.mock("@/components/StubBadge", () => ({ default: () => <span>COMING SOON</span> }));
vi.mock("@/components/Theme/ThemeToggle", () => ({ default: () => <div>TOGGLE</div> }));

const { default: SettingsPage, metadata } = await import("./page");

/** A Data API client stub whose `from()` chain resolves to the given row. */
function clientWith(row: { theme_pref?: string } | null) {
  return {
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/settings — guest (t_e7dac838 F1)", () => {
  it("redirects a healthy guest to /login?next=/settings instead of faking an outage", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.factory.mockResolvedValue(clientWith(null));

    let html = "";
    await expect(
      (async () => {
        html = renderToStaticMarkup((await SettingsPage()) as never);
      })(),
    ).rejects.toThrow("NEXT_REDIRECT:/login?next=/settings");

    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=/settings");
    // Nothing rendered before the redirect.
    expect(html).toBe("");
    expect(html).not.toContain("verify your session");
  });
});

describe("/settings — Data API outage (t_223f8b3d contract)", () => {
  it("renders the honest unavailable state and does not redirect", async () => {
    mocks.factory.mockRejectedValue(new DbAuthUnavailableError("no bearer"));

    const html = renderToStaticMarkup((await SettingsPage()) as never);

    expect(html).toContain("Settings");
    expect(html).toContain("verify your session");
    expect(mocks.redirect).not.toHaveBeenCalled();
    // The outage state is not the settings UI.
    expect(html).not.toContain("Appearance");
    expect(html).not.toContain("Reading progress");
  });
});

describe("/settings — signed in", () => {
  it("renders the settings controls", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.c" } },
      error: null,
    });
    mocks.factory.mockResolvedValue(clientWith({ theme_pref: "dark" }));

    const html = renderToStaticMarkup((await SettingsPage()) as never);

    expect(html).toContain("Appearance");
    expect(html).toContain("Reading progress");
    expect(html).toContain("Email updates");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("/settings — SEO (t_e7dac838 F2)", () => {
  it("declares noindex on the account-only route", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
