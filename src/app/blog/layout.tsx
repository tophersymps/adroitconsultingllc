import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Field Notes | Adroit Consulting",
  description:
    "Insights on Salesforce, React, AI, and digital transformation from the Adroit team.",
  path: "/blog",
});

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
