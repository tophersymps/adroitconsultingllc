import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccessGrid } from "./AccessGrid";
import type { AdminCourseListRow, AdminUserListRow } from "@/shared/contracts-course-catalog";

vi.mock("@/components/Catalog/AccessModelChip", () => ({
  AccessModelChip: () => <span data-testid="model-chip" />,
}));

const course = (id: string, series_slug: string, access_model: string, status = "live"): AdminCourseListRow =>
  ({
    course: { id, series_slug, title: series_slug, status, access_model, price_cents: null, launched_at: null, created_at: "", updated_at: "" },
    activeEntitlementCount: 0,
  }) as AdminCourseListRow;

const user = (id: string, email: string, entitlements: Record<string, string> = {}): AdminUserListRow =>
  ({
    user_id: id,
    email,
    display_name: null,
    role: "member",
    entitlements,
    subscription: null,
  }) as AdminUserListRow;

describe("AccessGrid (ADR-220/222)", () => {
  it("renders five-state single-letter cells for every user × live course", () => {
    render(
      <AccessGrid
        users={[user("u1", "a@adroit.io")]}
        courses={[course("c1", "granted", "granted"), course("c2", "free-course", "free")]}
        matrix={{
          u1: { c1: "granted", c2: "free" },
        }}
      />,
    );
    // cell text: G for granted, F for free.
    expect(screen.getByRole("button", { name: /granted/ })).toHaveTextContent("G");
    expect(screen.getByRole("button", { name: /free-course/ })).toHaveTextContent("F");
  });

  it("defaults missing cells to none (—), never blank", () => {
    render(
      <AccessGrid
        users={[user("u1", "a@adroit.io")]}
        courses={[course("c1", "gated", "subscription")]}
        matrix={{ u1: {} }}
      />,
    );
    expect(screen.getByRole("button", { name: /gated/ })).toHaveTextContent("—");
  });

  it("excludes non-live courses from the grid columns", () => {
    render(
      <AccessGrid
        users={[user("u1", "a@adroit.io")]}
        courses={[course("c1", "live-x", "free"), course("c2", "pending", "free", "pending")]}
        matrix={{ u1: { c1: "free", c2: "none" } }}
      />,
    );
    // Only the live course column renders.
    expect(screen.getByRole("button", { name: /live-x/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /pending/ })).toBeNull();
  });

  it("cell click opens the action popover and calls the grant handler", () => {
    const onGrant = vi.fn();
    render(
      <AccessGrid
        users={[user("u1", "a@adroit.io")]}
        courses={[course("c1", "gated", "subscription")]}
        matrix={{ u1: { c1: "none" } }}
        onGrant={onGrant}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /gated/ }));
    fireEvent.click(screen.getByRole("button", { name: /grant granted/i }));
    expect(onGrant).toHaveBeenCalledWith("u1", "c1");
  });

  it("bulk checkbox header drives row selection", () => {
    render(
      <AccessGrid
        users={[user("u1", "a@adroit.io"), user("u2", "b@adroit.io")]}
        courses={[course("c1", "gated", "granted")]}
        matrix={{ u1: { c1: "granted" }, u2: { c1: "none" } }}
      />,
    );
    const header = screen.getByRole("checkbox", { name: /select all/i });
    expect(header).not.toBeChecked();
    fireEvent.click(header);
    expect(header).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /a@adroit/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /b@adroit/ })).toBeChecked();
  });

  it("renders accessibility roles + labels", () => {
    render(
      <AccessGrid
        users={[user("u1", "a@adroit.io")]}
        courses={[course("c1", "gated", "granted")]}
        matrix={{ u1: { c1: "granted" } }}
      />,
    );
    expect(screen.getByRole("table")).toHaveAttribute("aria-label", "Effective access grid");
    expect(screen.getByRole("checkbox", { name: /select all/i })).toBeTruthy();
  });
});
