/**
 * PostCardWithRead — client wrapper that wires the real read state
 * (localStorage + Supabase merge via useReadProgress) into PostCard.
 *
 * The blog listing renders cards in a loop, so hooks can't be called
 * there directly — this per-card component is the hook boundary
 * (design brief §4.1 read/unread dimming).
 *
 * SSR/layout-shift note (B-08 fix, t_66f1d65c): the full PostCard is ALWAYS
 * rendered — never a skeleton gated on `isLoading`. `useReadProgress`
 * initializes `isRead` to `false` on both the server render and the client's
 * first paint, so the post content (title, excerpt, image, meta) is present
 * in the initial SSR HTML and hydrates without mismatch. Read-dimming and the
 * check badge are a client-only progressive enhancement that applies after
 * hydration once the read state resolves.
 */
"use client";

import { BlogPost } from "@/data/types";
import { useReadProgress } from "@/lib/hooks/useReadProgress";
import PostCard from "./PostCard";

interface PostCardWithReadProps {
  post: BlogPost;
}

export default function PostCardWithRead({ post }: PostCardWithReadProps) {
  // Canonical read key matches MarkAsRead: `blog/<slug>`
  const { isRead } = useReadProgress(`blog/${post.slug}`, "blog");

  return <PostCard post={post} read={isRead} />;
}
