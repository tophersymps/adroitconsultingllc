/**
 * CertReadiness — the series-header readiness rollup (A4).
 *
 * Two guarantees this locks down:
 *  - it renders NOTHING while the shared tier read has not landed (hydration
 *    gate) and nothing on a guest/unavailable response — it never invents
 *    stats;
 *  - on data it renders the real "Lessons · Checks · Exam best" line and the
 *    weighted readiness percentage (ADR-107: 40 / 30 / 30).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { TierProgress } from "@/shared/contracts";
import { resetTierProgressCache } from "@/lib/hooks/useTierProgress";
import CertReadiness from "./CertReadiness";

const SERIES = "omni-studio-cert";

const TIERS: TierProgress = {
  lessons: { completed: 10, total: 50 },
  checks: [
    { n: 1, bestScore: 90, attempts: 1, passed: true },
    { n: 2, bestScore: 0, attempts: 0, passed: false },
  ],
  exam: { bestScore: 80, attempts: 1, passed: true },
  unlocked: false,
};

describe("CertReadiness", () => {
  beforeEach(() => {
    resetTierProgressCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing while the tier read is null (hydration gate)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    const { container } = render(<CertReadiness series={SERIES} />);

    // First paint: server HTML and this render must agree — no stats at all.
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the tier read fails (guest / degraded route)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("tiers unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<CertReadiness series={SERIES} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Still empty after the read settled to null — never invent stats.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when the rollup carries no progress at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lessons: { completed: 0, total: 46 },
          checks: [{ n: 1, bestScore: 0, attempts: 0, passed: false }],
          exam: { bestScore: 0, attempts: 0, passed: false },
          unlocked: false,
        }),
      }),
    );

    const { container } = render(<CertReadiness series={SERIES} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders the real stats and weighted readiness on data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => TIERS }),
    );

    render(<CertReadiness series={SERIES} />);

    // lessons 10/50 = 20% · checks 1/2 = 50% · exam best 80%
    // → 20*0.4 + 50*0.3 + 80*0.3 = 8 + 15 + 24 = 47
    await screen.findByText(/Lessons 10\/50 · Checks 1\/2 · Exam best 80%/);
    expect(screen.getByText("47%")).toBeInTheDocument();
    expect(screen.getByText("Certification readiness")).toBeInTheDocument();
  });

  it("keeps the onGradient treatment for the hero placement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => TIERS }),
    );

    const { container } = render(<CertReadiness series={SERIES} onGradient />);

    await screen.findByText(/Lessons 10\/50/);
    expect(container.firstElementChild?.className).toContain("bg-black/55");
  });
});
