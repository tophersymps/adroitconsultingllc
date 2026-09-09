import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Adroit Consulting Blog | Insights on Salesforce, React & AI",
  description:
    "Insights on Salesforce, React, AI, and digital transformation to help your business scale smarter.",
  path: "/blog",
});

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
