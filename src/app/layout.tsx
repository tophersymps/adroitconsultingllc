import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { siteConfig, buildMetadata } from "@/lib/seo";
import { ThemeProvider } from "@/components/Theme/ThemeProvider";
import AnalyticsInit from "@/components/Analytics/AnalyticsInit";
import CookieConsent from "@/components/CookieConsent";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const newsreader = Newsreader({
  variable: "--font-display-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  ...buildMetadata({
    title: siteConfig.title,
    description: siteConfig.description,
    path: "/",
  }),
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
    ...(buildMetadata({
      title: siteConfig.title,
      description: siteConfig.description,
      path: "/",
    }).openGraph || {}),
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

/** FOUC guard — apply persisted/OS theme to <html> before hydration. */
function themeFoucScript() {
  return `(function(){try{var p=JSON.parse(localStorage.getItem('adroit-theme')||'{"mode":"light"}');var m=(p&&p.v===2)?(p.mode||'light'):'light';var dark=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark)document.documentElement.classList.add('dark');}catch(e){}})();`;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeFoucScript() }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <AnalyticsInit />
          <CookieConsent />
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
