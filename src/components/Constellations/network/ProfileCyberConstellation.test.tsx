import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ProfileCyberConstellation } from "./ProfileCyberConstellation";
import type { ConstellationState } from "@/shared/contracts-constellations";

function mockCourse(
  seriesSlug: string,
  name: string,
  lit: number,
  total: number,
): ConstellationState {
  return {
    courseId: `c-${seriesSlug}`,
    seriesSlug,
    name,
    gradient: "from-blue-600 to-indigo-900",
    totalStars: total,
    curriculumLessons: total,
    litStars: lit,
    complete: lit === total,
    stars: Array.from({ length: total }, (_, i) => ({
      lessonSlug: `${seriesSlug}-l${i + 1}`,
      index: i + 1,
      label: `Lesson ${i + 1}`,
      lit: i < lit,
    })),
  };
}

describe("ProfileCyberConstellation", () => {
  it("renders multiple course nexus hubs and handles course selection", () => {
    const courses = [
      mockCourse("sf-arch", "Salesforce Architect", 8, 8),
      mockCourse("omni-dev", "OmniStudio Developer", 4, 10),
      mockCourse("agentic-ai", "Agentic AI", 0, 6),
    ];

    render(<ProfileCyberConstellation constellations={courses} />);

    // Check that hubs are present
    expect(screen.getByTestId("cyber-hub-sf-arch")).toBeDefined();
    expect(screen.getByTestId("cyber-hub-omni-dev")).toBeDefined();
    expect(screen.getByTestId("cyber-hub-agentic-ai")).toBeDefined();

    // Default inspection shows first course in the panel
    const inspectPanel = screen.getByTestId("cyber-inspect-panel");
    expect(within(inspectPanel).getByText("Salesforce Architect")).toBeDefined();

    // Click second course hub to inspect it
    fireEvent.click(screen.getByTestId("cyber-hub-omni-dev"));
    expect(within(inspectPanel).getByText("OmniStudio Developer")).toBeDefined();
    expect(within(inspectPanel).getByText(/4 of 10 lessons completed/i)).toBeDefined();
  });
});
