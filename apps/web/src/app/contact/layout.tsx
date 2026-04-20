import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Adroit Consulting. Share your goals and we'll respond with a focused recommendation within one business day.",
  openGraph: {
    title: "Contact | Adroit Consulting",
    description:
      "Start a conversation about Salesforce, automation, or web work for your growing business.",
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
