/**
 * src/components/SearchOverlay.test.tsx
 *
 * Rewritten for ADR-220: the overlay no longer imports the static datasets —
 * it lazily fetches the guest-filtered document index from `GET /api/search`
 * on first open. So this file mocks `fetch` (not `@/data/*`) and keeps EVERY
 * a11y assertion from t_754b2240 / B-21, adding loading + failure coverage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SearchDoc } from "@/shared/contracts-search";
import SearchOverlay, { resetSearchDocsCacheForTests } from "./SearchOverlay";

const DOCS: SearchDoc[] = [
  {
    type: "post",
    title: "AI Strategy 2026",
    href: "/field-notes/ai-strategy-2026",
    group: "Posts",
    snippet: "The 2026 AI strategy.",
    meta: "Strategy",
    terms: ["Strategy", "ai-strategy-2026"],
  },
  {
    type: "series",
    // Chosen so it does NOT match the "AI" queries below (1-result assertions).
    title: "Agentic Patterns Path",
    href: "/atlas/agentic-ai",
    group: "Series",
    snippet: "From prototypes to orchestration.",
    terms: ["agentic-patterns"],
  },
];

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function okResponse(docs: SearchDoc[] = DOCS) {
  return Promise.resolve({
    ok: true,
    json: async () => ({ version: 1, docs }),
  } as unknown as Response);
}

const fetchMock = vi.fn();

beforeEach(() => {
  resetSearchDocsCacheForTests();
  push.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => okResponse());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openDialog() {
  const trigger = screen.getByRole("button", { name: "Search site" });
  await userEvent.click(trigger);
  // Wait for the lazy index fetch to settle so results are deterministic.
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/search",
      expect.objectContaining({ signal: expect.anything() }),
    ),
  );
  await screen.findByRole("dialog", { name: "Site search" });
}

describe("SearchOverlay a11y (t_754b2240 / B-21)", () => {
  it("renders a proper modal dialog when opened, with the trigger as the only outside element", async () => {
    render(<SearchOverlay />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await openDialog();
    expect(screen.getByRole("dialog", { name: "Site search" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });

  it("focuses the input on open", async () => {
    render(<SearchOverlay />);
    await openDialog();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Search query" })).toHaveFocus(),
    );
  });

  it("traps Tab within the dialog: Tab after last wraps to first, Shift+Tab after first wraps to last", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay />);
    await openDialog();
    const input = screen.getByRole("textbox", { name: "Search query" });

    // Type to reveal a result button (the last focusable element in the dialog).
    await user.type(input, "AI");
    const resultBtn = await screen.findByRole("button", {
      name: /AI Strategy 2026/,
    });

    // Shift+Tab from the first element (input) should wrap to the last.
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(resultBtn).toHaveFocus();

    // Tab from the last element should wrap back to the first.
    fireEvent.keyDown(resultBtn, { key: "Tab" });
    expect(input).toHaveFocus();
  });

  it("restores focus to the trigger button on Escape close", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay />);
    await openDialog();
    const trigger = screen.getByRole("button", { name: "Search site" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("restores focus to the trigger button on backdrop click close", async () => {
    render(<SearchOverlay />);
    await openDialog();
    const trigger = screen.getByRole("button", { name: "Search site" });
    // Click the backdrop (the dialog wrapper) — its onClick closes the dialog.
    fireEvent.click(screen.getByRole("dialog"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("exposes the results region as an aria-live status region", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay />);
    await openDialog();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    // Typing a query updates the sr-only live status with the result count.
    await user.type(screen.getByRole("textbox", { name: "Search query" }), "AI");
    await waitFor(() => expect(status).toHaveTextContent("1 result for AI"));
  });

  it("announces no-results via the live region", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay />);
    await openDialog();
    await user.type(
      screen.getByRole("textbox", { name: "Search query" }),
      "zzz",
    );
    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("No results for zzz"));
    expect(screen.getAllByText(/no results for/i).length).toBeGreaterThan(0);
  });

  it("navigates to a result and clears the query on selection", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay />);
    await openDialog();
    await user.type(
      screen.getByRole("textbox", { name: "Search query" }),
      "AI",
    );
    await user.click(
      await screen.findByRole("button", { name: /AI Strategy 2026/ }),
    );
    expect(push).toHaveBeenCalledWith("/field-notes/ai-strategy-2026");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("SearchOverlay — lazy index transport (ADR-220)", () => {
  it("does not fetch until the overlay is opened", async () => {
    render(<SearchOverlay />);
    expect(fetchMock).not.toHaveBeenCalled();
    await openDialog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("announces loading in the status region while the index is in flight", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<SearchOverlay />);
    await openDialog();

    expect(screen.getByRole("status")).toHaveTextContent("Loading search…");

    resolveFetch({
      ok: true,
      json: async () => ({ version: 1, docs: DOCS }),
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /type to search across posts/i,
      ),
    );
  });

  it("stays usable and announces failure when the index cannot be fetched", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 503 }),
    );

    render(<SearchOverlay />);
    await openDialog();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Search is unavailable — try again",
      ),
    );
    // The input is still there and accepts text — never a blank panel.
    const input = screen.getByRole("textbox", { name: "Search query" });
    await userEvent.type(input, "AI");
    expect(input).toHaveValue("AI");
    expect(
      screen.queryByRole("button", { name: /AI Strategy 2026/ }),
    ).toBeNull();
  });

  it("fetches the index only once across repeated opens (module cache)", async () => {
    render(<SearchOverlay />);
    await openDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Search site" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /type to search across posts/i,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
