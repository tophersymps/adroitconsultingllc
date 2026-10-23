/**
 * Session cache × identity transitions — PERF-CACHE-M1 (t_c0eaa6f2).
 *
 * The session read is module state (`sessionPromise` in `useAuth`), shared by
 * every mounted hook. Before this fix `invalidateAuthSession()` had no
 * production caller and only flipped `sessionStale`, so the session promise
 * from account A survived a cross-account transition that announced itself
 * only through `notifyAuthChanged()` — the next mount rendered A's user until
 * a reload.
 *
 * These tests use ONLY the production entry point (`notifyAuthChanged()`, no
 * direct `invalidateAuthSession()` call) and mount the REAL hook:
 *   1. broadcast alone ⇒ the next mount issues a NEW `/api/auth/session` read
 *      and renders account B
 *   2. a session read in flight across the transition is discarded, and A's
 *      payload never lands after B's
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useAuth, notifyAuthChanged, invalidateAuthSession } from "./useAuth";

type Who = "A" | "B" | "guest";

const USERS: Record<Who, unknown> = {
  A: { id: "user-a", email: "a@example.com", isAdmin: false },
  B: { id: "user-b", email: "b@example.com", isAdmin: false },
  guest: null,
};

let who: Who = "A";
let sessionCalls = 0;

function Probe() {
  const { user, isLoading } = useAuth();
  return (
    <div data-testid="probe">
      <span data-testid="email">{user?.email ?? "guest"}</span>
      <span data-testid="loading">{isLoading ? "loading" : "ready"}</span>
    </div>
  );
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  who = "A";
  sessionCalls = 0;
  invalidateAuthSession();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    if (url === "/api/auth/session") sessionCalls += 1;
    return {
      ok: true,
      json: async () => ({ user: USERS[who] }),
    } as unknown as Response;
  }) as never;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("session cache × identity transitions (PERF-CACHE-M1 t_c0eaa6f2)", () => {
  it("notifyAuthChanged() alone drops the session cache (no direct invalidate)", async () => {
    const first = render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("email")).toHaveTextContent("a@example.com"));
    expect(sessionCalls).toBe(1);

    // Sign-out: the tab unmounts the shell, so no useAuth is mounted when the
    // broadcast fires — exactly the case where a stale module cache leaks.
    first.unmount();

    who = "guest";
    notifyAuthChanged();

    // Sign-in as B, then the hub mounts again.
    who = "B";
    notifyAuthChanged();

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("email")).toHaveTextContent("b@example.com"));
    expect(screen.getByTestId("email")).not.toHaveTextContent("a@example.com");
    // One read for A on mount, one for B's mount: the cache was really dropped.
    expect(sessionCalls).toBe(2);
  });

  it("discards a session read that was in flight when the identity changed", async () => {
    let release!: (payload: unknown) => void;
    let call = 0;
    globalThis.fetch = vi.fn(() => {
      call += 1;
      if (call === 1) {
        // A's read — never settles until we release it after the transition.
        return new Promise<Response>((resolve) => {
          release = (payload) =>
            resolve({ ok: true, json: async () => ({ user: payload }) } as unknown as Response);
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ user: USERS["B"] }),
      } as unknown as Response);
    }) as never;

    render(<Probe />);

    // Identity transitions to B while A's read is still open. Only the
    // production entry point is called.
    who = "B";
    await act(async () => {
      notifyAuthChanged();
    });

    await waitFor(() => expect(screen.getByTestId("email")).toHaveTextContent("b@example.com"));

    // A's payload finally lands — it must not overwrite B.
    await act(async () => {
      release(USERS["A"]);
    });

    expect(screen.getByTestId("email")).toHaveTextContent("b@example.com");
    expect(screen.getByTestId("email")).not.toHaveTextContent("a@example.com");
  });
});
