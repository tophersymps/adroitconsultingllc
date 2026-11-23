/**
 * Search analytics wiring.
 *
 * GA4's built-in site search needs the query in the URL; this overlay never
 * writes one, so `trackSearch` is called from the component after the query
 * settles. These tests pin the two failure modes that would make the event
 * useless: firing on every keystroke, and firing twice for the same term.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SearchDoc } from "@/shared/contracts-search";

const trackSearchMock = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackSearch: (...args: unknown[]) => trackSearchMock(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
];

const fetchMock = vi.fn();

beforeEach(() => {
  trackSearchMock.mockClear();
  resetSearchDocsCacheForTests();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ version: 1, docs: DOCS }),
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openAndType(value: string) {
  fireEvent.click(screen.getByLabelText("Search site"));
  const input = await screen.findByLabelText("Search query");
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("SearchOverlay search tracking", () => {
  it("reports one search event per settled query", async () => {
    render(<SearchOverlay />);
    await openAndType("AI");

    await waitFor(() => expect(trackSearchMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(trackSearchMock).toHaveBeenCalledWith({
      searchTerm: "AI",
      resultCount: 1,
    });
  });

  it("does not report a single character", async () => {
    render(<SearchOverlay />);
    await openAndType("a");
    // Give the settle window time to elapse before asserting silence.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(trackSearchMock).not.toHaveBeenCalled();
  });

  it("does not report the same term twice", async () => {
    render(<SearchOverlay />);
    const input = await openAndType("AI");
    await waitFor(() => expect(trackSearchMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });

    fireEvent.change(input, { target: { value: "A" } });
    fireEvent.change(input, { target: { value: "AI" } });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(trackSearchMock).toHaveBeenCalledTimes(1);
  });
});