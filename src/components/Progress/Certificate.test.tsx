/**
 * Certificate — component tests (copy deck §7 + print behavior).
 *
 * The eligible certificate must render the recipient name, course name,
 * completion date, and exam score exactly; the print button must call
 * window.print(); and the print CSS (@page, print-color-adjust, .no-print
 * chrome) must be present so the navy frame + red seal survive paper.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Certificate from "./Certificate";

const PROPS = {
  recipientName: "Alex Morgan",
  courseName: "OmniStudio Developer Certification Prep",
  completedAt: "Aug 10, 2026",
  examScore: 78,
  totalLessons: 46,
  kind: "certification-prep" as const,
};

describe("Certificate", () => {
  beforeEach(() => {
    vi.stubGlobal("print", vi.fn());
  });

  it("renders the recipient name, course name, date, and exam score", () => {
    render(<Certificate {...PROPS} />);
    expect(screen.getByText("Alex Morgan")).toBeTruthy();
    // Appears in the page-head kicker AND the certificate title
    expect(screen.getAllByText("Certificate of Completion").length).toBeGreaterThanOrEqual(1);
    // Appears in the body AND the Course meta row
    expect(screen.getAllByText("OmniStudio Developer Certification Prep").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Aug 10, 2026")).toBeTruthy();
    expect(screen.getByText("78%")).toBeTruthy();
    // Body copy (§7) — course + lesson count
    expect(
      screen.getByText(/has successfully completed the .*curriculum — all 46 lessons/),
    ).toBeTruthy();
  });

  it("uses the copy-deck labels (§7)", () => {
    render(<Certificate {...PROPS} />);
    expect(screen.getByText("Adroit Consulting · Certified Training")).toBeTruthy();
    expect(screen.getByText("This certifies that")).toBeTruthy();
    expect(screen.getByText("Course")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Exam score")).toBeTruthy();
    expect(screen.getByText("Print certificate")).toBeTruthy();
  });

  it("prints when the Print certificate button is clicked", () => {
    render(<Certificate {...PROPS} />);
    fireEvent.click(screen.getByText("Print certificate"));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("includes print CSS: @page margin 0, print-color-adjust exact, seal SVG", () => {
    const { container } = render(<Certificate {...PROPS} />);
    const style = container.querySelector("style");
    expect(style?.textContent).toContain("@page");
    expect(style?.textContent).toContain("margin: 0");
    expect(style?.textContent).toContain("print-color-adjust: exact");
    expect(style?.textContent).toContain("-webkit-print-color-adjust: exact");
    // Seal is an inline SVG, no image file (NO image generation)
    expect(container.querySelector(".cert-seal svg")).toBeTruthy();
    expect(container.querySelectorAll(".cert-seal img").length).toBe(0);
  });

  it("hides the page head on print (chrome is no-print)", () => {
    const { container } = render(<Certificate {...PROPS} />);
    const head = container.querySelector(".print\\:hidden");
    expect(head).toBeTruthy();
  });

  it("exposes exactly one h1 — the certificate document title (a11y finding 3)", () => {
    const { container } = render(<Certificate {...PROPS} />);
    const h1s = container.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0]?.textContent).toContain("Certificate of Completion");
    // The on-screen page chrome ("Your certificate") must NOT be a heading —
    // the printable certificate is the single h1 so the printed view has a
    // proper heading structure.
    const h1 = h1s[0];
    expect(h1?.className).toContain("cert-title");
  });

  it("uses AA-passing gray-500 for cert chrome instead of gray-400 (a11y finding 4)", () => {
    const { container } = render(<Certificate {...PROPS} />);
    const style = container.querySelector("style");
    expect(style?.textContent).not.toContain("#9CA3AF");
    expect(style?.textContent).toContain("#6B7280");
  });
});

/**
 * Exam naming on the certificate (deliverables/learn-ux-exam-naming §B4).
 *
 * The certificate used to say "the timed certification exam" and "the cert prep
 * exam is passed" for EVERY course — including the eight course-completion ones
 * that are not certification prep at all. Both strings now come from
 * `examLabels(kind)`, so each kind must name only its own exam.
 */
describe("Certificate — exam naming is kind-aware", () => {
  const renderKind = (kind: "certification-prep" | "course-completion") => {
    const { container } = render(
      <Certificate {...PROPS} courseName="Agentic AI Foundations" kind={kind} />,
    );
    // Whitespace-normalise so JSX line breaks don't split a phrase.
    const text = (container.textContent ?? "").replace(/\s+/g, " ");
    return { container, text };
  };

  it("a course-completion certificate names the course completion exam", () => {
    const { text } = renderKind("course-completion");
    expect(text).toContain("the course completion exam is passed at 72% or higher");
    expect(text).toContain("all 46 lessons and the timed course completion exam.");
    // The old blanket phrase must be gone for a non-certification course.
    expect(text).not.toMatch(/certification exam/i);
    expect(text).not.toMatch(/cert prep exam/i);
  });

  it("a certification-prep certificate names the cert prep exam", () => {
    const { text } = renderKind("certification-prep");
    expect(text).toContain("the cert prep exam is passed at 72% or higher");
    expect(text).toContain("all 46 lessons and the timed cert prep exam.");
    expect(text).not.toMatch(/course completion exam/i);
  });

  it("keeps the printable document free of the old generic phrase (print CSS + body)", () => {
    const { container } = renderKind("course-completion");
    const style = container.querySelector("style")?.textContent ?? "";
    // The print stylesheet must not carry copy at all, and the printed document
    // (.certificate-print is what @media print renders) must name the kind.
    expect(style).not.toMatch(/certification prep/i);
    const doc = container.querySelector(".certificate-print");
    expect(doc?.textContent).toContain("course completion exam");
    expect(doc?.textContent).not.toMatch(/certification exam/i);
  });
});
