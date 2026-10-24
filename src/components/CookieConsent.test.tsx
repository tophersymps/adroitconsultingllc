/**
 * CookieConsent — hydration contract (QA R2-4 F4).
 *
 * The banner is decided from localStorage, which does not exist during SSR.
 * Deciding it in a lazy useState initializer made the first client render
 * disagree with the server HTML and cost the whole page its server markup
 * (React #418 on /atlas). The rule this test locks in: server and first client
 * render both produce nothing, and only the post-mount effect reveals the
 * banner for a genuinely undecided visitor.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import CookieConsent from "./CookieConsent";

const CONSENT_KEY = "adroit_cookie_consent";

beforeEach(() => {
  window.localStorage.clear();
});

describe("CookieConsent hydration", () => {
  it("renders nothing on the server, so the client's first render can match", () => {
    expect(renderToString(<CookieConsent />)).toBe("");
  });

  it("shows the banner to an undecided visitor once hydrated", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("region", { name: "Cookie consent" })).toBeTruthy();
  });

  it("stays hidden for a returning visitor who granted consent", () => {
    window.localStorage.setItem(CONSENT_KEY, "granted");
    render(<CookieConsent />);
    expect(screen.queryByRole("region", { name: "Cookie consent" })).toBeNull();
  });

  it("stays hidden for a returning visitor who declined", () => {
    window.localStorage.setItem(CONSENT_KEY, "denied");
    render(<CookieConsent />);
    expect(screen.queryByRole("region", { name: "Cookie consent" })).toBeNull();
  });
});

/**
 * A11y LOW L2/L3 (t_b717ec09). The banner mounts post-hydration and does not
 * take focus, so it must describe itself as the non-modal notice it is (a
 * labelled live region, not a modal dialog), and its buttons must clear the
 * 44x44 touch-target minimum.
 */
describe("CookieConsent a11y semantics", () => {
  it("is a labelled, non-modal region that is announced politely", () => {
    render(<CookieConsent />);
    const banner = screen.getByRole("region", { name: "Cookie consent" });
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).not.toHaveAttribute("aria-modal");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gives both choices a >=44px touch target", () => {
    render(<CookieConsent />);
    for (const name of ["Decline", "Accept"]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("min-h-[44px]");
      expect(button.className).toContain("min-w-[44px]");
    }
  });
});
