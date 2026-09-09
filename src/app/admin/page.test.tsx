import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/hooks/useAdminAccessEffective", () => ({
  useAdminAccessEffective: vi.fn(),
}));
vi.mock("@/lib/hooks/useAdminAudit", () => ({
  useAdminAudit: vi.fn(() => ({ rows: [] })),
}));

import { useAdminAccessEffective } from "@/lib/hooks/useAdminAccessEffective";
import AdminOverviewPage from "./page";

const useHook = useAdminAccessEffective as unknown as ReturnType<typeof vi.fn>;

const course = (id: string, series_slug: string, access_model: string, status = "live", activeEntitlementCount = 0) => ({
  course: { id, series_slug, title: series_slug, status, access_model, price_cents: null, launched_at: null, created_at: "", updated_at: "" },
  activeEntitlementCount,
});

const user = (id: string, role = "member") => ({
  user_id: id,
  email: `${id}@adroit.io`,
  display_name: null,
  role,
  entitlements: {},
  subscription: null,
});

function data(over: Record<string, unknown> = {}) {
  return {
    courses: [course("c-gated", "gated", "granted"), course("c-free", "free-course", "free")],
    users: [user("u1"), user("u2")],
    matrix: {
      u1: { "c-gated": "granted", "c-free": "free" },
      u2: { "c-gated": "none", "c-free": "free" },
    },
    subscriberPulse: { active: 0, trialing: 0, canceled: 0, past_due: 0 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useHook.mockReset();
});

describe("/admin Access Overview (governance health)", () => {
  it("renders effective-access coverage with the honest five-state counts", () => {
    useHook.mockReturnValue({ data: data(), loading: false, error: null });
    render(<AdminOverviewPage />);
    expect(screen.getByText("Effective-access coverage")).toBeTruthy();
    // Coverage bar segments: granted(1) + none(1) + free(2) = 4 pairs.
    expect(screen.getByText(/4 user×course pairs resolved by the seam/)).toBeTruthy();
  });

  it("shows the '0 subscribers — billing on hold' honest empty state", () => {
    useHook.mockReturnValue({ data: data(), loading: false, error: null });
    render(<AdminOverviewPage />);
    expect(screen.getByText(/Subscribers · 0/)).toBeTruthy();
    expect(screen.getByText(/billing on hold/)).toBeTruthy();
  });

  it("shows the subscriber pulse with real counts when subs exist", () => {
    useHook.mockReturnValue({
      data: data({
        subscriberPulse: { active: 3, trialing: 1, canceled: 0, past_due: 0 },
      }),
      loading: false,
      error: null,
    });
    render(<AdminOverviewPage />);
    // The "billing on hold" empty state is replaced by live counts.
    expect(screen.queryByText(/billing on hold/)).toBeNull();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1); // active count
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1); // trialing count
    // The pulse header row renders.
    expect(screen.getByText("Trialing")).toBeTruthy();
  });

  it("shows the pending-needs-launch banner when a course awaits launch", () => {
    useHook.mockReturnValue({
      data: data({
        courses: [
          course("c-pend", "flow", "one-time", "pending"),
          course("c-free", "free-course", "free"),
        ],
      }),
      loading: false,
      error: null,
    });
    render(<AdminOverviewPage />);
    expect(screen.getByText(/is pending/)).toBeTruthy();
  });

  it("renders an access-gap callout when a course has a high none-ratio", () => {
    // 2 users, 1 live course, both none → 100% none ratio → gap callout.
    useHook.mockReturnValue({
      data: data({
        courses: [course("c-gated", "gated", "subscription")],
        matrix: { u1: { "c-gated": "none" }, u2: { "c-gated": "none" } },
      }),
      loading: false,
      error: null,
    });
    render(<AdminOverviewPage />);
    expect(screen.getByText(/Needs attention/)).toBeTruthy();
  });
});
