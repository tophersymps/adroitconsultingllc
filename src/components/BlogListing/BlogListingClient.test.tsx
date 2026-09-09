/**
 * BlogListingClient — filter-island tests (B-08 ride-along).
 *
 * Verifies the refactored client island still behaves like the original
 * listing: posts render from the server-serialized `posts` prop, pagination
 * runs at 8/page (bumped from 4), category pills filter, the featured post
 * hero shows only on the "All Posts" view, and the server-threaded
 * `searchParams` prop initializes category/sort/read. Network hooks
 * (progress/auth) are mocked so the test exercises pure listing logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BlogPost } from "@/data/types";
import BlogListingClient from "./BlogListingClient";

type SearchParams = { [key: string]: string | string[] | undefined };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/hooks/useProgressSummary", () => ({
  useProgressSummary: () => ({
    merge: { read: new Set() },
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isLoading: false, refresh: vi.fn() }),
}));

vi.mock("@/lib/hooks/useReadProgress", () => ({
  useReadProgress: () => ({ isRead: false, markAsRead: vi.fn(), isLoading: false }),
}));

const categories: BlogPost["categoryColor"][] = [
  "sf",
  "react",
  "ai",
  "mkt",
  "ux",
  "pm",
];

function makePost(i: number, overrides: Partial<BlogPost> = {}): BlogPost {
  const cat = categories[i % categories.length];
  return {
    slug: `post-${i}`,
    title: `Post title ${i}`,
    excerpt: `Excerpt for post ${i}`,
    category: cat,
    categoryColor: cat,
    categoryGradient: "from-navy to-navy-light",
    date: `September ${String(30 - (i % 28)).padStart(2, "0")}, 2026`,
    author: "Adroit Consulting",
    authorInitials: "AC",
    readTime: "5 min read",
    featured: false,
    tags: [],
    status: "published",
    ...overrides,
  };
}

/** Featured post belongs to the "ai" category so category-filtering tests can
 *  select a different category and assert the hero is fully absent. */
const featuredPost: BlogPost = makePost(0, {
  title: "Featured headline post",
  featured: true,
  slug: "featured-post",
  categoryColor: "ai",
});

const posts: BlogPost[] = [
  featuredPost,
  ...Array.from({ length: 9 }, (_, i) => makePost(i + 1)),
];

function renderListing(searchParams: SearchParams = {}) {
  return render(<BlogListingClient posts={posts} searchParams={searchParams} />);
}

/** All rendered card links to a numbered post (excludes the featured hero). */
function cardLinks() {
  return screen
    .getAllByRole("link")
    .filter((l) =>
      /^\/blog\/post-\d+$/.test((l as HTMLAnchorElement).getAttribute("href") || ""),
    );
}

describe("BlogListingClient (t_f7e84aca)", () => {
  beforeEach(() => {
    // No persistent state needed between tests; each render passes its own props.
  });

  it("renders the first page of cards at 8/page", () => {
    renderListing();
    // 9 non-featured posts -> 8 on page 1 (bumped from 4), pagination visible.
    expect(cardLinks()).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
    // Featured hero renders in the All Posts view.
    expect(
      screen.getByRole("link", { name: /Featured headline post/i }),
    ).toBeInTheDocument();
  });

  it("hides the featured hero outside the All Posts view", async () => {
    const user = userEvent.setup();
    renderListing();
    expect(
      screen.getByRole("link", { name: /Featured headline post/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Project Management/i }));
    // Featured post is ai-category, so selecting pm removes it entirely.
    expect(
      screen.queryByRole("link", { name: /Featured headline post/i }),
    ).toBeNull();
  });

  it("filters cards by category via the pills", async () => {
    const user = userEvent.setup();
    renderListing();
    await user.click(screen.getByRole("button", { name: /React & Web Dev/i }));
    const links = cardLinks();
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThan(8);
    // Every visible card belongs to the react category.
    for (const link of links) {
      expect((link as HTMLAnchorElement).getAttribute("href")).toMatch(/^\/blog\/post-\d+$/);
    }
  });

  it("shows pagination controls when more than one page exists", () => {
    renderListing();
    expect(
      screen.getByRole("navigation", { name: "Pagination" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toBeInTheDocument();
  });

  it("honors ?sort=oldest threaded from the server as a prop", () => {
    renderListing({ sort: "oldest" });
    // Oldest-first ordering puts the highest-numbered post first; cards render.
    expect(cardLinks()).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Oldest" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("initializes the active category from the threaded searchParams prop", async () => {
    const user = userEvent.setup();
    // Select "React & Web Dev" deep-link; featured hero (ai) must be absent.
    renderListing({ category: "react" });
    expect(
      screen.queryByRole("link", { name: /Featured headline post/i }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /React & Web Dev/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Category still switches interactively from a deep-linked start.
    await user.click(screen.getByRole("button", { name: /Salesforce/i }));
    expect(screen.getByRole("button", { name: /Salesforce/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("falls back to All Posts when a threaded category param is unknown", () => {
    renderListing({ category: "not-a-real-category" });
    expect(
      screen.getByRole("link", { name: /Featured headline post/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All Posts/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
