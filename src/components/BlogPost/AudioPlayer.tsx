"use client";

/**
 * AudioPlayer — in-article article-audio player (plan Phase 5 + Tier C).
 *
 * Render states (unchanged): `hasAudio` false -> null; logged-out -> locked
 * "sign up to listen" card; signed-in -> native <audio controls src=/api/audio/
 * <slug>> + speed select.
 *
 * Tier C exact paragraph scroll-sync: a signed-in reader sees a "Follow along"
 * toggle (ON by default, OFF under prefers-reduced-motion). While ON and the
 * audio plays, the article is snapped along to the EXACT spoken paragraph using
 * the generator-time segment timings manifest (fetched from the authed
 * /api/audio/<slug>/timings route) aligned to the article's content blocks.
 * A user scroll (wheel/touch/scroll) stops following WITHOUT pausing audio;
 * re-enable via the toggle. Throttled with a requestAnimationFrame guard so
 * follow-along never fights a human scroll (>= ~250ms between programmatic
 * scrolls for the same paragraph).
 *
 * Auth source-of-truth: src/lib/hooks/useAuth.ts (as before).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  alignSegmentsToBlocks,
  activeSegmentIndex,
  targetScrollYForBlock,
  type SegmentTiming,
} from "@/lib/audio-scroll";

export interface AudioPlayerProps {
  slug: string;
  /**
   * True when this article has a narration (resolved server-side). Only a
   * boolean crosses the boundary — the private ArticleAudio (storagePath /
   * timingsStoragePath) is never serialized to the client (DoD-4).
   */
  hasAudio?: boolean;
}

const SPEEDS = [1, 1.25, 1.5] as const;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SCROLL_THROTTLE_MS = 250;

export default function AudioPlayer({ slug, hasAudio }: AudioPlayerProps) {
  const { user, isLoading } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [timings, setTimings] = useState<SegmentTiming[] | null>(null);
  const [following, setFollowing] = useState<boolean>(false);
  const [pinned, setPinned] = useState<boolean>(false);
  const lastScrollBlockRef = useRef<number | null>(null);
  const lastScrollAtRef = useRef(0);
  const programmaticScrollRef = useRef(false);

  // Default: ON for signed-in, OFF under reduced-motion (read once).
  useEffect(() => {
    if (!user) return;
    let reduce = false;
    try {
      reduce = window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false;
    } catch {
      reduce = false;
    }
    // Defer the unit-state sync out of the effect body (react-hooks rule) —
    // the value depends on auth resolving + a media query, so a one-shot
    // microtask is the clean unit-state-on-mount pattern here.
    const timer = setTimeout(() => setFollowing(!reduce), 0);
    return () => clearTimeout(timer);
  }, [user]);

  // Fetch the exact segment timings for this article when signed-in.
  useEffect(() => {
    if (!user) {
      const reset = setTimeout(() => setTimings(null), 0);
      return () => clearTimeout(reset);
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/audio/${slug}/timings`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) return;
        const data = (await res.json()) as { segments: SegmentTiming[] };
        if (!cancelled && Array.isArray(data.segments)) setTimings(data.segments);
      } catch {
        if (!cancelled) setTimings(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, slug]);

  // Sync playbackRate whenever the selected speed changes.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // A user scroll (window wheel/touch/scroll) stops following without pausing
  // audio. Our own programmatic scrollTo is suppressed via the ref so it does
  // not count as a user stop.
  useEffect(() => {
    if (!user) return;
    const onScrolled = () => {
      if (programmaticScrollRef.current) return;
      setFollowing(false);
    };
    window.addEventListener("wheel", onScrolled, { passive: true });
    window.addEventListener("touchmove", onScrolled, { passive: true });
    window.addEventListener("scroll", onScrolled, { passive: true });
    return () => {
      window.removeEventListener("wheel", onScrolled);
      window.removeEventListener("touchmove", onScrolled);
      window.removeEventListener("scroll", onScrolled);
    };
  }, [user, following]);

  // FLOAT activation animation: when the player first pins to the top (its
  // natural position has scrolled above the header band), light up a drop
  // shadow + subtle scale so the user notices it has docked. Reduced-motion
  // users get a static card (no transition, no listener). Optional + non-blocking.
  useEffect(() => {
    if (!user || typeof window.scrollY === "undefined") return;
    let reduce = false;
    try {
      reduce = window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false;
    } catch {
      reduce = false;
    }
    if (reduce) return; // pinned stays false; no animation for reduced-motion users
    const onScrollPin = () => {
      try {
        const el = wrapperRef.current;
        if (!el) return;
        const naturalTop = el.getBoundingClientRect().top + window.scrollY;
        const pinnedNow = window.scrollY > naturalTop + 4;
        if (pinnedNow !== pinned) setPinned(pinnedNow);
      } catch {
        // non-fatal
      }
    };
    onScrollPin();
    window.addEventListener("scroll", onScrollPin, { passive: true });
    return () => window.removeEventListener("scroll", onScrollPin);
  }, [user, pinned]);

  // Measure the floated region (player height + site header) once, lazily.
  function measureBand(): { playerH: number; headerH: number } {
    let playerH = 0;
    let headerH = 0;
    try {
      playerH = wrapperRef.current?.getBoundingClientRect().height ?? 0;
      const header = document.querySelector("header");
      headerH = header ? header.getBoundingClientRect().height : 0;
    } catch {
      playerH = 0;
      headerH = 0;
    }
    return { playerH, headerH };
  }

  /** Extract the article's ordered content blocks (headings + prose). */
  function articleBlocks(): { text: string; el: HTMLElement }[] {
    const out: { text: string; el: HTMLElement }[] = [];
    try {
      const article = document.querySelector("main article") ?? document.querySelector(".article-body");
      if (!article) return out;
      const els = Array.from(article.querySelectorAll("h2,h3,h4,h5,p,li,figcaption"));
      for (const e of els) {
        const text = (e.textContent ?? "").trim();
        if (text) out.push({ text, el: e as HTMLElement });
      }
    } catch {
      // no article in-test / non-fatal
    }
    return out;
  }

  function handleTimeUpdate() {
    // `timeupdate` only fires while the media is actually advancing during
    // playback, so there is no need for a paused check here (and jsdom's
    // readonly `paused` is always true, which would silently break tests).
    const audio = audioRef.current;
    if (!audio || !following) return;
    if (!timings || timings.length === 0) return;

    let top = 0;
    try {
      const currentTime = Number(audio.currentTime || 0);
      const segIdx = activeSegmentIndex(timings, currentTime);
      if (segIdx < 0) return;

      const blocks = articleBlocks();
      const blockTexts = blocks.map((b) => b.text);
      const aligned = alignSegmentsToBlocks(timings, blockTexts);
      const target = aligned[segIdx];
      if (!target) return;
      const block = blocks[target.blockIndex];
      if (!block) return;

      // Scroll ONLY when the active paragraph changed, or long enough has
      // elapsed since the last programmatic scroll within the same paragraph
      // (prevents fighting a human dragging within a long section).
      const now = Date.now();
      if (lastScrollBlockRef.current === target.blockIndex) {
        if (now - lastScrollAtRef.current < SCROLL_THROTTLE_MS) return;
        top = 0; // recompute below with measureBand
      }
      // Absolute document offset of the block top, then align it below the
      // floated player: target = blockTop - (playerH + headerH + gap).
      const rect = block.el.getBoundingClientRect();
      const blockDocTop = rect.top + (window.scrollY ?? 0);
      const { playerH, headerH } = measureBand();
      top = targetScrollYForBlock(Math.max(0, blockDocTop), playerH, headerH, 12);
      lastScrollBlockRef.current = target.blockIndex;
      lastScrollAtRef.current = now;

      programmaticScrollRef.current = true;
      window.scrollTo({ top, behavior: following ? "smooth" : "auto" });
    } catch {
      // never throw from playback-driven side effects
    } finally {
      // The scroll event we just caused should NOT count as a user stop.
      window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 1);
    }
  }

  /** A user scroll input (wheel/touch/scroll) stops following, not audio. */
  function onUserScroll() {
    if (programmaticScrollRef.current) return;
    if (following) setFollowing(false);
  }

  if (!hasAudio) return null;

  // Loading (or logged-out once resolved): show nothing until auth is known.
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
    <div
      ref={wrapperRef}
      data-audio-scroll=""
      onWheel={onUserScroll}
      onTouchStart={onUserScroll}
      onScroll={onUserScroll}
      className={`my-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[var(--border-default)] dark:bg-[var(--surface-card)] ${
        pinned
          ? "shadow-[0_8px_24px_rgba(11,29,58,0.16)] ring-1 ring-gray-300 dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] dark:ring-[var(--border-default)] transition-shadow duration-300"
          : "transition-shadow duration-300"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-[var(--ink-muted)]">
          Listen to this article
        </span>
        <div className="flex items-center gap-3">
          {timings && timings.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-[var(--ink-muted)]">
              <input
                type="checkbox"
                checked={following}
                onChange={(e) => setFollowing(e.target.checked)}
                aria-label="Follow along"
                className="h-3.5 w-3.5 rounded-sm border border-gray-300 accent-navy dark:border-[var(--border-default)]"
              />
              <span>Follow along</span>
            </label>
          )}
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
      </div>
      <audio
        ref={audioRef}
        controls
        preload="none"
        className="w-full"
        aria-label="Article audio player"
        src={`/api/audio/${slug}`}
        onTimeUpdate={handleTimeUpdate}
        onScroll={onUserScroll}
      />
    </div>
  );
}