/**
 * page.test.ts — /reset-password server gate (t_13982e68, t_4fbc8f48,
 * t_233b6f61).
 *
 * The page is a SERVER component that:
 *   - renders <ResetPasswordForm token=… /> for an emailed token — imported
 *     legacy users are signed out and must still be able to reset,
 *   - renders the "expired" state (role=alert) for an upstream error
 *     (Better Auth's `?error=INVALID_TOKEN`, the callback's expired/invalid),
 *   - renders the "missing" state (role=alert) when there is NO token — the
 *     update route redeems a token and 401s without one, so the form is never
 *     rendered into the SSR HTML where it could only fail,
 *   - never reads the session: there is no session-based reset path any more.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("./ResetPasswordForm", () => ({
  default: ({ token }: { token: string }) => (
    <div data-testid="reset-form" data-token={token} />
  ),
}));

import ResetPasswordPage from "./page";

function params(input: Record<string, string> = {}) {
  return Promise.resolve(input);
}

describe("/reset-password server gate (Neon Auth)", () => {
  it("renders the form for a guest WITH a reset token and passes the token through", async () => {
    const el = await ResetPasswordPage({ searchParams: params({ token: "tok-123" }) });
    render(el);
    expect(screen.getByTestId("reset-form")).toHaveAttribute("data-token", "tok-123");
  });

  it("shows the explicit 'needs your reset link' state when there is no token", async () => {
    const el = await ResetPasswordPage({ searchParams: params() });
    render(el);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/This page needs your reset link/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Request a new link/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });

  it("does NOT render the form for error=expired", async () => {
    const el = await ResetPasswordPage({ searchParams: params({ error: "expired" }) });
    render(el);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/This link has expired/)).toBeInTheDocument();
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });

  it("treats Better Auth's error=INVALID_TOKEN as an expired link", async () => {
    const el = await ResetPasswordPage({ searchParams: params({ error: "INVALID_TOKEN" }) });
    render(el);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });

  it("prefers the error state over a token in the same URL", async () => {
    const el = await ResetPasswordPage({
      searchParams: params({ error: "INVALID_TOKEN", token: "tok-123" }),
    });
    render(el);
    expect(screen.getByText(/This link has expired/)).toBeInTheDocument();
    expect(screen.queryByTestId("reset-form")).not.toBeInTheDocument();
  });
});
