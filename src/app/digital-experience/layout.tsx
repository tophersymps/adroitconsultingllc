import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Digital Experience",
  description:
    "Build digital experiences that earn trust, drive conversion, and connect directly to your operational systems, with AI-enhanced personalization and performance.",
  path: "/digital-experience",
});

export default function DigitalExperienceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
