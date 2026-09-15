/**
 * page.test.ts — /reset-password server-side gate (t_13982e68, t_4fbc8f48).
 *
 * The page is now a SERVER component that:
 *   - renders the expired/invalid (role=alert) state for ANY visitor BEFORE
 *     the session gate (guests with a dead code must still see it),
 *   - redirects guests (no session) to /login?next=/reset-password WITHOUT
 *     ever rendering the new-password form (closes the SSR HTML leak),
 *   - renders <ResetPasswordForm /> only for an authed session.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mocks } = vi.hoisted(() => {
  const getUser = vi.fn();
  return { mocks: { getUser } };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    // next/navigation's redirect throws a special error to abort rendering.
    const e = new Error(`NEXT_REDIRECT:${path}`);
    (e as { digest?: string }).digest = `NEXT_REDIRECT:${path}`;
    throw e;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("./ResetPasswordForm", () => ({
  default: () => <div data-testid="reset-form" />,
}));

import ResetPasswordPage from "./page";
function pageSearchParams(error?: string) {
  return Promise.resolve(error ? { error } : {});
}

function authed(id = "user-1") {
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
}
function guest() {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
}

beforeEach(() => {
  vi.clearAllMocks();
  authed();
});

describe("/reset-password server gate (t_13982e68)", () => {
  it("renders the new-password form for an authed session", async () => {
    const el = await ResetPasswordPage({ searchParams: pageSearchParams() });
    render(el);
    expect(screen.getByTestId("reset-form")).toBeInTheDocument();
    expect(mocks.getUser).toHaveBeenCalled();
  });

  it("redirects a guest (no session) to login and never renders the form", async () => {
    guest();
    await expect(ResetPasswordPage({ searchParams: pageSearchParams() })).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=/reset-password",
    );
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });

  it("does NOT call the session check for a guest with error=expired", async () => {
    guest();
    const el = await ResetPasswordPage({ searchParams: pageSearchParams("expired") });
    render(el);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/This link has expired/)).toBeInTheDocument();
    expect(screen.getByText("Request a new link")).toBeInTheDocument();
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });

  it("shows the expired state to a guest with error=invalid", async () => {
    guest();
    const el = await ResetPasswordPage({ searchParams: pageSearchParams("invalid") });
    render(el);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });
});
