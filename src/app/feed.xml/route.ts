import { generateFeedXml } from "@/lib/feed";

export async function GET() {
  const xml = generateFeedXml();

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}
