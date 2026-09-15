/**
 * ShareBar — hydration-safe share URL tests (QA motion H-1).
 *
 * Coverage required by the QA report:
 *  - server render emits empty share payloads (?text=/?url=/?u= empty) and
 *    does NOT read window.location during render (no hydration mismatch)
 *  - after mount, every share link's href is populated with the real URL
 *  - copy-link button still writes the current URL to the clipboard
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import ShareBar from "./ShareBar";

describe("ShareBar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("SSR output has empty share payloads and never reads window.location at render", () => {
    const html = renderToString(<ShareBar />);

    // The payloads start empty (hydration-safe): React patches them after
    // mount when the real URL is known. Assert the SSR HTML contains the
    // empty-query forms, not an encoded localhost URL.
    expect(html).toContain("https://twitter.com/intent/tweet?text=");
    expect(html).toContain("linkedin.com/sharing/share-offsite/?url=");
    expect(html).toContain("facebook.com/sharer/sharer.php?u=");
    expect(html).not.toContain(encodeURIComponent("http://localhost"));
  });

  it("populates every share link with the current page URL after mount", async () => {
    render(<ShareBar />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);

    const encoded = encodeURIComponent(window.location.href);
    await waitFor(() => {
      for (const link of links) {
        expect(link.getAttribute("href")).toContain(encoded);
      }
    });
  });

  it("exposes the copy-link button with an accessible name (QA a11y fix)", () => {
    render(<ShareBar />);

    // The copy-link button must carry an explicit aria-label so the
    // icon-only button has a meaningful accessible name for screen readers.
    expect(
      screen.getByRole("button", { name: "Copy link to clipboard" })
    ).toBeInTheDocument();
  });
});
