/**
 * AvatarMenu — dropdown behavior + a11y tests (t_f75bc52d).
 *
 * Verifies the WAI-ARIA menu-button contract: initials trigger, open on
 * click, focus to first item, Arrow/Home/End roving focus, Escape closes
 * + focus returns to trigger, outside-click closes, Sign out callback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AvatarMenu from "./AvatarMenu";
import { ThemeProvider } from "@/components/Theme/ThemeProvider";
import type { AuthUser } from "@/lib/hooks/useAuth";

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

// AvatarMenu now loads the display name via GET /api/profile and renders a
// ThemeToggle (which needs ThemeProvider context). Stub the fetch + wrap.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1", email: "jane.doe@adroit.io" }, profile: { displayName: null } }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const user: AuthUser = { id: "u1", email: "jane.doe@adroit.io", isAdmin: false };

function renderMenu(props: { isSigningOut?: boolean } = {}) {
  const onSignOut = vi.fn();
  const utils = render(
    <ThemeProvider>
      <AvatarMenu user={user} onSignOut={onSignOut} {...props} />
    </ThemeProvider>,
  );
  return { onSignOut, ...utils };
}

describe("AvatarMenu trigger", () => {
  it("shows initials derived from the email, not the raw email", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Account menu for jane.doe@adroit.io" });
    expect(trigger).toHaveTextContent("JD");
    expect(trigger).not.toHaveTextContent("jane.doe@adroit.io");
  });

  it("exposes menu-button ARIA semantics", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /Account menu/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on click, toggles aria-expanded, and focuses the first item", async () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /Account menu/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(menu).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveFocus());
  });
});

describe("AvatarMenu menu contents", () => {
  it("lists Profile, Settings, and Sign out with correct semantics", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    const profile = screen.getByRole("menuitem", { name: "Profile" });
    const settings = screen.getByRole("menuitem", { name: "Settings" });
    expect(profile).toHaveAttribute("href", "/profile");
    expect(settings).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("closes when a menu item is activated", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Profile" }));
    expect(screen.queryByRole("menu", { name: "Account" })).not.toBeInTheDocument();
  });

  it("does NOT render the Admin console item for non-admins (v4 gating)", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    expect(screen.queryByRole("menuitem", { name: /Admin console/ })).not.toBeInTheDocument();
    expect(screen.queryByText("admin")).not.toBeInTheDocument();
  });

  it("renders the Admin console item (with Admin tag) only for admins", () => {
    const onSignOut = vi.fn();
    render(
      <ThemeProvider>
        <AvatarMenu
          user={{ id: "u1", email: "chris@adroit.io", isAdmin: true }}
          onSignOut={onSignOut}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    const adminItem = screen.getByRole("menuitem", { name: /Admin console/ });
    expect(adminItem).toHaveAttribute("href", "/admin");
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument(); // identity role tag
  });
});

describe("AvatarMenu keyboard navigation", () => {
  it("ArrowDown/ArrowUp move focus with wrap-around", async () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveFocus());

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveFocus();

    // Theme quick-toggle row sits between Settings and Sign out.
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: /Theme:/ })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toHaveFocus();

    // wrap-around: last → first
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toHaveFocus();
  });

  it("Home/End jump to first/last item", async () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveFocus());

    fireEvent.keyDown(screen.getByRole("menu"), { key: "End" });
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Home" });
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveFocus();
  });

  it("Escape closes the menu and returns focus to the trigger", async () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: /Account menu/ });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveFocus());

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Account" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("ArrowDown on the trigger opens the menu", () => {
    renderMenu();
    fireEvent.keyDown(screen.getByRole("button", { name: /Account menu/ }), { key: "ArrowDown" });
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
  });
});

describe("AvatarMenu close behaviors", () => {
  it("closes on outside click", async () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu", { name: "Account" })).not.toBeInTheDocument();
  });

  it("invokes onSignOut when Sign out is clicked", () => {
    const { onSignOut } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu", { name: "Account" })).not.toBeInTheDocument();
  });

  it("shows the pending state on the Sign out row while signing out", () => {
    renderMenu({ isSigningOut: true });
    fireEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    expect(screen.getByRole("menuitem", { name: "…" })).toBeDisabled();
  });
});
