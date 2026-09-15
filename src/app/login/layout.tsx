import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

/**
 * /login — auth page metadata.
 *
 * The page component is a client component ("use client" — it needs
 * useSearchParams/useState), so it cannot export `metadata`. This server
 * layout provides the page-specific title/canonical and noindexes the auth
 * surface (it is gated content — sitemap already excludes /login, and the
 * root layout's homepage canonical must not leak onto it).
 */
export const metadata: Metadata = buildMetadata({
  title: "Sign in — Adroit Academy",
  description:
    "Sign in to sync your reading progress, completions, and quiz scores across devices.",
  path: "/login",
  noindex: true,
});

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
