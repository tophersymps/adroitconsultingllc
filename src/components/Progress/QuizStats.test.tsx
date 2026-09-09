/**
 * QuizStats — component tests (QA F-3, F-1).
 *
 * The strip must render NOTHING until the stored quiz state has hydrated
 * (server + client first paint both empty), and only then show
 * "Quiz avg X% · N attempts" when attempts exist.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import QuizStats from "./QuizStats";

// QuizStats uses next/link (Link) and useAuth (fetch /api/auth/session).
// In unit tests, stub both so the strip renders its localStorage path.
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

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isLoading: false, refresh: vi.fn() }),
}));

const KEY = "adroit-blog:quiz:omni-studio-cert";

function seedAttempts(attemptCount: number, bestScore: number) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      attempts: [],
      total: 0,
      correct: 0,
      bestScore,
      attemptCount,
    }),
  );
}

describe("QuizStats", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders nothing for a user with no attempts (never invents stats)", () => {
    const { container } = render(<QuizStats seriesSlug="omni-studio-cert" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the strip only after hydration when attempts exist", async () => {
    seedAttempts(3, 100);
    render(<QuizStats seriesSlug="omni-studio-cert" />);

    // After hydration (effect flush) the stored stats render.
    expect(await screen.findByText(/Quiz avg 100% · 3 attempts/)).toBeInTheDocument();
  });

  it("renders a link variant pointing to the quiz page", async () => {
    seedAttempts(1, 82);
    render(<QuizStats seriesSlug="omni-studio-cert" />);

    const link = await screen.findByRole("link", { name: /Quiz avg 82% · 1 attempt/ });
    expect(link).toHaveAttribute("href", "/learn/omni-studio-cert/quiz");
  });
});
