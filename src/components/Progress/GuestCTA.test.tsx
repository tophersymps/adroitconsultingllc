/**
 * GuestCTA — role semantics (a11y finding 8) and kind-aware exam naming (B3).
 *
 * The CTA card must NOT use role="note" (a generic complement that adds
 * screen-reader noise); the wrapping <section> aria-label is the region name.
 * Content stays visible (no display:none tricks, no question text).
 *
 * B3: the exam and certificate tiers name the exam from `examLabels(kind)` —
 * a Tracks series must never say "certification prep" (US-009), a cert series
 * keeps its wording (US-010), and the counts come from props.
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
  usePathname: () => "/atlas/omni-studio-cert/exam",
}));

const EXAM_PROPS = {
  tier: "exam" as const,
  checkCount: 4,
  questionCount: 40,
  minutes: 105,
};

describe("GuestCTA a11y (t_5664453e)", () => {
  it("exposes a labelled region without a note role on the card", () => {
    const { container } = render(
      <GuestCTA tier="exam" ariaLabel="Cert prep exam locked" kind="certification-prep" />,
    );
    expect(screen.getByRole("region", { name: "Cert prep exam locked" })).toBeInTheDocument();
    expect(container.querySelector('[role="note"]')).toBeNull();
  });

  it("keeps real CTA content visible to screen readers", () => {
    render(<GuestCTA tier="exam" ariaLabel="Cert prep exam locked" kind="certification-prep" />);
    expect(screen.getByRole("link", { name: /Create an account/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Log in/ })).toBeInTheDocument();
    expect(screen.getByText(/Cert Prep Exam · locked for guests/)).toBeInTheDocument();
  });
});

describe("GuestCTA exam tier — kind-aware copy (B3)", () => {
  it("renders a course-completion series with no cert-prep strings", () => {
    const { container } = render(<GuestCTA {...EXAM_PROPS} kind="course-completion" />);
    const text = container.textContent ?? "";

    expect(screen.getByText(/Course Exam · locked for guests/)).toBeInTheDocument();
    expect(screen.getByText(/40 questions · 105 minutes · pass ≥ 72% · certificate/)).toBeInTheDocument();
    expect(
      screen.getByText(/Take the timed 40-question exam when all 4 knowledge checks are passed/),
    ).toBeInTheDocument();
    expect(text).not.toMatch(/certification prep/i);
    expect(text).not.toMatch(/cert prep/i);
  });

  it("renders a certification series with its existing wording", () => {
    render(<GuestCTA {...EXAM_PROPS} kind="certification-prep" />);

    expect(screen.getByText(/Cert Prep Exam · locked for guests/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cert Prep Exam locked" })).toBeInTheDocument();
  });

  it("certificate tier names the exam from the labels too", () => {
    const { container } = render(
      <GuestCTA tier="certificate" kind="course-completion" ariaLabel="Certificate locked" />,
    );
    expect(
      screen.getByText(/finishing every lesson and passing the timed course completion exam/),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/cert prep/i);
  });

  it("never falls back to cert-prep copy when kind is missing", () => {
    const { container } = render(<GuestCTA {...EXAM_PROPS} />);
    expect(screen.getByText(/Exam · locked for guests/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/certification prep/i);
    expect(container.textContent).not.toMatch(/cert prep/i);
  });
});
