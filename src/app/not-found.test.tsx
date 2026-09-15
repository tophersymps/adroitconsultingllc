/**
 * /not-found — branded 404 (backlog B-03, kara #2 + lois #11).
 *
 * The branded 404 gives three real CTAs (Back to blog, Browse Learn, Contact)
 * so a dead deep-learn URL becomes a wayfinding moment instead of a dead end.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer" /> }));

import NotFound from "./not-found";

describe("app/not-found (B-03)", () => {
  it("renders the branded 404 with the three navigation CTAs", async () => {
    const { default: R } = await import("react-dom/server");
    const html = R.renderToString(<NotFound />);
    // Display moment + brand tokens
    expect(html).toMatch(/4.*0.*4/);
    expect(html).toContain("Page not found");
    // Three real CTAs (merger: Home + blog + local contact, no external adroit.io)
    expect(html).toContain("Back to home");
    expect(html).toContain('href="/"');
    expect(html).toContain("Browse the blog");
    expect(html).toContain('href="/field-notes"');
    expect(html).toContain("Contact us");
    expect(html).toContain('href="/contact"');
    // No external adroit.io self-links remain (merger DoD)
    expect(html).not.toContain("adroit.io/contact");
    // Header + Footer present (full bleed, not a bare error)
    expect(html).toContain("header");
    expect(html).toContain("footer");
  });
});
