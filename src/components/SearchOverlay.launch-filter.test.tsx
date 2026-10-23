/**
 * src/components/SearchOverlay.launch-filter.test.tsx — t_a6b7630b acceptance:
 * the real search overlay, fed the real server-filtered payload, finds
 * launched content and never discloses (or links to) a stealth series.
 *
 * Unlike SearchOverlay.test.tsx (which mocks the index for a11y determinism),
 * this test uses the real `buildSearchIndex` + the real `getPublicSearchData()`
 * so it fails if the boundary ever regresses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchOverlay from "./SearchOverlay";
import SearchDataProvider from "./SearchDataProvider";
import { getPublicSearchData } from "@/lib/learn-public";
import type { PublicSearchData } from "@/lib/learn-public";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

/*
 * The 8 stealth series in `@/data/learn` (as of t_a6b7630b). Deliberately NOT
 * derived by importing the dataset here: a client-folder test must not become
 * the reason `@/data/learn` creeps back into `src/components`. Parity with the
 * live dataset is asserted in `src/lib/learn-public.test.ts`, which is allowed
 * to import it.
 */
const STEALTH_SERIES = [
  { slug: "ai-adoption", name: "AI Adoption" },
  { slug: "ai-power-user", name: "AI Power User" },
  { slug: "salesforce-data-architect", name: "Salesforce System Architect Primer" },
  {
    slug: "salesforce-sharing-visibility-architect",
    name: "Platform Sharing and Visibility Architect Certification",
  },
  {
    slug: "sf-omni-consultant",
    name: "Salesforce OmniStudio Consultant Certification",
  },
  { slug: "hermes-consultant", name: "Hermes Agent Consultant" },
  {
    slug: "hermes-consultant-intermediate",
    name: "Hermes Agent Consultant · Intermediate",
  },
  {
    slug: "hermes-consultant-advanced",
    name: "Hermes Agent Consultant · Advanced",
  },
];

beforeEach(() => push.mockClear());

function renderOverlay(value: PublicSearchData = getPublicSearchData()) {
  return render(
    <SearchDataProvider value={value}>
      <SearchOverlay />
    </SearchDataProvider>,
  );
}

async function search(query: string) {
  await userEvent.click(screen.getByRole("button", { name: "Search site" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "Search query" }),
    query,
  );
}

describe("SearchOverlay — launched-series disclosure boundary (t_a6b7630b)", () => {
  it("sanity: the full dataset really does carry stealth series", () => {
    expect(STEALTH_SERIES.length).toBeGreaterThan(0);
    expect(STEALTH_SERIES.map((s) => s.slug)).toContain("ai-adoption");
  });

  it("finds launched content: \"agent\" surfaces an agentic-ai result", async () => {
    renderOverlay();
    await search("agent");
    expect(screen.getByRole("status").textContent).not.toMatch(/^No results/);
    expect(screen.getByRole("status").textContent).toMatch(/Agentic AI/);
  });

  it("renders no stealth series NAME for any stealth-flavoured query", async () => {
    for (const q of ["hermes", "adoption", "omni", "power user"]) {
      const { unmount } = renderOverlay();
      await search(q);
      const text = screen.getByRole("status").textContent ?? "";
      for (const s of STEALTH_SERIES) {
        expect(text).not.toContain(s.name);
      }
      unmount();
    }
  });

  it("never navigates to a stealth series route (the /atlas/<stealth> dead end)", async () => {
    for (const q of ["hermes", "adoption", "omni", "power user"]) {
      const { unmount } = renderOverlay();
      await search(q);
      const results = screen
        .queryAllByRole("button")
        .filter((b) => b.textContent && /Lesson |Path|Certification|AI /.test(b.textContent));
      for (const btn of results) {
        fireEvent.click(btn);
        for (const call of push.mock.calls) {
          const href = String(call[0]);
          for (const s of STEALTH_SERIES) {
            expect(href).not.toContain(`/atlas/${s.slug}`);
          }
        }
      }
      push.mockClear();
      unmount();
    }
  });

  it("searches ONLY the payload it is given — it does not fall back to the full dataset", async () => {
    // A one-series payload: nothing else may be findable, even though 12
    // series exist in @/data/learn.
    renderOverlay({
      series: [
        {
          slug: "agentic-ai",
          name: "Agentic AI Implementation Path",
          description: "Agent curriculum.",
        },
      ],
      lessons: [],
    });
    await search("AI Adoption");
    expect(screen.getByRole("status")).toHaveTextContent(
      /No results for AI Adoption/i,
    );
  });
});
