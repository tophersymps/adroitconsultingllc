/**
 * SEO configuration for Adroit Consulting Blog
 *
 * Site-wide defaults and per-page metadata helpers.
 */

export const siteConfig = {
  name: "Adroit Consulting",
  title: "Adroit Consulting",
  description:
    "Salesforce platform strategy, operational intelligence, and AI-enhanced digital experiences for growing businesses.",
  url: "https://adroit.io",
  blogPath: "/blog",
  logo: "/adroit-logo-fullcolor-256.png",
  defaultOgImage: "/adroit-og-image-1200x630.png",
  social: {
    twitter: "@adroitconsult",
  },
} as const;

export interface PageSEO {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  publishedTime?: string;
  tags?: string[];
  noindex?: boolean;
}

export function buildMetadata(page: PageSEO) {
  const url = `${siteConfig.url}${page.path}`;
  const ogImagePath = page.ogImage || siteConfig.defaultOgImage;
  const imageUrl = `${siteConfig.url}${ogImagePath}`;
  const images = [{ url: imageUrl, width: 1200, height: 630 }];

  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    metadataBase: new URL(siteConfig.url),
    openGraph: {
      title: page.title,
      description: page.description,
      url,
      siteName: siteConfig.name,
      type: "article" as const,
      images,
      ...(page.publishedTime ? { publishedTime: page.publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image" as const,
      title: page.title,
      description: page.description,
      images: [imageUrl],
    },
    robots: page.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}
