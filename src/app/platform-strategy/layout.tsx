import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Salesforce Platform Strategy",
  description:
    "Salesforce implementation, architecture, and optimization, from org design and integrations to AI readiness and Agentforce planning.",
  path: "/platform-strategy",
});

export default function PlatformStrategyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
