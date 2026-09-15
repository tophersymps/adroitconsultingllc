"use client";

/**
 * AudioPlayerLazy — client boundary for the lazy-loaded AudioPlayer.
 *
 * The `/field-notes/[slug]` page is a Server Component; `next/dynamic` with
 * `ssr: false` must live in a client component (same pattern as
 * HubbleFieldLabClient). This keeps the ~6KB AudioPlayer client chunk OUT of
 * the JS bundle of the ~86 article pages with no narration: the page gates
 * this component on `audio` server-side, so the dynamic chunk is only fetched
 * and parsed on the 5 pilot articles that actually render a player.
 */
import dynamic from "next/dynamic";

const AudioPlayer = dynamic(() => import("@/components/BlogPost/AudioPlayer"), {
  ssr: false,
});

export interface AudioPlayerLazyProps {
  slug: string;
  hasAudio?: boolean;
}

export function AudioPlayerLazy({ slug, hasAudio }: AudioPlayerLazyProps) {
  return <AudioPlayer slug={slug} hasAudio={hasAudio} />;
}
