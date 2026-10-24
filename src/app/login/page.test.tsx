/**
 * page.test.tsx — /login double-submit guard (t_9690dda0).
 *
 * The page shows "Working…" via `isPending`, but React only re-renders on the
 * next tick: a second submit in the same tick (double click, Enter+click, an
 * automated retry) used to fire a SECOND `POST /api/auth/login`. For signup
 * that second call is a second verification email against the Resend quota.
 * The synchronous `inFlight` ref makes the second submit a no-op.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mocks } = vi.hoisted(() => ({
  mocks: { push: vi.fn(), refresh: vi.fn(), notifyAuthChanged: vi.fn(), invalidateDbToken: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/lib/hooks/useAuth", () => ({
  notifyAuthChanged: mocks.notifyAuthChanged,
}));
vi.mock("@/lib/db/token-cache", () => ({
  invalidateDbToken: mocks.invalidateDbToken,
}));

import LoginForm from "./page";

function fillAndSubmit(email: string) {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret1" } });
  fireEvent.submit(document.querySelector("form")!);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: "ok" }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/login — one POST per submit (t_9690dda0)", () => {
  it("fires a single login request for a normal submit", async () => {
    render(<LoginForm />);

    fillAndSubmit("reader@example.com");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/login");
  });

  it("swallows a second submit that lands before the first resolves", async () => {
    // Hold the first request open so both submits land in the same tick.
    let release: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => {
      release = resolve;
    }));
    render(<LoginForm />);

    fillAndSubmit("reader@example.com");
    fillAndSubmit("reader@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);

    release({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  });

  it("accepts a new submit once the previous one finished", async () => {
    render(<LoginForm />);

    fillAndSubmit("reader@example.com");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.push).toHaveBeenCalled());

    fillAndSubmit("reader@example.com");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
