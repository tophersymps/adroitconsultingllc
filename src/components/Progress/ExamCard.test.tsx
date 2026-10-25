/**
 * ExamCard — kind-aware naming (Learn UX exam naming, card B3).
 *
 * A Tracks series must never say "Certification Prep" / "Cert Prep" (US-009),
 * a certification series keeps its wording character for character (US-010),
 * and every count / pass mark / duration comes from props (B3 "Done means").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ExamCard from "./ExamCard";

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

const BASE_PROPS = {
  series: "ai-at-work",
  totalChecks: 4,
  questionCount: 40,
  passPct: 72,
  minutes: 105,
};

function certStringsPresent(container: HTMLElement): string[] {
  const text = container.textContent ?? "";
  return ["Certification Prep", "Cert Prep", "cert prep"].filter((s) => text.includes(s));
}

describe("ExamCard — kind-aware labels (B3)", () => {
  beforeEach(() => {
    // The tiers fetch is the only network call; failing it leaves the card in
    // its server-render locked state (also the degraded R2-5 shape, US-012).
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("tiers unavailable")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a course-completion series with no cert-prep strings", () => {
    const { container } = render(<ExamCard {...BASE_PROPS} kind="course-completion" />);

    expect(screen.getByText("Course Exam")).toBeInTheDocument();
    expect(screen.getByText("Course Completion Exam")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Course Completion Exam card" })).toBeInTheDocument();
    expect(certStringsPresent(container)).toEqual([]);
  });

  it("renders a certification series with its existing wording", () => {
    const { container } = render(<ExamCard {...BASE_PROPS} kind="certification-prep" />);

    expect(screen.getByText("Cert Prep Exam")).toBeInTheDocument();
    expect(screen.getByText("Certification Prep Exam")).toBeInTheDocument();
    expect(certStringsPresent(container).sort()).toEqual(
      ["Cert Prep", "Certification Prep"].sort(),
    );
  });

  it("takes questions, minutes and pass mark from props (no hardcoded 60/105/72)", () => {
    render(
      <ExamCard
        {...BASE_PROPS}
        kind="course-completion"
        questionCount={40}
        minutes={90}
        passPct={65}
      />,
    );

    expect(screen.getByText(/40 questions · 90 minutes · pass ≥ 65%/)).toBeInTheDocument();
    expect(screen.queryByText(/60 questions/)).toBeNull();
    expect(screen.queryByText(/105 minutes/)).toBeNull();
    expect(screen.queryByText(/pass ≥ 72%/)).toBeNull();
  });

  it("uses the real check count from props", () => {
    render(<ExamCard {...BASE_PROPS} kind="course-completion" totalChecks={4} />);

    expect(screen.getByText(/0\/4/)).toBeInTheDocument();
    expect(screen.queryByText(/0\/9/)).toBeNull();
  });
});
