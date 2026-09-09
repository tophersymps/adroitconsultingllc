/**
 * GuestCTA — role-semantics regression test (a11y finding 8).
 *
 * The CTA card must NOT use role="note" (a generic complement that adds
 * screen-reader noise); the wrapping <section> aria-label is the region
 * name. Content stays visible (no display:none tricks, no question text).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GuestCTA from "./GuestCTA";

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

vi.mock("next/navigation", () => ({
  usePathname: () => "/learn/omni-studio-cert/exam",
}));

describe("GuestCTA a11y (t_5664453e)", () => {
  it("exposes a labelled region without a note role on the card", () => {
    const { container } = render(<GuestCTA tier="exam" ariaLabel="Cert prep exam locked" />);
    expect(
      screen.getByRole("region", { name: "Cert prep exam locked" }),
    ).toBeInTheDocument();
    expect(container.querySelector('[role="note"]')).toBeNull();
  });

  it("keeps real CTA content visible to screen readers", () => {
    render(<GuestCTA tier="exam" ariaLabel="Cert prep exam locked" />);
    expect(screen.getByRole("link", { name: /Create an account/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Log in/ })).toBeInTheDocument();
    expect(screen.getByText(/Cert Prep Exam · locked for guests/)).toBeInTheDocument();
  });
});
