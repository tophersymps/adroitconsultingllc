import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Categories | Field Notes",
  description:
    "Browse our content by topic — Salesforce, React & Web Dev, AI & Consulting, and Marketing.",
  path: "/blog/categories",
});

export default function CategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
