import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SyllabusProgressRail, { RailCheckpoint } from "./SyllabusProgressRail";

const CHECKPOINTS: RailCheckpoint[] = [
  { n: 1, lessons: [1, 5], state: "passed", score: 92, current: false },
  { n: 2, lessons: [6, 10], state: "available", current: true },
  { n: 3, lessons: [11, 15], state: "available", current: false },
];

describe("SyllabusProgressRail", () => {
  it("renders lesson count and percentage gauge", () => {
    render(
      <SyllabusProgressRail
        completed={7}
        total={10}
        checkpoints={CHECKPOINTS}
        examLabel="Cert Prep Exam"
        onJump={vi.fn()}
      />
    );

    expect(screen.getByTestId("rail-lesson-count")).toHaveTextContent("7 of 10 lessons");
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("renders checkpoint buttons and fires onJump when clicked", () => {
    const onJump = vi.fn();
    render(
      <SyllabusProgressRail
        completed={7}
        total={10}
        checkpoints={CHECKPOINTS}
        examLabel="Cert Prep Exam"
        onJump={onJump}
      />
    );

    const check1 = screen.getByRole("button", { name: /K1/i });
    expect(check1).toBeInTheDocument();
    expect(check1).toHaveTextContent("92%");

    fireEvent.click(check1);
    expect(onJump).toHaveBeenCalledWith("check-node-1");

    const check2 = screen.getByRole("button", { name: /K2/i });
    expect(check2).toHaveTextContent("You're here");
  });

  it("renders exam readiness progressbar", () => {
    render(
      <SyllabusProgressRail
        completed={5}
        total={15}
        checkpoints={CHECKPOINTS}
        examLabel="Course Exam"
        onJump={vi.fn()}
      />
    );

    const progressbar = screen.getByRole("progressbar", { name: "Course Exam readiness" });
    expect(progressbar).toBeInTheDocument();
    // 1 of 3 checks passed = 33%
    expect(progressbar).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByTestId("rail-exam-readiness")).toHaveTextContent("1 of 3 checks passed");
  });
});
