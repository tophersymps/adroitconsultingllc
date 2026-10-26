/**
 * useAuth × transient session-read failure — "couldn't check" ≠ "signed out"
 * (t_8101e74f, regression lock added by t_9ea611b0).
 *
 * `GET /api/auth/session` answers `503 SESSION_UNAVAILABLE` (or the fetch
 * throws outright) when the upstream session read fails. The client half of
 * that contract lives in two guards:
 *
 *   - `useAuth.ts` initial-read effect  → `if (sessionUnavailable) { … return; }`
 *   - `useAuth.ts` `refresh()`          → `if (sessionUnavailable) { … return; }`
 *
 * plus the Header's `unavailable ? null : <Sign in>` suppression. Delete any of
 * them and the original bug returns: a signed-in learner whose auth backend
 * hiccups is blanked to `null` and shown the "Sign in" CTA.
 *
 * These tests mount the REAL hook (and, for the last two, the REAL Header) with
 * a mocked `fetch("/api/auth/session")`, so they fail if that behaviour is
 * regressed — QA's mutant (removing both `sessionUnavailable` guards) must fail
 * here, and does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuth, notifyAuthChanged, invalidateAuthSession } from "./useAuth";
import Header from "@/components/Header";
import { ThemeProvider } from "@/components/Theme/ThemeProvider";

/* The hook does not touch the App Router, but Header does. */
vi.mock("next/navigation", () => ({
  usePathname: () => "/field-notes",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const USER = { id: "user-cached", email: "cached@example.com", isAdmin: true };

/**
 * What the next `/api/auth/session` read does:
 *  - "user": a signed-in payload
 *  - "guest": a genuine `{user:null}` signed-out answer
 *  - "unavailable": 503 SESSION_UNAVAILABLE (upstream read failed)
 *  - "thrown": the fetch itself rejects (network error / timeout)
 */
type ReadMode = "user" | "guest" | "unavailable" | "thrown";

let mode: ReadMode = "user";
let sessionCalls = 0;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

async function readSessionRoute(): Promise<Response> {
  switch (mode) {
    case "user":
      return jsonResponse(200, { user: USER });
    case "guest":
      return jsonResponse(200, { user: null });
    case "unavailable":
      return jsonResponse(503, {
        error: "We can't check your session right now. Please try again in a moment.",
        code: "SESSION_UNAVAILABLE",
      });
    case "thrown":
      throw new TypeError("fetch failed");
  }
}

function Probe() {
  const { user, unavailable, isLoading } = useAuth();
  return (
    <div data-testid="probe">
      <span data-testid="email">{user?.email ?? "guest"}</span>
      <span data-testid="unavailable">{unavailable ? "unavailable" : "available"}</span>
      <span data-testid="loading">{isLoading ? "loading" : "ready"}</span>
    </div>
  );
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  mode = "user";
  sessionCalls = 0;
  // Reset the module-level session cache (and the `sessionUnavailable` flag it
  // carries) so each test starts from a cold client, exactly like a fresh tab.
  invalidateAuthSession();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    if (url !== "/api/auth/session") return jsonResponse(200, {});
    sessionCalls += 1;
    return readSessionRoute();
  }) as never;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("useAuth × failed session read (t_8101e74f)", () => {
  it("P1 — a 503 refresh keeps the cached user and flags `unavailable`", async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("email")).toHaveTextContent(USER.email));
    expect(screen.getByTestId("unavailable")).toHaveTextContent("available");

    const before = sessionCalls;
    mode = "unavailable";
    await act(async () => {
      notifyAuthChanged();
    });

    await waitFor(() =>
      expect(screen.getByTestId("unavailable")).toHaveTextContent("unavailable"),
    );
    // The whole point: a transient failure must not blank a known user.
    expect(screen.getByTestId("email")).toHaveTextContent(USER.email);
    expect(screen.getByTestId("loading")).toHaveTextContent("ready");
    // …and it really was a re-read, not a cached promise.
    expect(sessionCalls).toBe(before + 1);
  });

  it("P2 — a thrown fetch (network error) keeps the cached user and flags `unavailable`", async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("email")).toHaveTextContent(USER.email));

    mode = "thrown";
    await act(async () => {
      notifyAuthChanged();
    });

    await waitFor(() =>
      expect(screen.getByTestId("unavailable")).toHaveTextContent("unavailable"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent(USER.email);
    expect(screen.getByTestId("loading")).toHaveTextContent("ready");
  });

  it("P3 — a cold mount during an outage is unknown, not signed out (`null` + `unavailable`)", async () => {
    mode = "unavailable";

    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("ready"));

    expect(screen.getByTestId("email")).toHaveTextContent("guest");
    expect(screen.getByTestId("unavailable")).toHaveTextContent("unavailable");
    expect(sessionCalls).toBe(1);
  });

  it("P4 — recovery clears `unavailable` on the next successful read", async () => {
    mode = "unavailable";
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("unavailable")).toHaveTextContent("unavailable"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("guest");

    // The upstream comes back and answers with a genuine guest session.
    mode = "guest";
    await act(async () => {
      notifyAuthChanged();
    });

    await waitFor(() =>
      expect(screen.getByTestId("unavailable")).toHaveTextContent("available"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("guest");
    expect(screen.getByTestId("loading")).toHaveTextContent("ready");
  });
});

describe("Header signed-out CTA × failed session read (t_8101e74f)", () => {
  it("suppresses the Sign in link (desktop + mobile drawer) while the read is unavailable", async () => {
    mode = "unavailable";
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <Header />
        <Probe />
      </ThemeProvider>,
    );

    // The Probe shares the module session read, so it tells us when the Header's
    // hook has settled. Asserting before that point would pass vacuously.
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("ready"));
    expect(screen.getByTestId("unavailable")).toHaveTextContent("unavailable");

    // Desktop auth control (Header.tsx `unavailable ? null : <Sign in>`).
    expect(screen.queryByRole("link", { name: /^sign in$/i })).toBeNull();

    // Mobile drawer branch (Header.tsx:238 `!isLoading && !user && !unavailable`).
    await user.click(screen.getByRole("button", { name: "Toggle menu" }));
    const mobile = screen.getByRole("navigation", { name: "Mobile" });
    expect(within(mobile).queryByRole("link", { name: /sign in/i })).toBeNull();
  });

  it("still renders the Sign in link for a real guest (control for the outage case)", async () => {
    mode = "guest";
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <Header />
        <Probe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("ready"));
    expect(screen.getByTestId("unavailable")).toHaveTextContent("available");

    expect(screen.getByRole("link", { name: /^sign in$/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Toggle menu" }));
    const mobile = screen.getByRole("navigation", { name: "Mobile" });
    expect(within(mobile).getByRole("link", { name: /sign in/i })).toBeTruthy();
  });
});
