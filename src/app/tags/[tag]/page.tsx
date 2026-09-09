import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TagListingContent from "./TagListingContent";
import { getAllTagSlugs, getTagBySlug } from "@/lib/tags";
import { buildMetadata } from "@/lib/seo";

interface Props {
  params: Promise<{ tag: string }>;
}

export async function generateStaticParams(): Promise<{ tag: string }[]> {
  return getAllTagSlugs().map((slug) => ({ tag: slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params;
  const tagInfo = getTagBySlug(tag);
  if (!tagInfo) return {};

  return buildMetadata({
    title: `${tagInfo.tag} — Adroit Consulting Blog`,
    description: `Posts tagged with "${tagInfo.tag}" covering Salesforce, React, AI, and digital transformation insights.`,
    path: `/tags/${tag}`,
  });
}

export default async function TagPage({ params }: Props) {
  const { tag } = await params;
  const tagInfo = getTagBySlug(tag);
  if (!tagInfo) notFound();

  return <TagListingContent tagInfo={tagInfo} />;
}
