import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

/**
 * /contact — marketing contact metadata.
 *
 * The page component is a client component ("use client" — it manages
 * form state and reCAPTCHA), so it cannot export `metadata`. This server
 * layout provides the page-specific title, description, canonical, and
 * og:url so the root layout's homepage canonical/og defaults do not leak
 * onto the contact page. Mirrors the /login layout precedent.
 */
export const metadata: Metadata = buildMetadata({
  title: "Contact Adroit Consulting",
  description:
    "Tell us about your Salesforce platform, operations, and digital experience needs. Our team will follow up to discuss how we can help.",
  path: "/contact",
});

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
