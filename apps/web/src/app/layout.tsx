import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Adroit Consulting",
    template: "%s | Adroit Consulting",
  },
  description:
    "Salesforce consulting, business process automation, and enterprise web development.",
  icons: {
    icon: [
      { url: "/adroit-favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/adroit-favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/adroit-favicon.ico",
    apple: "/adroit-apple-touch-icon-180.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    images: [
      {
        url: "/adroit-og-image-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Adroit Consulting",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
