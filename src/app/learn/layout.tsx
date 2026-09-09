import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Learn | Adroit Consulting",
  description:
    "Structured, sequence-aware learning paths on Salesforce architecture and agentic AI implementation — published daily, read in order.",
  path: "/learn",
});

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
