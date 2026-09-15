import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/hooks/useAdminAccessEffective", () => ({
  useAdminAccessEffective: vi.fn(),
}));
vi.mock("@/lib/hooks/useAdminUsers", () => ({
  useAdminUsers: vi.fn(() => ({
    rows: null,
    loading: false,
    error: null,
    query: "",
    setQuery: () => {},
    setRole: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
    adjustSource: vi.fn(),
  })),
}));

import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import AdminUsersPage from "./page";

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

describe("/admin/users Access · People lens", () => {
  it("renders the person roster and detail panel", () => {
    useHook.mockReturnValue({ data: data(), loading: false, error: null });
    render(<AdminUsersPage />);
    // Page heading + roster header both say "People".
    expect(screen.getAllByText("People").length).toBeGreaterThanOrEqual(1);
    // Roster shows both users; detail panel defaults to the first person.
    expect(screen.getAllByText("u1@adroit.io").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("u2@adroit.io").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Course access")).toBeTruthy();
    // Honest subscription empty state (billing on hold).
    expect(screen.getByText(/No active subscription/)).toBeTruthy();
    expect(screen.getByText(/Coming with billing/)).toBeTruthy();
  });

  it("shows five-state chips per course in the detail panel", () => {
    useHook.mockReturnValue({ data: data(), loading: false, error: null });
    render(<AdminUsersPage />);
    // u1's granted course → "Granted" chip; u1's free course → "Free" chip.
    expect(screen.getByText("Granted")).toBeTruthy();
    expect(screen.getAllByText("Free").length).toBeGreaterThanOrEqual(1);
  });

  it("calls role assignment on the detail select change", async () => {
    useHook.mockReturnValue({ data: data(), loading: false, error: null });
    render(<AdminUsersPage />);
    const select = screen.getByRole("combobox", { name: /role for u1@adroit/i });
    fireEvent.change(select, { target: { value: "admin" } });
    await waitFor(() => {
      // The toast reflects a failed role update (mock setRole is inert).
      expect(screen.getByText("Role update failed")).toBeTruthy();
    });
  });

  it("shows a loading state before data arrives", () => {
    useHook.mockReturnValue({ data: null, loading: true, error: null });
    render(<AdminUsersPage />);
    expect(screen.getByText("Loading people…")).toBeTruthy();
  });
});
