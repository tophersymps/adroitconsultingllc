/**
 * ExamWidget — a11y regression tests for lara's audit (t_5664453e).
 *
 * Covers:
 *  - finding 1: results view exposes a heading and focus moves to it on
 *    submit (WCAG 2.4.3) — the sr-only "Exam results" h2 receives focus.
 *  - finding 2: countdown has role="timer"; threshold announcements
 *    (10/5/1 min) land in a polite live region (role=status), once each.
 *  - finding 5: radiogroup arrow-key roving — ArrowDown/Up move selection
 *    and focus between options (WAI-ARIA radiogroup pattern).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ExamWidget from "./ExamWidget";
import type { QuizQuestion } from "@/shared/contracts";

const QUESTIONS: QuizQuestion[] = [
  {
    question: "What is the answer to everything?",
    options: ["40", "41", "42", "43"],
    correct_answer_index: 2,
  },
  {
    question: "Which color is the sky?",
    options: ["Red", "Green", "Blue", "Yellow"],
    correct_answer_index: 2,
  },
];

const PROPS = {
  quizName: "test-exam",
  questions: QUESTIONS,
  seriesSlug: "test-series",
  seriesName: "Test Series",
};

function mockSubmitResponse() {
  return {
    ok: true,
    json: async () => ({
      score: 75,
      correct: 1,
      total: 2,
      passed: true,
      results: [
        { questionIndex: 0, isCorrect: true, correctAnswerIndex: 2 },
        { questionIndex: 1, isCorrect: false, correctAnswerIndex: 2 },
      ],
    }),
  };
}

describe("ExamWidget a11y (t_5664453e)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockSubmitResponse()),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("exposes the countdown with role=timer", () => {
    render(<ExamWidget {...PROPS} />);
    expect(screen.getByRole("timer")).toBeInTheDocument();
  });

  it("announces time thresholds in a polite live region (10/5/1 min)", () => {
    vi.useFakeTimers();
    render(<ExamWidget {...PROPS} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.textContent).toBe("");

    // 105:00 total; after 95 min → 10 min remaining → announce once.
    act(() => {
      vi.advanceTimersByTime(95 * 60 * 1000);
    });
    expect(status.textContent).toBe("10 minutes remaining");

    // 5 min remaining.
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(status.textContent).toBe("5 minutes remaining");

    // 1 min remaining.
    act(() => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });
    expect(status.textContent).toBe("1 minute remaining");
  });

  it("announces auto-submit at 00:00 and moves focus to the results heading", async () => {
    vi.useFakeTimers();
    render(<ExamWidget {...PROPS} />);

    // Advance the full 105 minutes → auto-submit fires (mocked fetch).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(105 * 60 * 1000);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const heading = screen.getByRole("heading", { name: "Exam results" });
    expect(heading).toBeInTheDocument();
    expect(document.activeElement).toBe(heading);
  });

  it("moves focus to the results heading on manual submit", async () => {
    render(<ExamWidget {...PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: /Next question/ }));
    fireEvent.click(screen.getByRole("button", { name: /Submit exam/ }));

    await waitFor(() => {
      const heading = screen.getByRole("heading", { name: "Exam results" });
      expect(heading).toBeInTheDocument();
      expect(document.activeElement).toBe(heading);
    });
  });

  it("supports arrow-key roving in the radiogroup (WAI-ARIA pattern)", () => {
    render(<ExamWidget {...PROPS} />);
    const group = screen.getByRole("radiogroup", { name: "Answer options" });

    // ArrowDown from no selection selects + focuses the first option.
    fireEvent.keyDown(group, { key: "ArrowDown" });
    const first = screen.getByRole("radio", { name: "40" });
    expect(first).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(first);

    // ArrowDown → second option selected + focused.
    fireEvent.keyDown(group, { key: "ArrowDown" });
    const second = screen.getByRole("radio", { name: "41" });
    expect(second).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(second);

    // ArrowUp → back to first.
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(first).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(first);

    // ArrowLeft/Right work too (wrap-around at the edges).
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    const last = screen.getByRole("radio", { name: "43" });
    expect(last).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(last);
  });

  it("keeps the question-count progress bar on-screen on a phone (min-w-0 shrink, 6px floor only sm+)", () => {
    render(<ExamWidget {...PROPS} />);
    const bar = screen.getByRole("img", { name: "0 of 2 answered" });
    const segments = Array.from(bar.querySelectorAll("div"));
    expect(segments.length).toBe(2);
    for (const seg of segments) {
      // Mobile-first: 60 segments at a forced 6px min + 2.5px gaps overflow
      // ~342px of phone content — allow shrink below sm, keep the 6px floor
      // only at sm+ (matches QuizWidget's always-shrinkable bar).
      expect(seg.className).toContain("min-w-0");
      expect(seg.className).toContain("sm:min-w-[6px]");
    }
  });
});
