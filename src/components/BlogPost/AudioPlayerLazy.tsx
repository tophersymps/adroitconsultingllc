"use client";

/**
 * AudioPlayerLazy — client boundary for the lazy-loaded AudioPlayer.
 *
 * The `/field-notes/[slug]` page is a Server Component; `next/dynamic` with
 * `ssr: false` must live in a client component (same pattern as
 * HubbleFieldLabClient). This keeps the ~6KB AudioPlayer client chunk OUT of
 * the JS bundle of the article pages with no narration: the page gates this
 * component on `audio` server-side, so the dynamic chunk is only fetched and
 * parsed on the articles that actually render a player. No hard article count
 * is stated here — `src/data/audio.ts` is generated and the backfill cron
 * grows the narrated set, so any fixed figure goes stale by construction.
 */
import dynamic from "next/dynamic";

const AudioPlayer = dynamic(() => import("@/components/BlogPost/AudioPlayer"), {
  ssr: false,
});

export interface AudioPlayerLazyProps {
  slug: string;
  hasAudio?: boolean;
  /** Passed through to AudioPlayer — see AudioPlayerProps.label. */
  label?: string;
}

export function AudioPlayerLazy({ slug, hasAudio, label }: AudioPlayerLazyProps) {
  return <AudioPlayer slug={slug} hasAudio={hasAudio} label={label} />;
}
