/**
 * RSS feed generator for Adroit Blog.
 *
 * Produces an RSS 2.0 XML feed containing the most recent posts.
 */

import { posts } from "@/data/posts";
import { siteConfig } from "./seo";

export function generateFeedXml(): string {
  const blogUrl = `${siteConfig.url}${siteConfig.blogPath}`;
  const now = new Date().toUTCString();

  const items = posts
    .slice(0, 20)
    .map((post) => {
      const postUrl = `${blogUrl}/${post.slug}`;
      const pubDate = post.date
        ? new Date(post.date).toUTCString()
        : now;

      return `    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <description><![CDATA[${post.excerpt}]]></description>
      <pubDate>${pubDate}</pubDate>
      <category>${post.category}</category>
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
