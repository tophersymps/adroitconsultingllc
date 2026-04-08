import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
