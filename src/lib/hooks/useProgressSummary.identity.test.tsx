/**
 * Progress-summary cache × identity transitions — PERF-P1 (t_e786efe2).
 *
 * The shared `/api/progress/summary` cache (PERF t_22e18719) is module state
 * keyed by nothing, so it outlives a sign-out. Before this fix, user A could
 * sign out and user B sign in in the SAME tab and still see A's progress bars
 * and quiz stats until a full reload (sato's PR #358 probe: user B's remount
 * issued only `/api/atlas/cards`; the summary was never refetched).
 *
 * These tests mount the REAL hooks (no hook mocks) and simulate the real
 * identity seams (`invalidateProgressSummary()` + `notifyAuthChanged()`, as
 * Header sign-out / login success / password reset do):
 *   1. A → sign out → B in one tab (hub unmounted in between) ⇒ refetch, B's stats
 *   2. mounted cards update in place on the auth-changed broadcast, and the
 *      whole fan-out still collapses into ONE request
 *   3. a read that is in flight when the identity changes is discarded
 *   4. the three identity seams keep calling the invalidator (source lock)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  invalidateProgressSummary,
  readProgressSummary,
  useProgressSummary,
  useSessionQuizStats,
} from "./useProgressSummary";
import { notifyAuthChanged, useAuth } from "./useAuth";

type Who = "A" | "B" | "guest";

const PAYLOADS: Record<Who, unknown> = {
  A: {
    readContent: { blog: [], lesson: [] },
    completedLessons: ["series-1-1"],
    quizStats: { "series-1": { bestScore: 82, attempts: 3 } },
  },
  B: {
    readContent: { blog: [], lesson: [] },
    completedLessons: ["series-2-1"],
    quizStats: { "series-1": { bestScore: 41, attempts: 1 } },
  },
  guest: { readContent: { blog: [], lesson: [] }, completedLessons: [], quizStats: {} },
};

const SESSIONS: Record<Who, { id: string; email: string; isAdmin: boolean } | null> = {
  A: { id: "user-a", email: "a@example.com", isAdmin: false },
  B: { id: "user-b", email: "b@example.com", isAdmin: false },
  guest: null,
};

let who: Who = "A";
let summaryCalls = 0;
let sessionCalls = 0;

/** One card's worth of hooks: progress bars + quiz strip. */
function Card() {
  const { merge } = useProgressSummary([], []);
  const stats = useSessionQuizStats("series-1", true);
  return (
    <div data-testid="card">
      <span data-testid="lessons">{[...merge.lessons].sort().join(",")}</span>
      <span data-testid="best">{stats ? `${stats.bestScore}/${stats.attempts}` : "none"}</span>
    </div>
  );
}

/** A card plus its own useAuth instance (the /atlas hub shape). */
function AuthCard() {
  const { user, isLoading } = useAuth();
  const { merge } = useProgressSummary([], []);
  const stats = useSessionQuizStats("series-1", true);
  return (
    <div data-testid="card">
      <span data-testid="email">{isLoading ? "loading" : (user?.email ?? "guest")}</span>
      <span data-testid="lessons">{[...merge.lessons].sort().join(",")}</span>
      <span data-testid="best">{stats ? `${stats.bestScore}/${stats.attempts}` : "none"}</span>
    </div>
  );
}

/** The /atlas hub shape: N cards, each with both hooks mounted. */
function Hub({ cards = 3 }: { cards?: number }) {
  return (
    <>
      {Array.from({ length: cards }, (_, i) => (
        <Card key={i} />
      ))}
    </>
  );
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  who = "A";
  summaryCalls = 0;
  sessionCalls = 0;
  invalidateProgressSummary();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    if (url === "/api/progress/summary") {
      summaryCalls += 1;
      return { ok: true, json: async () => PAYLOADS[who] } as unknown as Response;
    }
    if (url === "/api/auth/session") {
      sessionCalls += 1;
      return { ok: true, json: async () => ({ user: SESSIONS[who] }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as never;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("progress summary cache × identity transitions (PERF-P1 t_e786efe2)", () => {
  it("sign out A → sign in B in one tab refetches the summary and renders B's stats", async () => {
    const first = render(<Card />);
    await waitFor(() => expect(screen.getByTestId("best")).toHaveTextContent("82/3"));
    expect(screen.getByTestId("lessons")).toHaveTextContent("series-1-1");
    expect(summaryCalls).toBe(1);

    // Client-side nav to /login unmounts the hub — the old code kept the cache.
    first.unmount();

    // Header.handleSignOut(): identity goes away.
    who = "guest";
    invalidateProgressSummary();
    notifyAuthChanged();

    // login/page.tsx success path for user B.
    who = "B";
    invalidateProgressSummary();
    notifyAuthChanged();

    // Back on /atlas: a fresh mount must not inherit A's payload.
    render(<Card />);

    await waitFor(() => expect(screen.getByTestId("best")).toHaveTextContent("41/1"));
    expect(screen.getByTestId("lessons")).toHaveTextContent("series-2-1");
    expect(screen.getByTestId("lessons")).not.toHaveTextContent("series-1-1");
    expect(summaryCalls).toBe(2); // A's read + B's read (nothing mounted at seam time)
  });

  it("refreshes every mounted card in place on an auth-changed broadcast, one request for the fan-out", async () => {
    render(<Hub cards={3} />);
    await waitFor(() =>
      expect(screen.getAllByTestId("best").every((n) => n.textContent === "82/3")).toBe(true),
    );
    expect(summaryCalls).toBe(1); // shared across all cards on mount

    // Account switch with the hub still mounted (seam invalidates, event fires).
    who = "B";
    act(() => {
      invalidateProgressSummary();
      notifyAuthChanged();
    });

    await waitFor(() =>
      expect(screen.getAllByTestId("best").every((n) => n.textContent === "41/1")).toBe(true),
    );
    // 3 cards × 2 hooks all re-read, but only one network request.
    expect(summaryCalls).toBe(2);
  });

  /*
   * PERF-CACHE-M1 (t_5f03a8f7): the invalidation must be CENTRAL, not only at
   * the three known seams. `notifyAuthChanged()` is the one function every
   * identity transition funnels through, so a future call site that announces a
   * change without importing the summary module must still drop the cache.
   * On the previous tree this test fails: the remount issued 0 requests and
   * rendered A's "series-1-1" for identity B.
   */
  it("notifyAuthChanged() alone drops the cache (no explicit seam invalidate)", async () => {
    const first = render(<Card />);
    await waitFor(() => expect(screen.getByTestId("best")).toHaveTextContent("82/3"));
    expect(summaryCalls).toBe(1);
    first.unmount();

    // Identity switches and the app only broadcasts — no seam invalidate call.
    who = "B";
    notifyAuthChanged();

    render(<Card />);

    await waitFor(() => expect(screen.getByTestId("best")).toHaveTextContent("41/1"));
    expect(screen.getByTestId("lessons")).toHaveTextContent("series-2-1");
    expect(screen.getByTestId("lessons")).not.toHaveTextContent("series-1-1");
    expect(summaryCalls).toBe(2);
  });

  it("discards a summary read that was in flight when the identity changed", async () => {
    let release!: (payload: unknown) => void;
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = (payload) =>
            resolve({ ok: true, json: async () => payload } as unknown as Response);
        }),
    ) as never;

    // A's read starts but does not settle.
    const inFlight = readProgressSummary();

    // Identity transition lands first (e.g. sign-out while the read was open).
    invalidateProgressSummary();

    await act(async () => {
      release(PAYLOADS["A"]);
      await inFlight;
    });

    // A's payload must not be handed back across the transition.
    await expect(inFlight).resolves.toBeNull();
  });
});

describe("cross-tab identity change via focus (SEC-R2-F1 t_2dd0e9f9)", () => {
  it("refetches the summary on focus and renders B's stats, one request for the fan-out", async () => {
    render(
      <>
        <AuthCard />
        <AuthCard />
        <AuthCard />
      </>,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("email").every((n) => n.textContent === "a@example.com")).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("best").every((n) => n.textContent === "82/3")).toBe(true),
    );
    expect(summaryCalls).toBe(1);

    // Another tab signs A out and B in; the cookie jar changed underneath us.
    // The only signal this tab gets is `focus` (SEC-R2-2-M3b's seam).
    who = "B";
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    // useAuth must report B ...
    await waitFor(() =>
      expect(screen.getAllByTestId("email").every((n) => n.textContent === "b@example.com")).toBe(true),
    );
    // ... and every mounted card must show B's progress/quiz stats, not A's.
    await waitFor(() =>
      expect(screen.getAllByTestId("best").every((n) => n.textContent === "41/1")).toBe(true),
    );
    for (const node of screen.getAllByTestId("lessons")) {
      expect(node).toHaveTextContent("series-2-1");
      expect(node).not.toHaveTextContent("series-1-1");
    }
    // 3 cards × 2 summary hooks + 3 useAuth instances still collapse into ONE
    // new summary read (and one session read).
    expect(summaryCalls).toBe(2);
    expect(sessionCalls).toBe(2);
  });

  it("a stale mount read settling after the identity refresh does not wipe B's payload", async () => {
    // QA-L1 (t_2dd0e9f9): A's read is in flight when the identity changes. The
    // post-transition refresh delivers B first; A's read then settles to null
    // (epoch discard). That null must NOT be applied to the mounted card.
    const resolvers: Array<(payload: unknown) => void> = [];
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push((payload) =>
            resolve({ ok: true, json: async () => payload } as unknown as Response),
          );
        }),
    ) as never;

    render(<Card />);
    await waitFor(() => expect(resolvers.length).toBe(1));
    const staleRead = resolvers[0];

    who = "B";
    await act(async () => {
      invalidateProgressSummary();
      notifyAuthChanged();
    });
    await waitFor(() => expect(resolvers.length).toBe(2));

    // B's read lands first and renders.
    await act(async () => {
      resolvers[1](PAYLOADS["B"]);
    });
    await waitFor(() => expect(screen.getByTestId("best")).toHaveTextContent("41/1"));

    // A's stale read settles last: discarded, never `setSummary(null)`.
    await act(async () => {
      staleRead(PAYLOADS["A"]);
    });
    expect(screen.getByTestId("best")).toHaveTextContent("41/1");
    expect(screen.getByTestId("lessons")).toHaveTextContent("series-2-1");
    expect(screen.getByTestId("lessons")).not.toHaveTextContent("series-1-1");
  });
});

describe("identity seams invalidate the summary cache (source lock)", () => {
  const root = path.resolve(__dirname, "../../..");
  const seams = [
    "src/components/Header.tsx",
    "src/app/login/page.tsx",
    "src/app/reset-password/ResetPasswordForm.tsx",
  ];

  it.each(seams)("%s calls invalidateProgressSummary on its identity transition", (rel) => {
    const src = readFileSync(path.join(root, rel), "utf8");
    expect(src).toContain("invalidateProgressSummary");
    // Imported from the hook module, not re-declared locally.
    expect(src).toMatch(/from\s+"@\/lib\/hooks\/useProgressSummary"/);
  });

  /*
   * PERF-CACHE-M1 (t_5f03a8f7): the event constant moved to its own module so
   * `useAuth → useProgressSummary → useAuth` is not a cycle. Lock both halves:
   * useAuth must import the invalidator and call it in notifyAuthChanged(), and
   * the summary module must NOT import the event name from useAuth.
   */
  it("useAuth invalidates the summary from notifyAuthChanged (central seam)", () => {
    const src = readFileSync(path.join(root, "src/lib/hooks/useAuth.ts"), "utf8");
    expect(src).toMatch(/import\s*\{\s*invalidateProgressSummary\s*\}\s*from\s*"@\/lib\/hooks\/useProgressSummary"/);
    const notify = src.slice(src.indexOf("export function notifyAuthChanged"));
    expect(notify).toContain("invalidateProgressSummary()");
  });

  it("useProgressSummary imports the event from @/lib/auth-events (no cycle)", () => {
    const src = readFileSync(path.join(root, "src/lib/hooks/useProgressSummary.ts"), "utf8");
    expect(src).toMatch(/import\s*\{\s*AUTH_CHANGED_EVENT\s*\}\s*from\s*"@\/lib\/auth-events"/);
    expect(src).not.toMatch(/AUTH_CHANGED_EVENT[^\n]*from\s*"@\/lib\/hooks\/useAuth"/);
  });
});
