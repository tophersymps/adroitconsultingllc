import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EffectiveAccessChip } from "./EffectiveAccessChip";

describe("EffectiveAccessChip (ADR-220)", () => {
  it("renders all five pill states with their honest label", () => {
    const cases: [string, string][] = [
      ["granted", "Granted"],
      ["one-time", "One-time"],
      ["subscribed", "Subscribed"],
      ["free", "Free"],
      ["none", "None"],
    ];
    for (const [state, label] of cases) {
      const { unmount } = render(
        <EffectiveAccessChip state={state as never} />,
      );
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    }
  });

  it("renders the single-letter grid variant (G/O/S/F/—)", () => {
    const cases: [string, string][] = [
      ["granted", "G"],
      ["one-time", "O"],
      ["subscribed", "S"],
      ["free", "F"],
      ["none", "—"],
    ];
    for (const [state, letter] of cases) {
      const { unmount } = render(
        <EffectiveAccessChip state={state as never} variant="cell" />,
      );
      expect(screen.getByText(letter)).toBeTruthy();
      unmount();
    }
  });

  it("uses an accessible role/aria-label for the grid cell", () => {
    render(<EffectiveAccessChip state="granted" variant="cell" title="Ace · course" />);
    expect(screen.getByRole("img", { name: "Ace · course" })).toBeTruthy();
  });
});
