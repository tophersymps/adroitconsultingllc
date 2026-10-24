/**
 * useProgressSummary — hydration contract (QA R2-4 F4).
 *
 * The merged progress set feeds aggregate counters ("Read N") and bars. It is
 * built partly from localStorage, which the server cannot read, so computing
 * it during the first render made the client's text disagree with the server
 * HTML (React #418 text mismatch on /field-notes and /atlas). The contract this
 * test pins: the first render is the empty merge on BOTH sides, and stored
 * progress is adopted after mount.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useProgressSummary } from "./useProgressSummary";

function Probe({ keys }: { keys: string[] }) {
  const { merge } = useProgressSummary(keys, []);
  return <span data-testid="count">{merge.read.size}</span>;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("adroit-blog:read:blog/already-read", "true");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  );
});

describe("useProgressSummary hydration", () => {
  it("renders the empty merge on the server", () => {
    const html = renderToString(<Probe keys={["blog/already-read"]} />);
    expect(html).toContain(">0<");
  });

  it("adopts stored progress only after mount", async () => {
    render(<Probe keys={["blog/already-read"]} />);
    // The mounted effect runs inside act() → the stored flag is picked up.
    expect(await screen.findByTestId("count")).toHaveTextContent("1");
  });
});
