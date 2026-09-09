import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

/**
 * /forgot-password — auth surface metadata (noindex, like /login).
 */
export const metadata: Metadata = buildMetadata({
  title: "Forgot password — Adroit Academy",
  description:
    "Request a password reset link for your Adroit Academy account.",
  path: "/forgot-password",
  noindex: true,
});

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
