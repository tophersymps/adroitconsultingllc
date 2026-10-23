/**
 * useCardGateUpgrade — client-side gate upgrade for the prerendered /atlas hub.
 *
 * WHY: `/atlas` is a public marketing hub that MUST stay prerendered (○) and
 * CDN-cached, so the server resolves NO identity there (`gate` is hard-coded
 * `"guest-locked"`, A11Y-M1 on t_dd870a3a). That projection is true for the
 * anonymous visitor and false for a signed-in one — who was told to "sign in to
 * access courses" on cards they can already read, and whose card titles were
 * plain text instead of links.
 *
 * FIX: this island reads the session AFTER hydration from
 * `GET /api/atlas/cards` (session-gated: guests get an empty series list) and
 * re-renders the card affordances for signed-in visitors. Same pattern as
 * `ContinueLearning` — the server keeps its static projection, the browser
 * upgrades it. The SSR/hydration baseline is always the guest projection
 * (state only changes inside `useEffect`), so there is no hydration mismatch.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { LearnCardSeries } from "@/data/types";
import type { CardGateState } from "@/shared/contracts-account";

/** Slim per-series payload from `GET /api/atlas/cards`. */
export interface CardGateEntry {
  slug: string;
  /** Access seam decision (`granted` / `admin-preview` → true). */
  canAccess: boolean;
  /** Published lesson slugs — needed for real `SeriesProgress`. */
  lessonSlugs: string[];
}

export interface CardGateUpgrade {
  /** Gate to hand to every card: the server's until the session read lands. */
  gate: CardGateState;
  /** Cards with the signed-in projection merged in (identity when guest). */
  courses: LearnCardSeries[];
  /** True while the session read is in flight (guest baseline is showing). */
  isUpgrading: boolean;
}

/**
 * Merge the signed-in projection onto the prerendered cards.
 *
 * Only `canAccess` + `lessonSlugs` are replaced: every other card field is
 * already in the static payload, so a signed-in upgrade stays a small
 * response and the prerendered markup (name/description/org) is untouched.
 */
export function applyCardGateUpgrade(
  courses: LearnCardSeries[],
  entries: CardGateEntry[],
): LearnCardSeries[] {
  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  return courses.map((c) => {
    const entry = bySlug.get(c.slug);
    if (!entry) return c;
    return { ...c, canAccess: entry.canAccess, lessonSlugs: entry.lessonSlugs };
  });
}

export function useCardGateUpgrade(
  courses: LearnCardSeries[],
  serverGate: CardGateState,
): CardGateUpgrade {
  const [entries, setEntries] = useState<CardGateEntry[] | null>(null);
  const [gate, setGate] = useState<CardGateState>(serverGate);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/atlas/cards", { cache: "no-store" });
        if (!res.ok) return; // DB/auth hiccup → keep the guest baseline.
        const data = (await res.json()) as {
          gate?: CardGateState;
          series?: CardGateEntry[];
        };
        if (cancelled) return;
        const list = Array.isArray(data.series) ? data.series : [];
        // Guests (and an empty signed-in catalogue) keep the static projection.
        if (data.gate !== "signed-in" || list.length === 0) return;
        setEntries(list);
        setGate("signed-in");
      } catch {
        // Network failure → guest baseline (never a false "signed-in" state).
      } finally {
        if (!cancelled) setSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const upgraded = useMemo(
    () => (entries ? applyCardGateUpgrade(courses, entries) : courses),
    [courses, entries],
  );

  return { gate, courses: upgraded, isUpgrading: !settled };
}
