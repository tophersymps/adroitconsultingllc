/**
 * CookieConsent — hydration safety (t_80131e31).
 *
 * The banner is decided from localStorage, which the server cannot read, so it
 * MUST render nothing on the server AND on the client's first (hydration)
 * render — otherwise React throws a hydration mismatch (#418) on every page for
 * first-time visitors. The banner then appears from an effect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CookieConsent from "./CookieConsent";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getConsentState: vi.fn(),
    grantAnalyticsConsent: vi.fn(),
    initAnalytics: vi.fn(),
    revokeAnalyticsConsent: vi.fn(),
  },
}));

vi.mock("@/lib/analytics", () => ({
  getConsentState: mocks.getConsentState,
  grantAnalyticsConsent: mocks.grantAnalyticsConsent,
  initAnalytics: mocks.initAnalytics,
  revokeAnalyticsConsent: mocks.revokeAnalyticsConsent,
}));

const KEY = "adroit_cookie_consent";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.getConsentState.mockReturnValue("denied");
});

afterEach(() => {
  window.localStorage.clear();
});

describe("CookieConsent hydration safety", () => {
  it("renders nothing on the server (no markup for a first-time visitor)", async () => {
    const { renderToString } = await import("react-dom/server");
    expect(renderToString(<CookieConsent />)).toBe("");
  });

  it("shows the banner after hydration for an undecided visitor", async () => {
    render(<CookieConsent />);

    // The server output is empty (pinned above); the effect then reveals it.
    expect(await screen.findByRole("dialog", { name: /cookie consent/i })).toBeTruthy();
  });

  it("stays hidden for a returning visitor with a stored decision", async () => {
    window.localStorage.setItem(KEY, "granted");
    render(<CookieConsent />);

    await waitFor(() => expect(mocks.getConsentState).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides and persists the decision when accepted", async () => {
    render(<CookieConsent />);
    const accept = await screen.findByRole("button", { name: /accept/i });
    fireEvent.click(accept);

    expect(mocks.grantAnalyticsConsent).toHaveBeenCalled();
    expect(mocks.initAnalytics).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
