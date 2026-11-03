import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const replaceMock = vi.fn();
let mockCourseParam: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === "course" ? mockCourseParam : null),
  }),
}));

import AdminAccessCoursesPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockCourseParam = null;
});

describe("/admin/access/courses redirect to unified Courses Hub", () => {
  it("redirects to /admin/courses?tab=roster without course param", () => {
    mockCourseParam = null;
    render(<AdminAccessCoursesPage />);
    expect(screen.getByText(/Redirecting to Courses Hub/i)).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/admin/courses?tab=roster");
  });

  it("preserves the course query param when redirecting", () => {
    mockCourseParam = "agentic-ai";
    render(<AdminAccessCoursesPage />);
    expect(replaceMock).toHaveBeenCalledWith("/admin/courses?tab=roster&course=agentic-ai");
  });
});
