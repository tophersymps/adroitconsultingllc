/**
 * Header sign-out × progress-summary cache — PERF-P1 (t_e786efe2).
 *
 * The end-to-end seam: clicking "Sign out" in the account menu must drop the
 * module-level `/api/progress/summary` cache, exactly like it already drops the
 * cached Data API JWT (QA F2). Without it, the next person to sign in in the
 * same tab inherits the previous user's progress bars and quiz stats until a
 * full reload (sato's PR #358 probe).
 *
 * This drives the REAL Header + the REAL useProgressSummary module (only
 * `useAuth` is stubbed to a signed-in user), so it fails if the seam call is
 * ever removed from handleSignOut.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "./Header";
import { ThemeProvider } from "@/components/Theme/ThemeProvider";
import { readProgressSummary } from "@/lib/hooks/useProgressSummary";

vi.mock("next/navigation", () => ({
  usePathname: () => "/atlas",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Keep the real module (AUTH_CHANGED_EVENT / notifyAuthChanged are shared with
// useProgressSummary); stub only the hook's session read.
vi.mock("@/lib/hooks/useAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/useAuth")>();
  return {
    ...actual,
    useAuth: () => ({
      user: { id: "u1", email: "a@b.co", isAdmin: false },
      isLoading: false,
      refresh: vi.fn(),
    }),
  };
});

const SUMMARY_A = {
  readContent: { blog: [], lesson: [] },
  completedLessons: ["series-1-1"],
  quizStats: { "series-1": { bestScore: 82, attempts: 3 } },
};
const SUMMARY_B = {
  readContent: { blog: [], lesson: [] },
  completedLessons: ["series-2-1"],
  quizStats: { "series-1": { bestScore: 41, attempts: 1 } },
};

const originalFetch = globalThis.fetch;
let who: "A" | "B" | "guest" = "A";
let summaryCalls = 0;

beforeEach(() => {
  who = "A";
  summaryCalls = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    if (url === "/api/progress/summary") summaryCalls += 1;
    const payload =
      url === "/api/progress/summary" ? (who === "A" ? SUMMARY_A : who === "B" ? SUMMARY_B : {}) : {};
    return { ok: true, json: async () => payload } as unknown as Response;
  }) as never;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Header sign-out drops the cached progress summary (PERF-P1 t_e786efe2)", () => {
  it("a summary cached as user A is refetched for user B after signing out", async () => {
    const user = userEvent.setup();

    // User A's /atlas populated the shared cache.
    await expect(readProgressSummary()).resolves.toEqual(SUMMARY_A);
    expect(summaryCalls).toBe(1);

    render(
      <ThemeProvider>
        <Header />
      </ThemeProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /account menu for/i }));
    await user.click(await screen.findByRole("menuitem", { name: /sign out/i }));

    // Sign-out is a transition (logout POST → invalidate → notify → refresh).
    who = "B";
    await waitFor(() => expect(summaryCalls).toBe(1)); // sign-out alone must not read progress

    // Next sign-in in the same tab: the cache is gone, so B gets B's payload.
    const afterSignOut = await readProgressSummary();
    expect(summaryCalls).toBe(2);
    expect(afterSignOut).toEqual(SUMMARY_B);
    expect(afterSignOut?.completedLessons).not.toContain("series-1-1");
  });
});
