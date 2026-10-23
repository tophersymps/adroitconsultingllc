/**
 * page.test.ts — /reset-password server-side gate (t_13982e68, t_4fbc8f48),
 * ported to Managed Better Auth (R2-1).
 *
 * The page is a SERVER component that:
 *   - renders the error (role=alert) state for ANY visitor BEFORE any gate
 *     (Better Auth's `?error=INVALID_TOKEN`, the callback's expired/invalid),
 *   - renders <ResetPasswordForm token=… /> for an emailed token — imported
 *     legacy users are signed out and must still be able to reset,
 *   - renders <ResetPasswordForm /> for a session, and redirects a guest with
 *     no token to /login WITHOUT ever rendering the form (SSR HTML leak).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mocks } = vi.hoisted(() => {
  const getSessionUser = vi.fn();
  return { mocks: { getSessionUser } };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    const e = new Error(`NEXT_REDIRECT:${path}`);
    (e as { digest?: string }).digest = `NEXT_REDIRECT:${path}`;
    throw e;
  },
}));

vi.mock("@/lib/session", () => ({ getSessionUser: mocks.getSessionUser }));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("./ResetPasswordForm", () => ({
  default: ({ token }: { token?: string }) => (
    <div data-testid="reset-form" data-token={token ?? ""} />
  ),
}));

import ResetPasswordPage from "./page";

function params(input: Record<string, string> = {}) {
  return Promise.resolve(input);
}

function authed() {
  mocks.getSessionUser.mockResolvedValue({
    id: "user-1",
    email: "a@adroit.io",
    name: null,
  });
}
function guest() {
  mocks.getSessionUser.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  authed();
});

describe("/reset-password server gate (Neon Auth)", () => {
  it("renders the form for an authed session", async () => {
    const el = await ResetPasswordPage({ searchParams: params() });
    render(el);
    expect(screen.getByTestId("reset-form")).toBeInTheDocument();
    expect(mocks.getSessionUser).toHaveBeenCalled();
  });

  it("renders the form for a guest WITH a reset token and passes the token through", async () => {
    guest();
    const el = await ResetPasswordPage({ searchParams: params({ token: "tok-123" }) });
    render(el);
    expect(screen.getByTestId("reset-form")).toHaveAttribute("data-token", "tok-123");
    // The token is the credential; no session lookup is needed.
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
  });

  it("redirects a guest with no token to login and never renders the form", async () => {
    guest();
    await expect(ResetPasswordPage({ searchParams: params() })).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=/reset-password",
    );
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });

  it("does NOT call the session check for error=expired", async () => {
    guest();
    const el = await ResetPasswordPage({ searchParams: params({ error: "expired" }) });
    render(el);
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/This link has expired/)).toBeInTheDocument();
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });

  it("treats Better Auth's error=INVALID_TOKEN as an expired link", async () => {
    guest();
    const el = await ResetPasswordPage({ searchParams: params({ error: "INVALID_TOKEN" }) });
    render(el);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });
});
