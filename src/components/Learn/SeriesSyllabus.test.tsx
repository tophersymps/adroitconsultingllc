/**
 * SeriesSyllabus — ordering + hide-completed tests (ADR-105).
 *
 * Regression: the LessonSortToggle writes `?sort=asc|desc` to the URL, and
 * SeriesSyllabus MUST re-sort the syllabus from that param. Earlier the list
 * hardcoded "asc", so the "9 → 1" toggle was a no-op. These tests pin the
 * wiring: ?sort=desc renders lessons in descending lesson-number order.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SeriesSyllabus from "./SeriesSyllabus";
import { LearnLesson } from "@/data/types";

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

// useProgressSummary — no stored completion in these tests (all lessons shown).
vi.mock("@/lib/hooks/useProgressSummary", () => ({
  useProgressSummary: () => ({
    merge: { lessons: new Set<string>() },
  }),
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

const LESSONS: LearnLesson[] = [
  {
    slug: "lesson-3",
    title: "Lesson Three",
    series: "omni-studio-cert",
    lesson: 3,
    excerpt: "",
    date: "August 3, 2026",
    author: "Adroit Consulting",
    readTime: "5 min read",
    tags: [],
  },
  {
    slug: "lesson-1",
    title: "Lesson One",
    series: "omni-studio-cert",
    lesson: 1,
    excerpt: "",
    date: "August 1, 2026",
    author: "Adroit Consulting",
    readTime: "5 min read",
    tags: [],
  },
  {
    slug: "lesson-2",
    title: "Lesson Two",
    series: "omni-studio-cert",
    lesson: 2,
    excerpt: "",
    date: "August 2, 2026",
    author: "Adroit Consulting",
    readTime: "5 min read",
    tags: [],
  },
];

function getVisibleLessonTitles(): string[] {
  // LessonCard links contain "Lesson Three" (title) among badge/meta text.
  const titles: string[] = [];
  for (const l of screen.getAllByRole("link")) {
    const t = l.textContent ?? "";
    for (const name of ["Lesson One", "Lesson Two", "Lesson Three"]) {
      if (t.includes(name)) titles.push(name);
    }
  }
  return titles;
}

function renderSyllabus(over: Partial<React.ComponentProps<typeof SeriesSyllabus>> = {}) {
  return render(
    <SeriesSyllabus
      lessons={LESSONS}
      totalLessons={3}
      published={3}
      upcoming={0}
      {...over}
    />,
  );
}

describe("SeriesSyllabus", () => {
  beforeEach(() => {
    paramsMock.mockReturnValue(new URLSearchParams());
  });

  it("renders lessons in lesson-number ascending order by default", () => {
    paramsMock.mockReturnValue(new URLSearchParams(""));
    renderSyllabus();
    expect(getVisibleLessonTitles()).toEqual([
      "Lesson One",
      "Lesson Two",
      "Lesson Three",
    ]);
  });

  it("re-sorts to descending order when ?sort=desc is present (toggle wiring)", () => {
    paramsMock.mockReturnValue(new URLSearchParams("sort=desc"));
    renderSyllabus();
    expect(getVisibleLessonTitles()).toEqual([
      "Lesson Three",
      "Lesson Two",
      "Lesson One",
    ]);
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
    expect(screen.queryAllByRole("link")).toHaveLength(LESSONS.length);
    expect(screen.getAllByTestId("mark-complete")).toHaveLength(LESSONS.length);
  });

  it("hides coming-soon nodes when the curriculum is fully published", () => {
    renderSyllabus({ upcoming: 0 });
    expect(screen.queryByTestId("coming-soon-lessons")).not.toBeInTheDocument();
  });
});
