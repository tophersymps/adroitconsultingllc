/**
 * AdminShell — back-nav + sidebar nav integrity (G5, t_f94e01d5) + v5 nav
 * regroup (t_888621eb) + mobile off-canvas drawer (t_71a0d478, ADR-230).
 * The admin is a multi-page operating surface; the "Back to site" link must
 * live in the sidebar (NOT a modal) and point to the public site so an admin
 * can leave /admin back to the marketing/blog surface.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { AdminShell } from "./AdminShell";

let currentPath = "/admin/courses";
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => currentPath),
}));

/** Force a <md viewport so the off-canvas drawer behavior is exercised. */
function setMobile() {
  Object.defineProperty(window, "innerWidth", {
    value: 390,
    writable: true,
    configurable: true,
  });
}

function setDesktop() {
  Object.defineProperty(window, "innerWidth", {
    value: 1280,
    writable: true,
    configurable: true,
  });
}

/**
 * A11y LOW L1 (t_b717ec09). SSR cannot know the viewport, so `open` is false
 * on the server even at md+. The aside ships `md:visible` (painted as the
 * desktop sidebar) and used to ALSO ship aria-hidden="true", hiding focusable
 * nav links from the accessibility tree (axe aria-hidden-focus, WCAG 4.1.2)
 * until the mount effect measured the window — permanently without JS.
 */
describe("AdminShell SSR accessibility tree (t_b717ec09)", () => {
  function asideMarkup(): string {
    const html = renderToString(<AdminShell>content</AdminShell>);
    const match = html.match(/<aside id="admin-drawer"[\s\S]*?>/);
    expect(match).not.toBeNull();
    return match![0];
  }

  it("does not ship aria-hidden on the md-visible sidebar", () => {
    const aside = asideMarkup();
    expect(aside).not.toContain("aria-hidden");
    // The md+ sidebar styles are still server-rendered.
    expect(aside).toContain("md:visible");
  });

  it("still keeps the closed mobile drawer out of the a11y tree via visibility", () => {
    expect(asideMarkup()).toContain("invisible");
  });
});

describe("AdminShell back-nav (t_f94e01d5)", () => {
  it("renders a Back to site link in the sidebar pointing to the public site", () => {
    render(<AdminShell>content</AdminShell>);
    const link = screen.getByRole("link", { name: /back to site/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveClass("no-underline");
  });

  it("groups the nav by admin job (Access/Content/System) with no Matrix", () => {
    render(<AdminShell>content</AdminShell>);
    for (const label of [
      "Overview",
      "People",
      "Courses",
      "Catalog",
      "Analytics",
      "Audit Log",
      "Offers · Coupons",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    // The Access Matrix page is killed (ADR-222) — its job absorbed into
    // People + Access·Courses via the shared AccessGrid.
    expect(screen.queryByRole("link", { name: /access matrix/i })).toBeNull();
    expect(screen.getByRole("link", { name: /back to site/i })).toBeInTheDocument();
  });

  it("marks the active admin route with aria-current", () => {
    render(<AdminShell>content</AdminShell>);
    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("AdminShell mobile off-canvas drawer (t_71a0d478, ADR-230)", () => {
  beforeEach(() => {
    setMobile();
  });

  it("renders a hamburger toggle (md:hidden) wired to aria-expanded/controls", () => {
    setMobile();
    render(<AdminShell>content</AdminShell>);
    const toggle = screen.getByRole("button", { name: /open navigation/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "admin-drawer");
  });

  it("opens/closes the drawer via the toggle and mirrors aria-expanded", () => {
    render(<AdminShell>content</AdminShell>);
    const toggle = screen.getByRole("button", { name: /open navigation/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-label", "Close navigation");
    // The aside is visible when open, and its links are in the a11y tree.
    const drawer = screen.getByLabelText("Admin navigation");
    expect(drawer.className).toContain("visible");
    expect(drawer.className).not.toContain("invisible");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Admin navigation").className).toContain(
      "invisible",
    );
  });

  it("keeps the drawer closed (visibility:hidden) on a <md viewport before opening", () => {
    render(<AdminShell>content</AdminShell>);
    // No aria-hidden: the closed drawer leaves the a11y tree through
    // visibility:hidden (`invisible`), which is also what hides it visually.
    const drawer = screen.getByLabelText("Admin navigation");
    expect(drawer).not.toHaveAttribute("aria-hidden");
    expect(drawer.className).toContain("invisible");
  });

  it("always exposes the sidebar on a md+ viewport (static desktop sidebar)", () => {
    setDesktop();
    render(<AdminShell>content</AdminShell>);
    // Desktop: the aside is a visible layout landmark, never aria-hidden.
    const drawer = screen.getByLabelText("Admin navigation");
    expect(drawer).not.toHaveAttribute("aria-hidden");
    expect(drawer.className).toContain("visible");
  });

  it("closes the drawer on route change (usePathname effect)", () => {
    const { rerender } = render(<AdminShell>content</AdminShell>);
    const toggle = screen.getByRole("button", { name: /open navigation/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Simulate navigation to a different admin route → usePathname changes,
    // the auto-close effect fires, and the same instance's drawer closes.
    currentPath = "/admin/analytics";
    rerender(<AdminShell>content</AdminShell>);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the drawer on Escape and returns focus to the toggle", () => {
    render(<AdminShell>content</AdminShell>);
    const toggle = screen.getByRole("button", { name: /open navigation/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("moves focus into the first nav link when the drawer opens (focus-on-open)", () => {
    render(<AdminShell>content</AdminShell>);
    const toggle = screen.getByRole("button", { name: /open navigation/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Focus must NOT stay on the hamburger: forward-Tab from here should walk
    // the drawer's nav links, so focus lands on the first one (Overview).
    const firstNavLink = screen.getByRole("link", { name: "Overview" });
    expect(firstNavLink).toHaveFocus();
  });

  it("does not steal focus to the drawer on a md+ (desktop) viewport", () => {
    setDesktop();
    render(<AdminShell>content</AdminShell>);
    // Desktop renders the static sidebar with drawerOpen=false — opening the
    // drawer is impossible (hamburger is md:hidden), so nothing should be
    // force-focused by the mount.
    const firstNavLink = screen.getByRole("link", { name: "Overview" });
    expect(firstNavLink).not.toHaveFocus();
    expect(document.activeElement).not.toBe(firstNavLink);
  });

  it("closes the drawer when a nav link is tapped", () => {
    render(<AdminShell>content</AdminShell>);
    const toggle = screen.getByRole("button", { name: /open navigation/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("link", { name: "Audit Log" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});