import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const replaceMock = vi.fn();
let mockParams = new Map<string, string>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => ({
    get: (key: string) => mockParams.get(key) ?? null,
  }),
}));

vi.mock("@/lib/hooks/useAdminCourses", () => ({
  useAdminCourses: vi.fn(),
}));

vi.mock("@/lib/hooks/useAdminAccessEffective", () => ({
  useAdminAccessEffective: vi.fn(),
}));

import { useAdminCourses } from "@/lib/hooks/useAdminCourses";
import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import AdminCoursesPage from "./page";

const mockUseCourses = useAdminCourses as unknown as ReturnType<typeof vi.fn>;
const mockUseEffective = useAdminAccessEffective as unknown as ReturnType<typeof vi.fn>;

const dummyCourse = (
  id: string,
  series_slug: string,
  title: string,
  access_model = "granted",
  status = "live",
) => ({
  course: {
    id,
    series_slug,
    title,
    status,
    access_model,
    price_cents: 9900,
    launched_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    track: "AI",
    difficulty: "Advanced",
  },
  activeEntitlementCount: 3,
  publishedLessonCount: 5,
  totalLessonCount: 5,
});

const dummyUser = (id: string) => ({
  user_id: id,
  email: `${id}@adroit.io`,
  display_name: null,
  role: "member",
  entitlements: { "c-1": "granted" },
  subscription: null,
  created_at: "2026-01-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  mockParams = new Map();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, data: [] }),
  });

  mockUseCourses.mockReturnValue({
    rows: [
      dummyCourse("c-1", "agentic-ai", "Agentic AI"),
      dummyCourse("c-2", "salesforce-arch", "Salesforce Architect", "one-time", "pending"),
    ],
    unprovisionedSeries: [
      {
        slug: "unprovisioned-test",
        name: "Unprovisioned Series",
        description: "Test description",
        publishedLessonCount: 3,
        totalLessonCount: 3,
      },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
    provisionSeries: vi.fn().mockResolvedValue({ ok: true }),
  });

  mockUseEffective.mockReturnValue({
    data: {
      courses: [
        dummyCourse("c-1", "agentic-ai", "Agentic AI"),
        dummyCourse("c-2", "salesforce-arch", "Salesforce Architect"),
      ],
      users: [dummyUser("u-1"), dummyUser("u-2")],
      matrix: {
        "u-1": { "c-1": "granted", "c-2": "none" },
        "u-2": { "c-1": "none", "c-2": "one-time" },
      },
      subscriberPulse: { active: 0, trialing: 0, canceled: 0, past_due: 0 },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
});

describe("/admin/courses Unified Course Administration Hub", () => {
  it("renders page title and 4 sub-tabs", () => {
    render(<AdminCoursesPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Courses" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Catalog & Pricing/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Student Rosters & Access/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sections & Libraries/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Access Matrix/i })).toBeInTheDocument();
  });

  it("renders Catalog & Pricing cards view by default and toggles to table", () => {
    render(<AdminCoursesPage />);
    expect(screen.getByText("Agentic AI")).toBeInTheDocument();
    expect(screen.getByText("Salesforce Architect")).toBeInTheDocument();
    expect(screen.getByText("Unprovisioned Content Series on Disk (1)")).toBeInTheDocument();

    const tableBtn = screen.getByRole("button", { name: /Table/i });
    fireEvent.click(tableBtn);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("filters courses based on search query", () => {
    render(<AdminCoursesPage />);
    const searchInput = screen.getByLabelText(/Search courses/i);
    fireEvent.change(searchInput, { target: { value: "Agentic" } });

    expect(screen.getByText("Agentic AI")).toBeInTheDocument();
    expect(screen.queryByText("Salesforce Architect")).not.toBeInTheDocument();
  });

  it("switches to Student Rosters & Access tab and renders RosterPanel", () => {
    mockParams.set("tab", "roster");
    render(<AdminCoursesPage />);
    expect(screen.getAllByText("u-1@adroit.io").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("u-2@adroit.io").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /bulk grant/i })).toBeInTheDocument();
  });

  it("switches to Access Matrix tab and renders 2D AccessGrid", () => {
    mockParams.set("tab", "matrix");
    render(<AdminCoursesPage />);
    expect(screen.getByText(/Cross-Product Matrix Grid/i)).toBeInTheDocument();
    expect(screen.getByText(/2 learners × 2 courses/i)).toBeInTheDocument();
  });

  it("switches to Sections & Libraries tab", async () => {
    mockParams.set("tab", "sections");
    render(<AdminCoursesPage />);
    expect(screen.getByText(/Curriculum Structure & Organization/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Manage Sections & Groups/i })).toBeInTheDocument();
  });
});
