import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CONSENT_STORAGE_KEY } from "@/lib/analytics";

/**
 * `<Analytics />` from @vercel/analytics injects a script on mount, so the
 * mocked stand-in renders a marker element. What is under test is the gate:
 * the component must render nothing until consent is granted, then appear on
 * the same-tab Accept click without a reload, then disappear on revoke.
 */
vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));

import VercelAnalytics from "./VercelAnalytics";

describe("VercelAnalytics consent gate", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders nothing while consent is undecided", () => {
    render(<VercelAnalytics />);
    expect(screen.queryByTestId("vercel-analytics")).toBeNull();
  });

  it("renders nothing when consent was declined", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "denied");
    render(<VercelAnalytics />);
    expect(screen.queryByTestId("vercel-analytics")).toBeNull();
  });

  it("renders immediately for a returning visitor with a saved grant", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    render(<VercelAnalytics />);
    expect(screen.getByTestId("vercel-analytics")).toBeTruthy();
  });

  it("appears on the same-tab Accept click and disappears on revoke", async () => {
    const { grantAnalyticsConsent, revokeAnalyticsConsent } = await import(
      "@/lib/analytics"
    );
    render(<VercelAnalytics />);
    expect(screen.queryByTestId("vercel-analytics")).toBeNull();

    act(() => {
      grantAnalyticsConsent();
    });
    expect(screen.getByTestId("vercel-analytics")).toBeTruthy();

    act(() => {
      revokeAnalyticsConsent();
    });
    expect(screen.queryByTestId("vercel-analytics")).toBeNull();
  });
});