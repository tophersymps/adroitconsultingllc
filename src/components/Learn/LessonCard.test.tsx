/**
 * LessonCard — motion posture tests (QA motion LOW).
 *
 * Coverage required by the QA report:
 *  - hover motion animates transform, not a layout property (no hover:pl-4,
 *    no transition-all that would repaint layout)
 *  - motion is CSS-driven (transition/transform classes), which the global
 *    prefers-reduced-motion block neutralises — no JS-driven animation
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LessonCard from "./LessonCard";
import { LearnLesson } from "@/data/types";

const LESSON: LearnLesson = {
  slug: "agent-loop",
  title: "The Agent Loop",
  series: "ai-agents",
  lesson: 1,
  excerpt: "Perceive, reason, act, observe.",
  date: "August 1, 2026",
  author: "Adroit Consulting",
  readTime: "5 min read",
  tags: ["ai"],
};

describe("LessonCard", () => {
  it("hover motion uses transform, not a layout property (no hover:pl-4)", () => {
    render(<LessonCard lesson={LESSON} totalLessons={5} />);
    const link = screen.getByRole("link");
    const cls = link.getAttribute("class") ?? "";

    // The previous hover:pl-4 animated padding — a layout property that
    // forces reflow every frame. The fix moves the same visual shift onto
    // transform (translate-x), which is composited on the GPU.
    expect(cls).not.toContain("hover:pl-4");
    expect(cls).toContain("hover:translate-x-1");
    // transition is scoped to background-color + transform, not `all`
    expect(cls).not.toContain("transition-all");
    expect(cls).toContain("transition-[background-color,transform]");
  });
});
