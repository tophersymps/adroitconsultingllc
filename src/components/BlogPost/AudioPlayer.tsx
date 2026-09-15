"use client";

/**
 * AudioPlayer — in-article article-audio player (plan Phase 5).
 *
 * Three render states from `hasAudio` + auth (resolved via the existing useAuth
 * hook, not a prop — mirrors the repo's other client components):
 *
 *   1. no narration for this slug (hasAudio false)   -> renders null
 *   2. logged-out visitor                        -> locked "sign up to listen"
 *      card with a Link to /signup; NO <audio> (so no audio is ever fetched
 *      by a logged-out visitor) and NO working player.
 *   3. signed-in user                            -> native <audio controls
 *      src=/api/audio/<slug>> plus a 1x/1.25x/1.5x speed select wired to
 *      playbackRate. aria-label="Article audio player".
 *
 * Auth source-of-truth: src/lib/hooks/useAuth.ts (`user` after `!isLoading`),
 * same hook the header/menu use. Refresh on auth-changed events is handled
 * by the hook itself.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";

export interface AudioPlayerProps {
  slug: string;
  /**
   * True when this article has a narration (resolved server-side from the
   * generated src/data/audio.ts). The client only needs to know whether to
   * render the player — we deliberately do NOT pass the ArticleAudio object
   * (which carries the private storagePath) across the client boundary, so
   * the internal bucket key is never serialized into the served HTML.
   */
  hasAudio?: boolean;
}

const SPEEDS = [1, 1.25, 1.5] as const;

export default function AudioPlayer({ slug, hasAudio }: AudioPlayerProps) {
  const { user, isLoading } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState<number>(1);

  // Sync playbackRate whenever the selected speed changes.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  if (!hasAudio) return null;

  // Loading (or logged-out once resolved): show nothing until auth is known.
  // Only after `!isLoading` is `user` a definitive signed-in/out signal.
  if (isLoading) return null;

  if (!user) {
    return (
      <div className="my-6 flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-6 text-center dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]">
        <p className="text-sm font-semibold text-gray-800 dark:text-[var(--ink-primary)]">
          🎧 Listen to this article
        </p>
        <p className="text-xs text-gray-500 dark:text-[var(--ink-muted)]">
          Audio is a free perk for signed-in readers.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center rounded-full bg-navy px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-light"
        >
          Sign up to listen
        </Link>
      </div>
    );
  }

  return (
    <div className="my-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-[var(--ink-muted)]">
          Listen to this article
        </span>
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-[var(--ink-muted)]">
          <span>Speed</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            aria-label="Playback speed"
            className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs dark:border-[var(--border-default)] dark:bg-[var(--surface-sunken)] dark:text-[var(--ink-primary)]"
          >
            {SPEEDS.map((s) => (
              <option value={s} key={s}>
                {s === 1 ? "1x" : `${s}x`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <audio
        controls
        preload="none"
        className="w-full"
        aria-label="Article audio player"
        src={`/api/audio/${slug}`}
      />
    </div>
  );
}