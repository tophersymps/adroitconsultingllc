/**
 * page.test.tsx — /contact client success check (t_4e558b40, t_cff95740 finding 1).
 *
 * Regression lock for the client branch logic: `/api/contact` returns
 * `{ ok: true }` on success (ContactSubmitResult contract), so the client must
 * gate on `json.ok`, not `json.success`. Previously `!json.success` was always
 * true, making the "Thank you for your inquiry" success panel unreachable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Marketing chrome renders real HTML via framer-motion; stub it to keep the
// test focused on the contact form branch logic and avoid motion/effect deps.
vi.mock("@/components/Marketing/MarketingPage", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="marketing-page">{children}</div>
  ),
}));
vi.mock("@/components/Marketing/sections/HeroSection", () => ({
  default: () => <div data-testid="hero" />,
}));
vi.mock("@/components/Marketing/sections/SectionContainer", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="section">{children}</div>
  ),
}));
vi.mock("@/components/Marketing/effects/ScrollReveal", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="reveal">{children}</div>
  ),
}));
vi.mock("next/script", () => ({
  default: () => null,
}));

import Contact from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/contact client success check (t_4e558b40)", () => {
  it("shows the success panel when the API returns { ok: true }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<Contact />);
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    // Success panel becomes reachable — this is the regression being locked.
    expect(await screen.findByText("Thank you for your inquiry")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contact",
      expect.objectContaining({ method: "POST" }),
    );

    vi.unstubAllGlobals();
  });

  it("shows the error panel when the API returns { ok: false }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, error: "reCAPTCHA verification failed. Please try again.", status: 400 }),
      }),
    );

    const { container } = render(<Contact />);
    fireEvent.submit(container.querySelector("form")!);

    expect(
      await screen.findByText("reCAPTCHA verification failed. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Thank you for your inquiry")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
