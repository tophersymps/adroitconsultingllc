import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Operational Intelligence",
  description:
    "Turn process complexity into operational advantage with intelligent automation, cross-system integration, AI-augmented workflows, and real-time operational analytics.",
  path: "/operational-intelligence",
});

export default function OperationalIntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
