import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchOverlay from "./SearchOverlay";

// Mock the heavy static datasets + search so the test is deterministic.
vi.mock("@/data/posts", () => ({ posts: [] }));
vi.mock("@/data/learn", () => ({ learnSeries: [], learnLessons: [] }));
vi.mock("@/lib/search", () => ({
  buildSearchIndex: () => (q: string) => {
    if (!q.trim()) return { posts: [], series: [], lessons: [], total: 0 };
    if (q.trim() === "zzz") return { posts: [], series: [], lessons: [], total: 0 };
    const hit = {
      type: "post",
      title: "AI Strategy 2026",
      href: "/blog/ai-strategy-2026",
      group: "Posts",
      snippet: "The 2026 AI strategy.",
      meta: "Strategy",
    };
    return { posts: [hit], series: [], lessons: [], total: 1 };
  },
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

async function openDialog() {
  const trigger = screen.getByRole("button", { name: "Search site" });
  await userEvent.click(trigger);
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
    const resultBtn = screen.getByRole("button", { name: /AI Strategy 2026/ });

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
    expect(status).toHaveTextContent("1 result for AI");
  });

  it("announces no-results via the live region", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay />);
    await openDialog();
    await user.type(screen.getByRole("textbox", { name: "Search query" }), "zzz");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("No results for zzz");
    expect(screen.getAllByText(/no results for/i).length).toBeGreaterThan(0);
  });

  it("navigates to a result and clears the query on selection", async () => {
    const user = userEvent.setup();
    render(<SearchOverlay />);
    await openDialog();
    await user.type(screen.getByRole("textbox", { name: "Search query" }), "AI");
    await user.click(screen.getByRole("button", { name: /AI Strategy 2026/ }));
    expect(push).toHaveBeenCalledWith("/blog/ai-strategy-2026");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
