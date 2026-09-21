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
 * A user scroll (wheel/touch/scroll-key) stops following WITHOUT pausing audio;
 * re-enable via the toggle. Our own programmatic smooth-scroll is suppressed
 * via a settle window (scrollend / no-scroll-for-150ms) so it is not misread as
 * a user stop; the wall-clock cap is only a stall guard and sits far above any
 * real smooth-scroll burst. The page scrolls only when the active spoken
 * paragraph changes (never re-scrolls within the same paragraph).
 *
 * Auth source-of-truth: src/lib/hooks/useAuth.ts (as before).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  alignSegmentsToBlocks,
  activeSegmentIndex,
  targetScrollYForBlock,
  type AlignedBlock,
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
  /**
   * What the narrated content is called, for the player's title + aria-label.
   * Blog articles default to "article"; the Learn lesson page passes "lesson"
   * so its player reads "Listen to this lesson".
   */
  label?: string;
}

const SPEEDS = [1, 1.25, 1.5] as const;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
// Suppression window for our OWN programmatic scroll: hold until the smooth
// scroll settles. `scrollend` ends it immediately where supported; otherwise a
// "no scroll event for 150ms" settle window (extended by each in-flight event)
// applies. Those two signals are the real end-of-suppression triggers — the
// wall-clock cap below is ONLY a wedge guard, so it must outlast every real
// animation. Chrome's smooth-scroll event burst scales with distance: measured
// 731ms / 768ms / 851ms for an ordinary one-screen (~1000px) jump and 1515ms
// for a three-screen jump, so the former 800ms cap expired MID-animation and
// the next event from our own scroll was read as a user scroll -> the toggle
// un-checked itself (t_a34614a1). 4000ms is above any plausible animation.
const SCROLL_SETTLE_MS = 150;
const SCROLL_SUPPRESS_CAP_MS = 4000;
// Animation-start grace (ms): how long suppression survives WITHOUT having
// absorbed a single `scroll` event from the animation it just started. Chrome's
// FIRST event for a smooth document scroll is not synchronous with the
// `scrollTo` call: measured live 158.8 / 184.7 / 205.3 / 306.6 ms, and 244.2 ms
// for a bare probe in a visible, focused, unthrottled tab. A 150 ms window armed
// at suppression start therefore expired BEFORE the animation had emitted
// anything, its first event landed on the post-suppression path, and the toggle
// un-checked itself on our own scroll (t_8ef99cf7). Until one event has been
// absorbed there is no inter-event cadence to measure, so the window must cover
// the browser's scroll-start latency; the moment an event is absorbed the 150 ms
// no-scroll window becomes the real settle test. 1500 ms is ~5x the worst
// latency measured, and errs high by design (only a stalled animation waits this
// long, and a stalled animation would not emit the events that matter).
const SCROLL_START_GRACE_MS = 1500;
// How close to the `top` we last asked `scrollTo` for (px) a post-suppression
// `scroll` event must land to still count as the tail of our own animation.
const SCROLL_TAIL_EPSILON_PX = 2;

/** Monotonic-ish timestamp in ms from the same clock the scroll handler uses. */
function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export default function AudioPlayer({ slug, hasAudio, label = "article" }: AudioPlayerProps) {
  const { user, isLoading } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [timings, setTimings] = useState<SegmentTiming[] | null>(null);
  const [following, setFollowing] = useState<boolean>(false);
  const [pinned, setPinned] = useState<boolean>(false);
  const lastScrollBlockRef = useRef<number | null>(null);
  // Boolean gate: true while OUR programmatic smooth-scroll is still settling.
  // Read+written by the scroll listener and beginProgrammaticScroll only — never
  // cleared by a 1ms timer (the bug this file fixes): a real smooth scroll fires
  // scroll events for hundreds of ms, so a timer guard must span the settle
  // window, not outlive the first event.
  const programmaticScrollRef = useRef(false);
  // Settle-window timers for the suppression (see SCROLL_SETTLE_MS/CAP_MS).
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Current scrollend handler so the listener can be removed deterministically.
  const scrollEndHandlerRef = useRef<EventListener | null>(null);
  // The `top` we last asked `window.scrollTo` for, and when the last scroll
  // event absorbed by the suppression window arrived. Together they recognise
  // the tail of our own smooth scroll — an event that lands just after
  // suppression ended, still at the offset we were animating to — so a signal
  // firing a frame early can never make our own scroll look like user input.
  const lastProgrammaticTargetRef = useRef<number | null>(null);
  const lastSuppressedScrollAtRef = useRef<number>(0);
  // When the current programmatic scroll was started. Bounds the "our animation
  // is still travelling toward our target" rescue below (t_8ef99cf7).
  const programmaticScrollStartedAtRef = useRef<number>(0);
  /**
   * Cache of the block alignment so ~4x/s `timeupdate` ticks don't re-run the
   * DOM query (`articleBlocks`) + the greedy O(segments x blocks) alignment for
   * a paragraph that hasn't changed. Invalidated when the slug, the timings
   * array, or the article elements change — everything is stable for the life
   * of a single article, so one alignment build serves all its ticks.
   */
  const alignmentCacheRef = useRef<{
    slug: string;
    timings: SegmentTiming[] | null;
    blocks: { text: string; el: HTMLElement }[];
    aligned: AlignedBlock[];
  } | null>(null);

  // End the programmatic-scroll suppression: clear the settle/cap timers, remove
  // the scrollend listener, and drop the gate back to false. Pure ref mutation —
  // stable across renders.
  const endProgrammaticScroll = useCallback(() => {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (capTimerRef.current !== null) {
      clearTimeout(capTimerRef.current);
      capTimerRef.current = null;
    }
    if (scrollEndHandlerRef.current && window.removeEventListener) {
      window.removeEventListener("scrollend", scrollEndHandlerRef.current);
      scrollEndHandlerRef.current = null;
    }
    programmaticScrollRef.current = false;
  }, []);

  // Begin the suppression window before a programmatic scrollTo. Suppressed
  // until the scroll settles: scrollend where supported, else "no scroll event
  // for SCROLL_SETTLE_MS" (each in-flight scroll event in the effect's onScroll
  // re-arms it), hard-capped at SCROLL_SUPPRESS_CAP_MS. A wheel/touch/key input
  // during the window calls endProgrammaticScroll directly.
  //
  // Arm the settle timer with the window that matches the state of THIS scroll:
  // before the first event has been absorbed the browser may not have emitted
  // anything yet, so only the animation-start grace is meaningful; afterwards
  // the inter-event window is the real settle test (t_8ef99cf7).
  const armSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(
      endProgrammaticScroll,
      lastSuppressedScrollAtRef.current === 0 ? SCROLL_START_GRACE_MS : SCROLL_SETTLE_MS,
    );
  }, [endProgrammaticScroll]);

  const beginProgrammaticScroll = useCallback(() => {
    endProgrammaticScroll();
    programmaticScrollRef.current = true;
    programmaticScrollStartedAtRef.current = nowMs();
    // No event of THIS animation has been absorbed yet -> the first timer must
    // span the browser's scroll-start latency, not the 150 ms inter-event window.
    lastSuppressedScrollAtRef.current = 0;
    scrollEndHandlerRef.current = () => endProgrammaticScroll();
    window.addEventListener("scrollend", scrollEndHandlerRef.current);
    armSettleTimer();
    capTimerRef.current = setTimeout(endProgrammaticScroll, SCROLL_SUPPRESS_CAP_MS);
  }, [endProgrammaticScroll, armSettleTimer]);

  // Absorb a `scroll` event we recognise as our own animation and restart the
  // suppression window from it. If suppression had already ended (the rescue
  // path) re-open it so the rest of the burst is covered too — bounded by the
  // same stall-guard cap, so it can never wedge.
  const absorbProgrammaticScroll = useCallback(
    (at: number) => {
      lastSuppressedScrollAtRef.current = at;
      if (!programmaticScrollRef.current) {
        programmaticScrollRef.current = true;
        if (!scrollEndHandlerRef.current) {
          scrollEndHandlerRef.current = () => endProgrammaticScroll();
          window.addEventListener("scrollend", scrollEndHandlerRef.current);
        }
        if (capTimerRef.current === null) {
          capTimerRef.current = setTimeout(endProgrammaticScroll, SCROLL_SUPPRESS_CAP_MS);
        }
      }
      armSettleTimer();
    },
    [armSettleTimer, endProgrammaticScroll],
  );

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
      const reset = setTimeout(() => {
        setTimings(null);
        alignmentCacheRef.current = null;
      }, 0);
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
        if (!cancelled) {
          setTimings(null);
          alignmentCacheRef.current = null;
        }
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

  // A user stops following via real *input* — wheel, touch, or the scroll keys.
  // These are never generated by a programmatic scroll, so they are the
  // authoritative "user scrolled" signal and need no suppression. A `scroll`
  // listener is kept only to catch scrollbar drags (which fire neither wheel nor
  // touch), gated by the settle window so our own smooth-scroll burst is not read
  // as a user stop. `following` is deliberately NOT a dependency: the handlers
  // only ever set it false and read refs, so they never need re-subscribing.
  useEffect(() => {
    if (!user) return;
    const stopFollowing = () => {
      endProgrammaticScroll();
      setFollowing(false);
    };
    const onWheelOrTouch = stopFollowing;
    const onScrollKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) {
        stopFollowing();
      }
    };
    const onScroll = () => {
      const now = nowMs();
      const target = lastProgrammaticTargetRef.current;
      const y = window.scrollY ?? 0;
      if (programmaticScrollRef.current) {
        // Our own smooth-scroll animation is still settling: re-arm the
        // no-scroll-for-150ms window so this burst is attributed to us, not the
        // user. The wedge cap (SCROLL_SUPPRESS_CAP_MS) still bounds it, but it
        // sits far above any real animation, so it can no longer end the
        // suppression while our own events are still arriving.
        absorbProgrammaticScroll(now);
        return;
      }
      // Suppression has ended. Two shapes of event are still OURS:
      //  (1) the animation's TAIL — it arrives on the animation's own cadence
      //      right after suppression ended AND sits at the offset we asked for;
      //  (2) the animation's FIRST event, arriving after suppression ended
      //      because the scroll-start latency outlasted even the start grace —
      //      the position is still on its way to our target, and a user scroll
      //      converges on no such offset (a bare drag lands wherever the reader
      //      put it, at/at-the-target only by accident and only once settled).
      const isTail =
        target !== null &&
        now - lastSuppressedScrollAtRef.current <= SCROLL_SETTLE_MS &&
        Math.abs(y - target) <= SCROLL_TAIL_EPSILON_PX;
      const isLateFirst =
        target !== null &&
        lastSuppressedScrollAtRef.current === 0 &&
        now - programmaticScrollStartedAtRef.current <= SCROLL_START_GRACE_MS &&
        Math.abs(y - target) > SCROLL_TAIL_EPSILON_PX;
      if (isTail || isLateFirst) {
        absorbProgrammaticScroll(now);
        return;
      }
      // A scroll with no preceding input, after our animation settled => a
      // scrollbar drag: stop following (audio keeps playing).
      setFollowing(false);
    };
    window.addEventListener("wheel", onWheelOrTouch, { passive: true });
    window.addEventListener("touchmove", onWheelOrTouch, { passive: true });
    window.addEventListener("keydown", onScrollKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheelOrTouch);
      window.removeEventListener("touchmove", onWheelOrTouch);
      window.removeEventListener("keydown", onScrollKey);
      window.removeEventListener("scroll", onScroll);
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
      if (capTimerRef.current !== null) clearTimeout(capTimerRef.current);
      if (scrollEndHandlerRef.current && window.removeEventListener) {
        window.removeEventListener("scrollend", scrollEndHandlerRef.current);
      }
      settleTimerRef.current = null;
      capTimerRef.current = null;
      scrollEndHandlerRef.current = null;
      programmaticScrollRef.current = false;
      lastSuppressedScrollAtRef.current = 0;
    };
  }, [user, endProgrammaticScroll, absorbProgrammaticScroll]);

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

      // Build the block alignment once per article/manifest and reuse it across
      // the ~4x/s `timeupdate` ticks: the DOM block elements, their texts, and
      // the greedy segment->block mapping are all stable for the life of the
      // article, so only a slug change, a new timings array, or an article
      // subtree that was empty/replaced invalidate the cache. A cache miss/stale
      // key rebuilds inside the same try (a missing article simply falls through
      // to `blocks[target.blockIndex]` being undefined and never scrolls).
      // NEVER cache an empty alignment: if the first tick lands before the
      // article body exists (or its elements get detached by a remount),
      // `articleBlocks()` returns [] and caching that would silently disable
      // Follow-along for the rest of the mount (sato, t_fdd0654c P1).
      let cached = alignmentCacheRef.current;
      if (
        !cached ||
        cached.slug !== slug ||
        cached.timings !== timings ||
        cached.blocks.length === 0 ||
        !cached.blocks[0]?.el.isConnected
      ) {
        const blocks = articleBlocks();
        const aligned = alignSegmentsToBlocks(
          timings,
          blocks.map((b) => b.text),
        );
        cached = { slug, timings, blocks, aligned };
        alignmentCacheRef.current = cached;
      }
      const target = cached.aligned[segIdx];
      if (!target) return;
      const block = cached.blocks[target.blockIndex];
      if (!block) return;

      // Scroll ONLY when the active paragraph changed. A repeat scroll within
      // the SAME block is a no-op: user input already cancels `following`, so
      // there is nothing to "re-align" inside one block, and re-scrolling would
      // restart the smooth animation and keep the page permanently moving
      // (fighting any reader inside that paragraph).
      if (lastScrollBlockRef.current === target.blockIndex) return;
      // Absolute document offset of the block top, then align it below the
      // floated player: target = blockTop - (playerH + headerH + gap).
      const rect = block.el.getBoundingClientRect();
      const blockDocTop = rect.top + (window.scrollY ?? 0);
      const { playerH, headerH } = measureBand();
      top = targetScrollYForBlock(Math.max(0, blockDocTop), playerH, headerH, 12);
      lastScrollBlockRef.current = target.blockIndex;

      // Suppress the scroll events OUR smooth-scroll animation will emit until
      // it settles (scrollend / no-scroll-for-150ms; the wall-clock cap is only
      // a stall guard, well above any real animation) so they are not misread as
      // a user stop. The old 1ms clear expired before the first event landed and
      // un-checked the toggle on every paragraph.
      lastProgrammaticTargetRef.current = top;
      beginProgrammaticScroll();
      window.scrollTo({ top, behavior: following ? "smooth" : "auto" });
    } catch {
      // never throw from playback-driven side effects
    }
  }

  if (!hasAudio) return null;

  // Loading (or logged-out once resolved): show nothing until auth is known.
  if (isLoading) return null;

  if (!user) {
    return (
      <div className="my-6 flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-6 text-center dark:border-[var(--border-default)] dark:bg-[var(--surface-card)]">
        <p className="text-sm font-semibold text-gray-800 dark:text-[var(--ink-primary)]">
          🎧 Listen to this {label}
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
      className={`my-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-[var(--border-default)] dark:bg-[var(--surface-card)] ${
        pinned
          ? "shadow-[0_8px_24px_rgba(11,29,58,0.16)] ring-1 ring-gray-300 dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] dark:ring-[var(--border-default)] transition-shadow duration-300"
          : "transition-shadow duration-300"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-[var(--ink-muted)]">
          Listen to this {label}
        </span>
        <div className="flex items-center gap-3">
          {timings && timings.length > 0 && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-[var(--ink-muted)]">
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
        aria-label={`${label.charAt(0).toUpperCase()}${label.slice(1)} audio player`}
        src={`/api/audio/${slug}`}
        onTimeUpdate={handleTimeUpdate}
      />
    </div>
  );
}