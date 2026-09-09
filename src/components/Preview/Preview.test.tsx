/**
 * DraftBadge / PreviewStrip / DraftLocked — draft-state preview component
 * tests (t_e1c8239e). Verifies kara's design semantics: role="status" on the
 * badge, role="region" on the strip, section aria-label + real <a> CTAs on
 * the locked card, and the two copy tiers.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DraftBadge from "./DraftBadge";
import PreviewStrip from "./PreviewStrip";
import DraftLocked from "./DraftLocked";

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

describe("DraftBadge", () => {
  it("renders the draft pill with role=status", () => {
    render(<DraftBadge status="draft" />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("Draft");
    expect(pill).toHaveClass("draft-badge");
    expect(pill).not.toHaveClass("is-published");
  });

  it("renders the published pill without the draft pulse", () => {
    render(<DraftBadge status="published" />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("Published");
    expect(pill).toHaveClass("is-published");
  });
});

describe("PreviewStrip", () => {
  it("renders a region labelled as the draft preview notice", () => {
    render(<PreviewStrip title="My Draft" status="draft" backHref="/blog" />);
    expect(
      screen.getByRole("region", { name: "Draft preview notice" }),
    ).toBeInTheDocument();
  });

  it("shows the draft title and a back link to /blog", () => {
    render(<PreviewStrip title="My Draft" status="draft" backHref="/blog" />);
    expect(screen.getByText("My Draft")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /Back to Blog/ });
    expect(back).toHaveAttribute("href", "/blog");
  });

  it("labels the back link for a learn series", () => {
    render(
      <PreviewStrip
        title="Lesson"
        status="draft"
        backHref="/learn/salesforce-architect"
      />,
    );
    expect(screen.getByRole("link", { name: /Back to Series/ })).toHaveAttribute(
      "href",
      "/learn/salesforce-architect",
    );
  });
});

describe("DraftLocked", () => {
  it("signed-out: shows the sign-in headline and a /login?next= CTA", () => {
    render(<DraftLocked state="signed-out" nextPath="/preview/blog/draft-x" />);
    expect(screen.getByRole("heading", { name: "Sign in to preview drafts" })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Sign in/ });
    expect(cta).toHaveAttribute(
      "href",
      "/login?next=%2Fpreview%2Fblog%2Fdraft-x",
    );
    expect(screen.getByRole("region") || screen.getByText(/PREVIEW/i)).toBeTruthy();
  });

  it("signed-out: exposes section aria-label", () => {
    render(<DraftLocked state="signed-out" nextPath="/preview/blog/draft-x" />);
    expect(
      screen.getByRole("region", { name: "Preview locked - sign in" }),
    ).toBeInTheDocument();
  });

  it("no-access: shows the BA copy and a mailto CTA (no fake button)", () => {
    render(<DraftLocked state="no-access" nextPath="/preview/blog/draft-x" />);
    expect(
      screen.getByRole("heading", { name: "This content is not yet available" }),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Contact the team/ });
    expect(cta).toHaveAttribute("href", expect.stringMatching(/^mailto:/));
  });

  it("no-access: exposes section aria-label", () => {
    render(<DraftLocked state="no-access" nextPath="/preview/blog/draft-x" />);
    expect(
      screen.getByRole("region", { name: "Preview locked - no access" }),
    ).toBeInTheDocument();
  });

  it("sanitizes a malicious nextPath (CWE-601)", () => {
    render(<DraftLocked state="signed-out" nextPath="https://evil.com" />);
    const cta = screen.getByRole("link", { name: /Sign in/ });
    // sanitizeRedirectPath falls back to /blog for external values.
    expect(cta).toHaveAttribute("href", "/login?next=%2Fblog");
  });
});
