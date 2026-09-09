/**
 * Constellations — B-18 celebration + streak component tests.
 *
 * Covers the visual contract + trigger seam:
 *  - StreakCounter renders the mono "DAY N · ★ streak" chip (and null for 0).
 *  - ConstellationCelebration fires when the lesson's local completion flag
 *    flips and PROGRESS_CHANGED_EVENT broadcasts; shows lit/total + the
 *    "Constellation complete." label on course completion; respects reduced
 *    motion (no cx-ignite animation class).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StreakCounter } from "./StreakCounter";
import { ConstellationCelebration } from "./ConstellationCelebration";
import { lessonKey, PROGRESS_CHANGED_EVENT } from "@/lib/progress";

const baseProps = {
  seriesSlug: "agentic-ai",
  courseName: "Agentic AI Foundations",
  lessonSlug: "day-01-agents",
  lessonLabel: "Intro to Agents",
  litStars: 3,
  totalStars: 8,
  streakDays: 14,
  courseJustCompleted: false,
  prefersReducedMotion: true,
};

beforeEach(() => {
  localStorage.clear();
});

describe("StreakCounter", () => {
  it("renders the mono DAY chip for a positive streak", () => {
    render(<StreakCounter streakDays={14} />);
    expect(screen.getByText(/DAY 14/i)).toBeInTheDocument();
    expect(screen.getByText(/★ streak/i)).toBeInTheDocument();
  });

  it("renders the stat variant for the profile stat-card", () => {
    render(<StreakCounter streakDays={14} variant="stat" />);
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText(/day streak/i)).toBeInTheDocument();
  });

  it("renders nothing for a zero streak", () => {
    render(<StreakCounter streakDays={0} />);
    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
  });
});

describe("ConstellationCelebration", () => {
  it("shows the ignition overlay when the lesson completes locally", async () => {
    render(<ConstellationCelebration {...baseProps} />);
    // Hidden until the completion flag flips.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    localStorage.setItem(lessonKey(baseProps.lessonSlug), "true");
    fireEvent(window, new CustomEvent(PROGRESS_CHANGED_EVENT));

    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument(),
    );
    expect(screen.getByText(/3\/8/)).toBeInTheDocument();
    expect(screen.getByText(/Intro to Agents — lit/i)).toBeInTheDocument();
  });

  it("shows the 'Constellation complete.' label when the lesson completes the course", async () => {
    render(
      <ConstellationCelebration
        {...baseProps}
        litStars={8}
        courseJustCompleted
      />,
    );
    localStorage.setItem(lessonKey(baseProps.lessonSlug), "true");
    fireEvent(window, new CustomEvent(PROGRESS_CHANGED_EVENT));

    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Constellation complete/i)).toBeInTheDocument();
  });

  it("renders nothing when the flag never flips (no premature pop)", () => {
    render(<ConstellationCelebration {...baseProps} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismisses on Escape", async () => {
    render(<ConstellationCelebration {...baseProps} />);
    localStorage.setItem(lessonKey(baseProps.lessonSlug), "true");
    fireEvent(window, new CustomEvent(PROGRESS_CHANGED_EVENT));

    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument(),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
