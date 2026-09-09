import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Paywall from "@/components/Catalog/Paywall";

describe("Paywall AVAILABLE accent label (a11y t_919cfc83)", () => {
  const view = {
    courseName: "Test Course",
    gradient: "",
    peekLessonSlug: null,
    options: [
      { model: "one_time", label: "$299 one-time", actionable: true },
      { model: "granted", label: "Granted by admin", actionable: false },
    ],
  } as never;

  it("uses the paywall-scoped accent token (≥4.5:1 on navy), not --accent", () => {
    render(<Paywall view={view} seriesSlug="test-series" />);
    const available = screen.getByText("Available");
    expect(available.className).toContain("text-[var(--paywall-accent)]");
    expect(available.className).not.toContain("text-[var(--accent)]");
    // The informational row keeps its muted tone — unchanged.
    expect(screen.getByText("Info").className).toContain("text-white/60");
  });
});
