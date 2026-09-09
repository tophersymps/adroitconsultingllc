/**
 * Header — public mobile nav toggle tests (t_c4c0a710).
 *
 * The public Header ships a mobile hamburger drawer below md. This suite
 * locks the WAI-ARIA disclosure contract at the component level so the
 * touch-target hardening (mobile sweep) can't regress the toggle behavior:
 * the hamburger exposes `aria-controls="mobile-nav"` + a synced
 * `aria-expanded`, opening renders the drawer, and tapping a drawer link
 * closes it. The drawer is fully server-render-coupled state (no API), so
 * the assertions run headless without a viewport.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "./Header";
import { ThemeProvider } from "@/components/Theme/ThemeProvider";

vi.mock("next/navigation", () => ({
  usePathname: () => "/blog",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isLoading: false, refresh: vi.fn() }),
  notifyAuthChanged: vi.fn(),
}));

function renderHeader() {
  return render(
    <ThemeProvider>
      <Header />
    </ThemeProvider>,
  );
}

describe("Header mobile nav toggle (t_c4c0a710)", () => {
  beforeEach(() => {
    // No persistent state between renders; each test mounts a fresh Header.
  });

  it("renders a hamburger wired to the mobile drawer via aria-controls/aria-expanded", () => {
    renderHeader();
    const hamburger = screen.getByRole("button", { name: "Toggle menu" });
    expect(hamburger).toHaveAttribute("aria-controls", "mobile-nav");
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    // Drawer is closed on load.
    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
  });

  it("opens the drawer and flips aria-expanded on tap", async () => {
    const user = userEvent.setup();
    renderHeader();
    const hamburger = screen.getByRole("button", { name: "Toggle menu" });

    await user.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    const drawer = screen.getByRole("navigation", { name: "Mobile" });
    expect(drawer).toHaveAttribute("id", "mobile-nav");
    // Unified nav surface present inside the drawer (Home is the marketing root).
    expect(
      within(drawer).getByRole("link", { name: "Home" }),
    ).toBeInTheDocument();
  });

  it("closes the drawer when a drawer link is tapped", async () => {
    const user = userEvent.setup();
    renderHeader();
    const hamburger = screen.getByRole("button", { name: "Toggle menu" });

    await user.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    const drawer = screen.getByRole("navigation", { name: "Mobile" });
    expect(drawer).toBeInTheDocument();

    await user.click(within(drawer).getByRole("link", { name: "Home" }));
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
  });

  it("keeps the drawer closed after re-opening + toggling back", async () => {
    const user = userEvent.setup();
    renderHeader();
    const hamburger = screen.getByRole("button", { name: "Toggle menu" });

    await user.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    await user.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
  });
});