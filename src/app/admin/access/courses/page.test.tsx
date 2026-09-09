import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/hooks/useAdminAccessEffective", () => ({
  useAdminAccessEffective: vi.fn(),
}));

import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import AdminAccessCoursesPage from "./page";

const useHook = useAdminAccessEffective as unknown as ReturnType<typeof vi.fn>;

const course = (id: string, series_slug: string, access_model: string, status = "live") => ({
  course: { id, series_slug, title: series_slug, status, access_model, price_cents: null, launched_at: null, created_at: "", updated_at: "" },
  activeEntitlementCount: 0,
});

const user = (id: string, over: Record<string, unknown> = {}) => ({
  user_id: id,
  email: `${id}@adroit.io`,
  display_name: null,
  role: "member",
  entitlements: {},
  subscription: null,
  ...over,
});

const data = () => ({
  courses: [course("c-gated", "gated", "granted"), course("c-free", "free-course", "free")],
  users: [user("u1"), user("u2")],
  matrix: {
    u1: { "c-gated": "granted", "c-free": "free" },
    u2: { "c-gated": "none", "c-free": "free" },
  },
  subscriberPulse: { active: 0, trialing: 0, canceled: 0, past_due: 0 },
});

beforeEach(() => {
  vi.clearAllMocks();
  useHook.mockReset();
  global.fetch = vi.fn();
});

describe("/admin/access/courses Access · Courses lens", () => {
  it("renders the course-first roster from the effective endpoint", () => {
    useHook.mockReturnValue({ data: data(), loading: false, error: null });
    render(<AdminAccessCoursesPage />);
    expect(screen.getAllByText("Courses").length).toBeGreaterThanOrEqual(1);
    // Roster shows both people with their effective-access chips.
    expect(screen.getAllByText("u1@adroit.io").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("u2@adroit.io").length).toBeGreaterThanOrEqual(1);
    // Access grid renders.
    expect(screen.getByText("Access grid")).toBeTruthy();
  });

  it("calls /entitlements/bulk (POST) for a bulk grant of selected users", async () => {
    useHook.mockReturnValue({ data: data(), loading: false, error: null });
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true });

    render(<AdminAccessCoursesPage />);
    // Select both users via the roster "select all people" checkbox.
    const selectAll = screen.getAllByRole("checkbox", { name: /select all/i })[0];
    fireEvent.click(selectAll);
    // Find and click "Bulk grant".
    const grantBtn = screen.getByRole("button", { name: /bulk grant/i });
    expect(grantBtn).toBeEnabled();
    fireEvent.click(grantBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/entitlements/bulk",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("c-gated"),
        }),
      );
    });
  });

  it("disables bulk actions when nothing is selected", () => {
    useHook.mockReturnValue({ data: data(), loading: false, error: null });
    render(<AdminAccessCoursesPage />);
    expect(screen.getByRole("button", { name: /bulk grant/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /bulk revoke/i })).toBeDisabled();
  });

  it("renders an empty state when there are no users", () => {
    useHook.mockReturnValue({
      data: { ...data(), users: [] },
      loading: false,
      error: null,
    });
    render(<AdminAccessCoursesPage />);
    expect(screen.getByText("No people found.")).toBeTruthy();
  });
});
