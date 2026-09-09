/**
 * ThemeToggle — segmented System/Light/Dark control (Settings).
 *
 * Locks the WCAG 2.5.8 mobile touch floor: every segmented radio
 * button must carry a min-h-[44px] hit target (the Settings surface is a
 * primary touch surface). Also verifies the roving-tabindex radio behaviour
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ThemeToggle from "./ThemeToggle";
import { ThemeProvider } from "./ThemeProvider";

describe("ThemeToggle (segmented variant — Settings)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the three theme radios", () => {
    render(
      <ThemeProvider>
        <ThemeToggle authed />
      </ThemeProvider>,
    );
    expect(screen.getByRole("radio", { name: "System" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeInTheDocument();
  });

  it("gives every segmented radio a >=44px touch target", () => {
    render(
      <ThemeProvider>
        <ThemeToggle authed />
      </ThemeProvider>,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toHaveClass("min-h-[44px]");
    }
  });

  it("keeps a single tab stop on the active radio (roving tabindex)", () => {
      render(
        <ThemeProvider>
          <ThemeToggle authed />
        </ThemeProvider>,
      );
      const radios = screen.getAllByRole("radio");
      const active = radios.find((r) => r.getAttribute("aria-checked") === "true");
      expect(active).toBeDefined();
      const n = radios.indexOf(active as HTMLElement);
      expect(radios[n]).toHaveAttribute("tabindex", "0");
      for (const [i, r] of radios.entries()) {
        if (i !== n) expect(r).toHaveAttribute("tabindex", "-1");
      }
    });
});