/**
 * PostCardWithRead — SSR-safe card tests (B-08 fix, t_66f1d65c).
 *
 * Regression guard for lara's finding (t_62d158fb): the 8-card grid was
 * rendering as `animate-pulse` skeletons during SSR because PostCardWithRead
 * gated the whole card on `useReadProgress`'s `isLoading` (which is `true`
 * until a client-side effect resolves). The fix renders the full PostCard
 * unconditionally so post titles/excerpts appear in the initial HTML; the
 * read state is a client-only progressive enhancement that defaults to
 * unread on both SSR and first client paint (hydration-safe).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { BlogPost } from "@/data/types";
import PostCardWithRead from "./PostCardWithRead";

vi.mock("@/lib/hooks/useReadProgress", () => ({
  useReadProgress: () => ({ isRead: false, markAsRead: vi.fn(), isLoading: true }),
}));

const post: BlogPost = {
  slug: "ssr-safe-post",
  title: "SSR Safe Post Title",
  excerpt: "This excerpt must be in the initial HTML.",
  category: "Salesforce",
  categoryColor: "sf",
  categoryGradient: "from-sky to-blue-600",
  date: "September 1, 2026",
  author: "Adroit Consulting",
  authorInitials: "AC",
  readTime: "5 min read",
  featured: false,
  tags: [],
  status: "published",
};

describe("PostCardWithRead (t_66f1d65c)", () => {
  it("renders the full card content even while the read hook is still loading (isLoading=true)", () => {
    // The mock returns isLoading:true — the old code would render a skeleton
    // here. The fixed code renders PostCard regardless.
    render(<PostCardWithRead post={post} />);
    expect(
      screen.getByRole("heading", { level: 3, name: "SSR Safe Post Title" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/This excerpt must be in the initial HTML/)).toBeInTheDocument();
    // No skeleton blocks should be present.
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("renders the post title in the SSR string output (server-rendered DOM, not only flight payload)", () => {
    const html = renderToString(<PostCardWithRead post={post} />);
    expect(html).toContain("SSR Safe Post Title");
    expect(html).toContain("This excerpt must be in the initial HTML");
    // No animate-pulse skeleton in the server markup.
    expect(html).not.toContain("animate-pulse");
  });
});
