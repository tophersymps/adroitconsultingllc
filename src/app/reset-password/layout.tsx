import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

/**
 * /reset-password — auth surface metadata (noindex, like /login).
 */
export const metadata: Metadata = buildMetadata({
  title: "Set a new password — Adroit Academy",
  description: "Set a new password for your Adroit Academy account.",
  path: "/reset-password",
  noindex: true,
});

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
