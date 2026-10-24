/**
 * Root layout — the theme FOUC guard must not cost us hydration (QA R2-4 F4).
 *
 * The inline FOUC script in <head> runs before React hydrates and may add
 * `dark` to <html> when the visitor's stored preference (or OS setting) is
 * dark. That is the whole point of the script, but it also means the class
 * attribute the client sees legitimately differs from the server HTML, so the
 * element has to opt out of hydration warnings — otherwise React logs a
 * recoverable mismatch, re-renders the tree from scratch and drops the class
 * the guard just applied.
 *
 * This test pins both halves of that contract: the `suppressHydrationWarning`
 * opt-out on <html>, and the guard staying inline in <head> (moving it to an
 * effect or the body would run it after paint, which is a FOUC).
 */
import { describe, it, expect, vi } from "vitest";

/** Minimal structural view of a React element (no JSX-namespace plumbing). */
type ElementLike = {
  type: unknown;
  props: {
    children?: unknown;
    suppressHydrationWarning?: boolean;
    dangerouslySetInnerHTML?: { __html?: string };
  };
};

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter", className: "font-inter" }),
  Newsreader: () => ({ variable: "--font-display-serif", className: "font-serif" }),
}));

vi.mock("@/components/Theme/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/Analytics/AnalyticsInit", () => ({ default: () => null }));
vi.mock("@/components/CookieConsent", () => ({ default: () => null }));

import RootLayout from "./layout";

/** RootLayout is a plain function component — call it to inspect the tree. */
function renderLayout(): ElementLike {
  return RootLayout({
    children: <main id="main">content</main>,
  }) as unknown as ElementLike;
}

function childrenOf(node: ElementLike): ElementLike[] {
  const value = node.props.children;
  return (Array.isArray(value) ? value : [value]).filter(Boolean) as ElementLike[];
}

describe("app/layout — theme FOUC hydration guard", () => {
  it("marks <html> as hydration-tolerant so the pre-hydration theme class survives", () => {
    const html = renderLayout();
    expect(html.type).toBe("html");
    expect(html.props.suppressHydrationWarning).toBe(true);
  });

  it("still emits the FOUC guard inline in <head> (before hydration can run)", () => {
    const html = renderLayout();
    const head = childrenOf(html).find((child) => child.type === "head");
    expect(head).toBeDefined();

    const script = childrenOf(head as ElementLike).find((child) => child.type === "script");
    expect(script).toBeDefined();

    const source = String(script?.props.dangerouslySetInnerHTML?.__html ?? "");
    expect(source).toContain("adroit-theme");
    expect(source).toContain("classList.add('dark')");
  });
});
