import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "/", priority: 1.0 },
    { path: "/platform-strategy", priority: 0.8 },
    { path: "/operational-intelligence", priority: 0.8 },
    { path: "/digital-experience", priority: 0.8 },
    { path: "/contact", priority: 0.7 },
    { path: "/privacy", priority: 0.3 },
  ];

  return routes.map(({ path, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority,
  }));
}
