/**
 * AudioPlayer.test.tsx — locked / signed-in / unpublished render states
 * (plan Phase 5). useAuth is mocked at the module level (same pattern as
 * Header.test.tsx): a per-test auth state drives the three states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AudioPlayer from "./AudioPlayer";
import type { ArticleAudio } from "@/lib/audio/contracts";

const fixture: ArticleAudio = {
  slug: "agent-eval-infrastructure-2026",
  voice: "af_heart",
  storagePath: "blog/agent-eval-infrastructure-2026/af_heart.mp3",
};

let authState: { user: { id: string; email: string; isAdmin: boolean } | null; isLoading: boolean };

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

beforeEach(() => {
  authState = { user: null, isLoading: true };
});

describe("AudioPlayer", () => {
  it("renders nothing when the article has no narration", () => {
    const { container } = render(<AudioPlayer slug="unpublished" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while auth is still loading (no flash of the wrong state)", () => {
    const { container } = render(<AudioPlayer slug={fixture.slug} audio={fixture} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the locked sign-up card to a logged-out visitor, with NO working audio", () => {
    authState = { user: null, isLoading: false };
    render(<AudioPlayer slug={fixture.slug} audio={fixture} />);

    expect(screen.getByText(/Listen to this article/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign up to listen/i })).toHaveAttribute(
      "href",
      "/login",
    );
    // The locked state must not expose a playable <audio> — a logged-out
    // visitor must never fetch /api/audio/<slug>.
    expect(document.querySelector("audio")).toBeNull();
  });

  it("renders the native player with src=/api/audio/<slug> for a signed-in reader", () => {
    authState = {
      user: { id: "u1", email: "a@b.c", isAdmin: false },
      isLoading: false,
    };
    render(<AudioPlayer slug={fixture.slug} audio={fixture} />);

    const audio = document.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute("src")).toBe(`/api/audio/${fixture.slug}`);
    expect(audio!).toHaveAttribute("aria-label", "Article audio player");
  });

  it("exposes a speed control for the signed-in player", () => {
    authState = {
      user: { id: "u1", email: "a@b.c", isAdmin: false },
      isLoading: false,
    };
    render(<AudioPlayer slug={fixture.slug} audio={fixture} />);

    // A labelled speed select is present with 1x / 1.25x / 1.5x options.
    const speed = screen.getByLabelText("Playback speed");
    expect(speed).toBeInTheDocument();
    const options = Array.from(speed.querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(options).toEqual(["1x", "1.25x", "1.5x"]);
  });
});