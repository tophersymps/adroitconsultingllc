/**
 * RSS feed generator for Adroit Blog.
 *
 * Produces an RSS 2.0 XML feed containing the most recent posts.
 */

import { posts } from "@/data/posts";
import { siteConfig } from "./seo";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeCdata(str: string): string {
  return str.replace(/\]\]>/g, "]]]]><![CDATA[>");
}

export function generateFeedXml(): string {
  const blogUrl = `${siteConfig.url}${siteConfig.blogPath}`;
  const now = new Date().toUTCString();

  const items = posts
    .slice(0, 20)
    .map((post) => {
      const postUrl = escapeXml(`${blogUrl}/${post.slug}`);
      const pubDate = post.date
        ? new Date(post.date).toUTCString()
        : now;

      return `    <item>
      <title><![CDATA[${escapeCdata(post.title)}]]></title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <description><![CDATA[${escapeCdata(post.excerpt)}]]></description>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <category>${escapeXml(post.category)}</category>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${siteConfig.title}</title>
    <link>${blogUrl}</link>
    <description>${siteConfig.description}</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${blogUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}
