/**
 * SeriesSyllabus — timeline ordering, interleaving and hide-completed tests
 * (ADR-105, A5).
 *
 * Pins the things that are easy to break:
 *  - lessons stay lesson-number ordered, and `?sort=desc` reverses the WHOLE
 *    timeline so each knowledge check keeps its boundary position;
 *  - every check renders as a node between its range end and the next lesson —
 *    for a learner with ZERO completed lessons, before any tiers response;
 *  - only the Passed badge waits for the tiers rollup (node presence and the
 *    Available state are a pure function of lessons + checks);
 *  - hide-completed follows the D-5 rule via `hiddenByFilter`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SeriesSyllabus from "./SeriesSyllabus";
import type { LearnLesson } from "@/data/types";
import type { KnowledgeCheckMeta, TierProgress } from "@/shared/contracts";

// next/link → plain anchor (same pattern as QuizStats.test.tsx).
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

/* Mutable fixture state read by the mocked hooks (render-time, not hoist-time). */
const state = vi.hoisted(() => ({
  completed: new Set<string>(),
  tiers: null as TierProgress | null,
}));

vi.mock("@/lib/hooks/useProgressSummary", () => ({
  useProgressSummary: () => ({ merge: { lessons: state.completed } }),
}));

vi.mock("@/lib/hooks/useTierProgress", () => ({
  useTierProgress: () => ({ tiers: state.tiers, isLoading: state.tiers === null, refresh: () => {} }),
}));

// useSearchParams — controllable per test via a mutable mock.
const paramsMock = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => paramsMock(),
  useRouter: () => ({ replace: vi.fn() }),
}));

// MarkComplete pulls in the Supabase client at import time (env vars not
// present in unit tests) — stub it out; ordering logic doesn't touch it.
vi.mock("@/components/Progress/MarkComplete", () => ({
  default: () => <span data-testid="mark-complete" />,
}));

const NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
const WORDS: Record<number, string> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
};

/** Deliberately unsorted input: the component must sort by lesson number. */
const LESSONS: LearnLesson[] = [3, 1, 7, 2, 5, 4, 6].map((n) => ({
  slug: `lesson-${n}`,
  title: `Lesson ${WORDS[n]}`,
  series: "omni-studio-cert",
  lesson: n,
  excerpt: "",
  date: `August ${n}, 2026`,
  author: "Adroit Consulting",
  readTime: "5 min read",
  tags: [],
}));

const CHECKS: KnowledgeCheckMeta[] = [{ n: 1, lessons: [1, 5] }];

/** Ordered tokens: lessons as `L<n>`, checks as `K<n>`. */
function sequence(): string[] {
  return screen.getAllByRole("link").map((a) => {
    const href = a.getAttribute("href") ?? "";
    const check = /\/check\/(\d+)$/.exec(href);
    if (check) return `K${check[1]}`;
    const lesson = /\/lesson-(\d+)$/.exec(href);
    return lesson ? `L${lesson[1]}` : href;
  });
}

function renderSyllabus(over: Partial<React.ComponentProps<typeof SeriesSyllabus>> = {}) {
  return render(
    <SeriesSyllabus
      series="omni-studio-cert"
      lessons={LESSONS}
      checks={CHECKS}
      kind="course-completion"
      totalLessons={NUMBERS.length}
      published={NUMBERS.length}
      upcoming={0}
      {...over}
    />,
  );
}

function tierRollup(checks: TierProgress["checks"]): TierProgress {
  return {
    lessons: { completed: 0, total: 7 },
    checks,
    exam: { bestScore: 0, attempts: 0, passed: false },
    unlocked: checks.every((c) => c.passed),
  };
}

describe("SeriesSyllabus", () => {
  beforeEach(() => {
    paramsMock.mockReturnValue(new URLSearchParams());
    state.completed = new Set<string>();
    state.tiers = null;
  });

  it("renders lessons in lesson-number ascending order by default", () => {
    paramsMock.mockReturnValue(new URLSearchParams(""));
    renderSyllabus();
    expect(sequence()).toEqual(["L1", "L2", "L3", "L4", "L5", "K1", "L6", "L7"]);
  });

  it("reverses the timeline when ?sort=desc is present, moving the check with its position", () => {
    paramsMock.mockReturnValue(new URLSearchParams("sort=desc"));
    renderSyllabus();
    // The check stays on the L5/L6 boundary: after L6, before L5.
    expect(sequence()).toEqual(["L7", "L6", "K1", "L5", "L4", "L3", "L2", "L1"]);
  });

  it("exposes the sort + hide-completed controls", () => {
    renderSyllabus();
    expect(screen.getByRole("switch", { name: "Hide completed lessons" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by lesson number ascending" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by lesson number descending" }),
    ).toBeInTheDocument();
  });

  it("keeps the hide-completed switch at a ≥44px hit target (a11y finding 6)", () => {
    renderSyllabus();
    const sw = screen.getByRole("switch", { name: "Hide completed lessons" });
    // w-11 = 44px, h-11 = 44px (WCAG 2.5.8 target size minimum).
    expect(sw.className).toContain("w-11");
    expect(sw.className).toContain("h-11");
  });

  it("renders coming-soon placeholder nodes for planned-but-unwritten lessons", () => {
    // published=3, upcoming=3 → lessons 4,5,6 are owed.
    renderSyllabus({ published: 3, upcoming: 3 });
    const block = screen.getByTestId("coming-soon-lessons");
    expect(block).toBeInTheDocument();
    expect(screen.getByLabelText("Lesson 4, coming soon")).toBeInTheDocument();
    expect(screen.getByLabelText("Lesson 5, coming soon")).toBeInTheDocument();
    expect(screen.getByLabelText("Lesson 6, coming soon")).toBeInTheDocument();
    // They are placeholders, not links — nothing navigates and no completion toggle.
    expect(screen.queryAllByRole("link")).toHaveLength(LESSONS.length + CHECKS.length);
    expect(screen.getAllByTestId("mark-complete")).toHaveLength(LESSONS.length);
  });

  it("hides coming-soon nodes when the curriculum is fully published", () => {
    renderSyllabus({ upcoming: 0 });
    expect(screen.queryByTestId("coming-soon-lessons")).not.toBeInTheDocument();
  });

  /* ── The A5 acceptance criterion ──────────────────────────────────── */

  it("zero-progress learner sees Knowledge Check 1 between L5 and L6 as Available before any tiers response", () => {
    // state.tiers === null: the rollup has NOT resolved (guest / first paint).
    const { container } = renderSyllabus();
    const nodes = Array.from(container.querySelectorAll(".milestone"));
    expect(nodes).toHaveLength(1);

    const node = nodes[0]!;
    expect(node.getAttribute("data-state")).toBe("available");
    // Position: directly after lesson 5, directly before lesson 6.
    const all = sequence();
    expect(all.indexOf("K1")).toBe(all.indexOf("L5") + 1);
    expect(all.indexOf("L6")).toBe(all.indexOf("K1") + 1);
    // The accessible name covers number, range and state.
    expect(
      screen.getByRole("link", {
        name: "Knowledge Check 1, lessons 1 to 5, available",
      }),
    ).toBeInTheDocument();
    // No locked/disabled treatment anywhere.
    expect(node.textContent).toContain("Available");
  });

  it("renders every check even with no progress at all (one node per check)", () => {
    renderSyllabus({
      checks: [
        { n: 1, lessons: [1, 5] },
        { n: 2, lessons: [6, 10] },
      ],
    });
    const labels = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("aria-label"))
      .filter((l): l is string => Boolean(l && l.startsWith("Knowledge Check")));
    expect(labels).toEqual([
      "Knowledge Check 1, lessons 1 to 5, available",
      "Knowledge Check 2, lessons 6 to 10, available",
    ]);
  });

  it("shows the Passed badge (with best score) once the tiers rollup lands", () => {
    state.tiers = tierRollup([{ n: 1, bestScore: 87, attempts: 2, passed: true }]);
    renderSyllabus();
    expect(
      screen.getByRole("link", {
        name: "Knowledge Check 1, lessons 1 to 5, passed 87 percent",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Passed · 87%")).toBeInTheDocument();
  });

  it("renders one explanatory line per syllabus, wired to every node via aria-describedby", () => {
    renderSyllabus();
    const node = screen.getByRole("link", { name: /Knowledge Check 1/ });
    const noteId = node.getAttribute("aria-describedby");
    expect(noteId).toBeTruthy();
    const note = document.getElementById(noteId!);
    expect(note).toBeInTheDocument();
    // course-completion wording, from the single label source.
    expect(note!.textContent?.toLowerCase()).toContain("the timed course completion exam");
  });

  it("renders no check node and no note when the series has no checks", () => {
    const { container } = renderSyllabus({ checks: [] });
    expect(container.querySelectorAll(".milestone")).toHaveLength(0);
    expect(container.querySelector("#syllabus-unlock-note")).toBeNull();
    expect(sequence()).toEqual(["L1", "L2", "L3", "L4", "L5", "L6", "L7"]);
  });

  /* ── hide-completed: the D-5 rule ─────────────────────────────────── */

  it("hides completed lessons but keeps an unpassed check node visible", () => {
    state.completed = new Set(Array.from({ length: 5 }, (_, i) => `lesson-${i + 1}`));
    renderSyllabus();
    fireEvent.click(screen.getByRole("switch", { name: "Hide completed lessons" }));
    // Lessons 1–5 hidden; the check is unpassed so D-5 keeps it.
    expect(sequence()).toEqual(["K1", "L6", "L7"]);
  });

  it("hides a passed check only when every lesson in its range is hidden", () => {
    state.completed = new Set(Array.from({ length: 5 }, (_, i) => `lesson-${i + 1}`));
    state.tiers = tierRollup([{ n: 1, bestScore: 92, attempts: 1, passed: true }]);
    renderSyllabus();
    fireEvent.click(screen.getByRole("switch", { name: "Hide completed lessons" }));
    expect(sequence()).toEqual(["L6", "L7"]);
  });

  it("keeps a passed check visible while any lesson in its range is still shown", () => {
    state.completed = new Set(Array.from({ length: 4 }, (_, i) => `lesson-${i + 1}`));
    state.tiers = tierRollup([{ n: 1, bestScore: 92, attempts: 1, passed: true }]);
    renderSyllabus();
    fireEvent.click(screen.getByRole("switch", { name: "Hide completed lessons" }));
    expect(sequence()).toEqual(["L5", "K1", "L6", "L7"]);
  });
});
