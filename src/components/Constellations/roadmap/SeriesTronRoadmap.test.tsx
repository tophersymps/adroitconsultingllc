import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeriesTronRoadmap } from "./SeriesTronRoadmap";
import type { ConstellationState } from "@/shared/contracts-constellations";

function mockConstellation(
  litCount: number,
  total = 8,
  examPassed = false,
): ConstellationState {
  return {
    courseId: "course-sf-arch",
    seriesSlug: "salesforce-architect",
    name: "Salesforce System Architect",
    gradient: "from-blue-600 to-indigo-900",
    totalStars: total,
    curriculumLessons: total,
    litStars: litCount,
    complete: litCount === total,
    examPassed,
    stars: Array.from({ length: total }, (_, i) => ({
      lessonSlug: `lesson-${i + 1}`,
      index: i + 1,
      label: `Topic ${i + 1}`,
      lit: i < litCount,
    })),
  };
}

describe("SeriesTronRoadmap", () => {
  it("renders course title and progress telemetry accurately", () => {
    const constellation = mockConstellation(4, 8);
    render(<SeriesTronRoadmap constellation={constellation} />);

    expect(screen.getByText("Salesforce System Architect")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();
  });

  it("correctly identifies mastered, active, and upcoming nodes", () => {
    const constellation = mockConstellation(2, 6);
    render(<SeriesTronRoadmap constellation={constellation} />);

    // Lesson 1 & 2 should be mastered
    const node1 = screen.getByTestId("tron-node-lesson-1");
    expect(node1.getAttribute("aria-label")).toContain("Mastered");
    expect(node1.getAttribute("href")).toBe("/atlas/salesforce-architect/lesson-1");

    // Lesson 3 should be active (first unlit)
    const node3 = screen.getByTestId("tron-node-lesson-3");
    expect(node3.getAttribute("aria-label")).toContain("Current active lesson");
    expect(screen.getByText("Active")).toBeDefined();

    // Lesson 4 should be upcoming
    const node4 = screen.getByTestId("tron-node-lesson-4");
    expect(node4.getAttribute("aria-label")).toContain("Upcoming lesson");
  });

  it("renders locked exam milestone when course is incomplete", () => {
    const constellation = mockConstellation(3, 8);
    render(<SeriesTronRoadmap constellation={constellation} />);

    expect(screen.getByText("Exam Locked (3/8 Lessons)")).toBeDefined();
  });

  it("unlocks exam launch button when all lessons are complete", () => {
    const constellation = mockConstellation(8, 8, false);
    render(<SeriesTronRoadmap constellation={constellation} />);

    const launchBtn = screen.getByText("Launch Exam →");
    expect(launchBtn).toBeDefined();
    expect(launchBtn.getAttribute("href")).toBe("/atlas/salesforce-architect/exam");
  });

  it("displays certified badge and link to certificate when exam is passed", () => {
    const constellation = mockConstellation(8, 8, true);
    render(<SeriesTronRoadmap constellation={constellation} />);

    expect(screen.getByText("Exam Certified")).toBeDefined();
    const certBtn = screen.getByText("View Credential & LinkedIn Pass →");
    expect(certBtn).toBeDefined();
    expect(certBtn.getAttribute("href")).toBe("/atlas/salesforce-architect/certificate");
  });
});
