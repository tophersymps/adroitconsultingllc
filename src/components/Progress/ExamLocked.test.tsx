/**
 * ExamLocked — kind-aware locked panel (Learn UX exam naming, card B3).
 *
 * Covers US-009 (a Tracks series never says "certification prep"/"cert prep"),
 * US-010 (a certification series keeps its wording), and the "Done means" rule
 * that the check count and duration come from props/constants rather than the
 * old hardcoded "all 9 knowledge checks" and "105-minute run".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ExamLocked from "./ExamLocked";
import type { CheckProgress } from "@/shared/contracts";

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

const CHECKS: CheckProgress[] = [
  { n: 1, bestScore: 90, attempts: 1, passed: true },
  { n: 2, bestScore: 40, attempts: 1, passed: false },
  { n: 3, bestScore: 0, attempts: 0, passed: false },
  { n: 4, bestScore: 0, attempts: 0, passed: false },
];

function certStringsPresent(container: HTMLElement): string[] {
  const text = container.textContent ?? "";
  return ["Certification Prep", "Cert Prep", "cert prep"].filter((s) => text.includes(s));
}

describe("ExamLocked — kind-aware labels (B3)", () => {
  it("renders a course-completion series with no cert-prep strings", () => {
    const { container } = render(
      <ExamLocked
        series="ai-at-work"
        checks={CHECKS}
        seriesName="AI at Work"
        kind="course-completion"
        minutes={105}
      />,
    );

    expect(screen.getByText("Course Exam · locked")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Unlock: complete all 4 knowledge checks with 80%\+/,
    );
    expect(
      screen.getByText(/The timed course completion exam opens once every knowledge check/),
    ).toBeInTheDocument();
    expect(certStringsPresent(container)).toEqual([]);
  });

  it("renders a certification series with its existing wording", () => {
    const { container } = render(
      <ExamLocked
        series="omni-studio-cert"
        checks={CHECKS}
        seriesName="OmniStudio Developer Certification"
        kind="certification-prep"
        minutes={105}
      />,
    );

    expect(screen.getByText("Cert Prep Exam · locked")).toBeInTheDocument();
    expect(
      screen.getByText(/The timed cert prep exam opens once every knowledge check/),
    ).toBeInTheDocument();
    expect(certStringsPresent(container).length).toBeGreaterThan(0);
  });

  it("counts the real checks and minutes from props, not the old hardcoded 9/105", () => {
    render(
      <ExamLocked
        series="ai-at-work"
        checks={CHECKS}
        seriesName="AI at Work"
        kind="course-completion"
        minutes={90}
      />,
    );

    expect(screen.getByText(/Checks passed 1\/4/)).toBeInTheDocument();
    expect(screen.getByText(/90-minute run/)).toBeInTheDocument();
    expect(screen.queryByText(/all 9 knowledge checks/)).toBeNull();
    expect(screen.queryByText(/105-minute/)).toBeNull();
  });
});
