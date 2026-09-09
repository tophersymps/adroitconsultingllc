/**
 * StarChart.tsx — the production star chart, promoted from the lab's
 * `chart-atlas.tsx`.
 *
 * Each course is a constellation carrying an engraved figure of what it
 * depicts, drawn behind the star lines; progress lights the lines. Art ships as
 * grayscale-on-black PNG and is luma-keyed to gold by `ghostFilter`, so the
 * black plate disappears into the sky and only the engraving shows — no cut-out
 * masks, no per-asset alpha work.
 *
 * Presentational by contract: it takes chart-ready figures and emits selection.
 * No data loading, no routing. `buildChartFigures` in `src/lib/chart.ts` owns
 * every claim the chart makes about progress; page chrome (rank, stats,
 * Chronicle) stays a sibling rather than an overlay.
 */
"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { ChartFigure } from "@/lib/chart";
import { figureProgress } from "@/lib/chart";
import { usePrefersReducedMotion } from "../model/usePrefersReducedMotion";
import { bgStars, SKY_ASPECT_WIDTH, NEBULAE } from "./chart-sky";
import { chartLayout, figureArtFor, type ChartSlot } from "./chart-figures";
import "./star-chart.css";

/**
 * Luma keying. The engravings are grayscale-on-black, so alpha comes from
 * luminance (`0.32 0.55 0.13`) and the colour is replaced with a flat tint in
 * the matrix's constant column. The black plate vanishes and the linework
 * survives as one luminous colour whose density follows the original hatching —
 * spectral rather than printed. The plate's own colour is discarded, which is
 * why the assets are stored grey: only luminance is read.
 *
 * Both states are gold. Dim bronze = still being earned, bright gold = done.
 */
function ghostFilter(id: string, tint: readonly [number, number, number], blur: number) {
  return (
    <filter
      key={id}
      id={id}
      colorInterpolationFilters="sRGB"
      x="-30%"
      y="-30%"
      width="160%"
      height="160%"
    >
      <feColorMatrix
        type="matrix"
        values={`0 0 0 0 ${tint[0]}
                 0 0 0 0 ${tint[1]}
                 0 0 0 0 ${tint[2]}
                 0.32 0.55 0.13 0 0`}
        result="keyed"
      />
      <feGaussianBlur in="keyed" stdDeviation={blur} />
    </filter>
  );
}

/**
 * Bronze carries roughly the luminance the original cool tint did (~0.78
 * relative). Dropping straight to a dark bronze reads as "gold" but sinks the
 * in-progress figures under the nebulae, so the two states are separated by hue
 * and saturation rather than by brightness.
 */
const BRONZE = [0.94, 0.76, 0.46] as const;
const GOLD = [1, 0.85, 0.62] as const;

/** Faint atlas graticule — concentric rings and spokes, cartographic depth. */
function Graticule() {
  const spokes = [];
  for (let a = 0; a < 360; a += 15) {
    const rad = (a * Math.PI) / 180;
    spokes.push(
      <line
        key={a}
        className={a % 45 === 0 ? "cxc-spoke is-major" : "cxc-spoke"}
        x1={500 + Math.cos(rad) * 150}
        y1={520 + Math.sin(rad) * 150}
        x2={500 + Math.cos(rad) * 440}
        y2={520 + Math.sin(rad) * 440}
      />,
    );
  }
  return (
    <g className="cxc-graticule">
      {[150, 265, 380, 440].map((r) => (
        <circle key={r} className="cxc-grat-ring" cx={500} cy={520} r={r} fill="none" />
      ))}
      {spokes}
    </g>
  );
}

/** Members a connection touches — see `drawnIndices` in `src/lib/chart.ts`. */
function drawnIndices(figure: ChartFigure): number[] {
  const set = new Set<number>();
  for (const [a, b] of figure.connections) {
    if (figure.stars[a]) set.add(a);
    if (figure.stars[b]) set.add(b);
  }
  return [...set].sort((a, b) => a - b);
}

function boundsOf(figure: ChartFigure, indices: number[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const i of indices) {
    const s = figure.stars[i]!;
    minX = Math.min(minX, s.position[0]);
    maxX = Math.max(maxX, s.position[0]);
    minY = Math.min(minY, s.position[1]);
    maxY = Math.max(maxY, s.position[1]);
  }
  return { minX, maxX, minY, maxY, w: Math.max(maxX - minX, 0.4), h: Math.max(maxY - minY, 0.4) };
}

interface FigureIds {
  pocket: string;
  fade: string;
  ghostBronze: string;
  ghostBronzeHalo: string;
  ghostGold: string;
  ghostGoldHalo: string;
}

function FigureSvg({
  figure,
  slot,
  focused,
  dimmed,
  showArt,
  index,
  ids,
  interactive,
  onSelect,
}: {
  figure: ChartFigure;
  slot: ChartSlot;
  focused: boolean;
  dimmed: boolean;
  showArt: boolean;
  index: number;
  ids: FigureIds;
  /**
   * False on the single-course tracker, where there is nothing to select — the
   * page is already the course. A `role="button"` that does nothing is worse
   * than no control, so the semantics come off entirely and the enclosing
   * `role="img"` svg carries the description.
   */
  interactive: boolean;
  onSelect: () => void;
}) {
  const drawn = useMemo(() => drawnIndices(figure), [figure]);
  const { cx, cy } = slot;
  const unit = 70 * slot.scale;

  const progress = figureProgress(figure);
  const pct = Math.round(progress * 100);
  const art = useMemo(() => figureArtFor(figure.figureName), [figure.figureName]);

  const label = figure.figureName
    ? `${figure.figureName} constellation — ${figure.name}, ${pct}% complete`
    : `${figure.name}, ${pct}% complete`;

  const classes = [
    "cxc-figure",
    focused ? "is-focused" : "",
    dimmed ? "is-dimmed" : "",
    figure.complete ? "is-complete" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const artSize = art ? unit * art.scale : 0;
  const artX = cx - artSize / 2 + (art?.dx ?? 0) * unit;
  const artY = cy - artSize / 2 + (art?.dy ?? 0) * unit;

  const bounds = drawn.length > 0 ? boundsOf(figure, drawn) : null;
  const toX = (x: number) =>
    bounds ? cx + ((x - (bounds.minX + bounds.maxX) / 2) / bounds.w) * unit : cx;
  const toY = (y: number) =>
    bounds ? cy - ((y - (bounds.minY + bounds.maxY) / 2) / bounds.h) * unit : cy;

  const rails = figure.connections.filter(([a, b]) => figure.stars[a] && figure.stars[b]);
  const litRails = Math.round(rails.length * progress);

  const examIdx = drawn.find((i) => figure.stars[i]?.role === "exam") ?? -1;

  const interaction = interactive
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-label": label,
        onClick: onSelect,
        onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        },
      }
    : {};

  return (
    <g
      className={classes}
      data-testid={`cxc-figure-${figure.seriesSlug}`}
      {...interaction}
    >
      {/* Depth: a pool of deeper sky so the apparition has somewhere to sit */}
      <ellipse
        className="cxc-pocket"
        cx={cx}
        cy={cy}
        rx={unit * 1.35}
        ry={unit * 1.25}
        fill={`url(#${ids.pocket})`}
      />

      {/* Apparition — halo pass behind, keyed pass in front */}
      {showArt && art ? (
        <g
          className="cxc-art-group"
          mask={`url(#${ids.fade})`}
          style={{ animationDelay: `${-index * 1.7}s` }}
        >
          <image
            className="cxc-art-halo"
            href={art.src}
            x={artX}
            y={artY}
            width={artSize}
            height={artSize}
            preserveAspectRatio="xMidYMid meet"
            filter={`url(#${figure.complete ? ids.ghostGoldHalo : ids.ghostBronzeHalo})`}
          />
          <image
            className="cxc-art"
            href={art.src}
            x={artX}
            y={artY}
            width={artSize}
            height={artSize}
            preserveAspectRatio="xMidYMid meet"
            filter={`url(#${figure.complete ? ids.ghostGold : ids.ghostBronze})`}
          />
        </g>
      ) : null}

      {/* Achievement ring — closes only when the course is finished */}
      {figure.complete ? (
        <circle className="cxc-ring" cx={cx} cy={cy} r={unit * 0.95} fill="none" />
      ) : null}

      {/* Dark casing keeps the star lines legible on top of the artwork */}
      {rails.map(([a, b], i) => (
        <line
          key={`c-${i}`}
          className="cxc-line-case"
          x1={toX(figure.stars[a]!.position[0])}
          y1={toY(figure.stars[a]!.position[1])}
          x2={toX(figure.stars[b]!.position[0])}
          y2={toY(figure.stars[b]!.position[1])}
        />
      ))}

      {/* Full figure outline */}
      {rails.map(([a, b], i) => (
        <line
          key={`g-${i}`}
          className="cxc-line"
          x1={toX(figure.stars[a]!.position[0])}
          y1={toY(figure.stars[a]!.position[1])}
          x2={toX(figure.stars[b]!.position[0])}
          y2={toY(figure.stars[b]!.position[1])}
        />
      ))}

      {/* Progress lights the same lines */}
      {rails.slice(0, litRails).map(([a, b], i) => (
        <line
          key={`p-${i}`}
          className="cxc-line-lit"
          x1={toX(figure.stars[a]!.position[0])}
          y1={toY(figure.stars[a]!.position[1])}
          x2={toX(figure.stars[b]!.position[0])}
          y2={toY(figure.stars[b]!.position[1])}
        />
      ))}

      {/*
        Energy travelling the finished path. `pathLength={100}` normalises every
        rail so one dash spec gives the same spark speed on long and short
        segments; the stagger makes it read as flow around the figure.
      */}
      {rails.slice(0, litRails).map(([a, b], i) => (
        <line
          key={`f-${i}`}
          className="cxc-line-flow"
          pathLength={100}
          x1={toX(figure.stars[a]!.position[0])}
          y1={toY(figure.stars[a]!.position[1])}
          x2={toX(figure.stars[b]!.position[0])}
          y2={toY(figure.stars[b]!.position[1])}
          style={{ animationDelay: `${-(index * 0.9 + i * 0.55)}s` }}
        />
      ))}

      {/*
        Lesson path — the fine progress between main stars. The main
        constellation stars are the recognizable anchors; the lessons that
        round-robin onto them are instead drawn as small nodes strung along the
        connecting segments, so a learner lights the PATH toward the next main
        star per lesson. Sparse segments (<= 4 lessons) draw one node per
        lesson, lit individually; dense segments draw a filling rail (done
        fraction) plus a muted count, so a long course never crowds a phone.
      */}
      {figure.segments.map((seg, i) => {
        const sa = figure.stars[seg.a]!;
        const sb = figure.stars[seg.b]!;
        const ax = toX(sa.position[0]);
        const ay = toY(sa.position[1]);
        const bx = toX(sb.position[0]);
        const by = toY(sb.position[1]);
        const n = seg.lessons.length;
        // i+1 of n → the lesson's fractional position along the segment.
        const fract = (k: number) => (k + 1) / (n + 1);
        const xAt = (k: number) => ax + (bx - ax) * fract(k);
        const yAt = (k: number) => ay + (by - ay) * fract(k);

        if (n <= 4) {
          return seg.lessons.map((lesson, k) => {
            const lit = seg.done >= k + 1;
            return (
              <circle
                key={`sp-${i}-${k}`}
                className={`cxc-path-node${lit ? " is-lit" : ""}`}
                cx={xAt(k)}
                cy={yAt(k)}
                r={1.1}
              />
            );
          });
        }
        // Dense: a partial-fill rail from the segment start, lit in proportion
        // to done/total, plus a muted count badge.
        const frac = n > 0 ? seg.done / n : 0;
        const px = ax + (bx - ax) * frac;
        const py = ay + (by - ay) * frac;
        return (
          <g key={`sp-${i}`}>
            <line
              className="cxc-path-rail"
              x1={ax}
              y1={ay}
              x2={bx}
              y2={by}
            />
            <line
              className="cxc-path-rail-lit"
              x1={ax}
              y1={ay}
              x2={px}
              y2={py}
            />
          </g>
        );
      })}

      {/* Joint vertices */}
      {drawn.map((i) => {
        if (i === examIdx) return null;
        const s = figure.stars[i]!;
        return (
          <circle
            key={`v-${i}`}
            className={`cxc-dot${s.lit ? " is-lit" : ""}`}
            cx={toX(s.position[0])}
            cy={toY(s.position[1])}
            r={focused ? 2.2 : 1.8}
          />
        );
      })}

      {/* The crowning node — the course's final exam */}
      {examIdx >= 0
        ? (() => {
            const s = figure.stars[examIdx]!;
            const x = toX(s.position[0]);
            const y = toY(s.position[1]);
            const on = figure.complete || figure.examPassed;
            return (
              <g className={`cxc-exam${on ? " is-on" : ""}`}>
                {on ? (
                  <circle
                    className="cxc-exam-pulse"
                    cx={x}
                    cy={y}
                    r={focused ? 7 : 5.5}
                    fill="none"
                    style={{ animationDelay: `${-index * 0.8}s` }}
                  />
                ) : null}
                <circle className="cxc-exam-ring" cx={x} cy={y} r={focused ? 7 : 5.5} fill="none" />
                <circle className="cxc-exam-dot" cx={x} cy={y} r={focused ? 3.2 : 2.6} />
              </g>
            );
          })()
        : null}

      {figure.figureName ? (
        <text className="cxc-label" x={cx} y={cy + unit * 0.78}>
          {figure.figureName}
        </text>
      ) : null}
      <text className="cxc-course" x={cx} y={cy + unit * 0.78 + (figure.figureName ? 14 : 0)}>
        {figure.name.length > 36 ? `${figure.name.slice(0, 34)}…` : figure.name}
      </text>
      <text className="cxc-pct" x={cx} y={cy + unit * 0.78 + (figure.figureName ? 28 : 14)}>
        {figure.complete ? "Course complete" : `${pct}% learned`}
      </text>
    </g>
  );
}

export interface StarChartProps {
  figures: ChartFigure[];
  focusSlug: string | null;
  onFocusChange: (slug: string | null) => void;
  /**
   * The only navigation egress. Clicking a figure focuses it and stays put;
   * opening the course is an explicit action in the inspect panel.
   */
  onOpenCourse?: (seriesSlug: string) => void;
  /**
   * `sky` is the profile hero (many figures, legend, art toggle). `single` is
   * the on-course tracker: one figure, centred, no legend.
   */
  variant?: "sky" | "single";
  /** Guests get the shape without the course CTA. */
  isGuest?: boolean;
  className?: string;
}

export function StarChart({
  figures,
  focusSlug,
  onFocusChange,
  onOpenCourse,
  variant = "sky",
  isGuest = false,
  className,
}: StarChartProps) {
  const single = variant === "single";
  const [showArt, setShowArt] = useState(true);
  const reducedMotion = usePrefersReducedMotion();

  /*
   * The field is wider than it is tall (the container is 16:8.5 on the sky and
   * 16:9 on the single course). The constellation *content* is authored in a
   * fixed ~1000-unit square centred on (500,520) — but if the whole SVG were
   * that square, `preserveAspectRatio=meet` would letterbox it inside the wide
   * frame, pinning the galaxy to a square plate with bare-gradient flanks (the
   * "squared off" look). Instead the viewBox holds the full wide grade, the
   * background starfield is generated across that width, and the chart content
   * is shifted right so it sits centred within the wide field.
   */
  const viewW = single ? 1778 : SKY_ASPECT_WIDTH; // match the CSS aspect ratio
  const shiftX = (viewW - 1000) / 2;

  /*
   * SVG ids must be unique per instance or a second chart on the page would
   * steal the first one's filters — `url(#id)` resolves document-wide.
   * `useId` contains colons, which are legal in an id but awkward in CSS, so
   * they are stripped.
   */
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const ids: FigureIds = useMemo(
    () => ({
      pocket: `cxc-pocket-${uid}`,
      fade: `cxc-fade-${uid}`,
      ghostBronze: `cxc-ghost-bronze-${uid}`,
      ghostBronzeHalo: `cxc-ghost-bronze-halo-${uid}`,
      ghostGold: `cxc-ghost-gold-${uid}`,
      ghostGoldHalo: `cxc-ghost-gold-halo-${uid}`,
    }),
    [uid],
  );

  /*
   * In `single` mode the lone figure is centred and enlarged rather than taking
   * slot 0 of the spiral, which sits off-centre by design.
   */
  const layout = useMemo<ChartSlot[]>(
    () => (single ? [{ cx: 500, cy: 500, scale: 3.1 }] : chartLayout(figures.length)),
    [single, figures.length],
  );

  const focused = figures.find((f) => f.seriesSlug === focusSlug) ?? null;

  const singleLabel = useMemo(() => {
    const f = figures[0];
    if (!f) return "Course constellation";
    const pct = Math.round(figureProgress(f) * 100);
    const drawn = f.figureName ? ` drawn as ${f.figureName}` : "";
    const state = f.complete
      ? "course complete"
      : `${f.litStars} of ${f.totalStars} lessons done, ${pct}% complete`;
    return `${f.name}${drawn} — ${state}`;
  }, [figures]);

  const far = useMemo(
    () => bgStars(260, "far", [0.4, 1.1], [0.12, 0.4], viewW),
    [viewW],
  );
  const mid = useMemo(
    () => bgStars(120, "mid", [0.8, 1.7], [0.3, 0.65], viewW),
    [viewW],
  );
  const near = useMemo(
    () => bgStars(36, "near", [1.4, 2.4], [0.5, 0.9], viewW),
    [viewW],
  );

  /*
   * Parallax writes CSS custom properties instead of React state — pointer
   * moves would otherwise re-render every figure plus ~400 stars per frame.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--cxc-px", String((e.clientX - r.left) / r.width - 0.5));
      el.style.setProperty("--cxc-py", String((e.clientY - r.top) / r.height - 0.5));
    },
    [reducedMotion],
  );
  const onPointerLeave = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty("--cxc-px", "0");
    el.style.setProperty("--cxc-py", "0");
  }, []);

  /*
   * Esc clears focus. Scoped to the chart's own subtree rather than the window,
   * so it cannot swallow Escape from a dialog or menu elsewhere on the page.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && focusSlug) {
        e.stopPropagation();
        onFocusChange(null);
      }
    },
    [focusSlug, onFocusChange],
  );

  const rootClasses = [
    "cxc",
    single ? "is-single" : "",
    reducedMotion ? "is-static" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClasses}
      data-testid="cxc-star-chart"
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
    >
      {!single ? (
        <div className="cxc-legend">
          <ul className="cxc-howto">
            <li>
              <i className="cxc-ico-line" /> Constellation = one course
            </li>
            <li>
              <i className="cxc-ico-lit" /> Bright lines = progress
            </li>
            <li>
              <i className="cxc-ico-exam" /> Ringed star = final exam
            </li>
          </ul>
          <label className="cxc-toggle">
            <input
              type="checkbox"
              checked={showArt}
              onChange={(e) => setShowArt(e.target.checked)}
            />
            <span>Show figure drawings</span>
          </label>
        </div>
      ) : null}

      {/*
        `role="img"` only when nothing inside is operable. An img's subtree is
        presentational, so using it on the profile chart would hide every figure
        button from assistive tech — the controls would be keyboard-reachable and
        completely undescribed. The single-course tracker has no controls, so
        there it is correct, and its label has to carry the progress that the
        (now presentational) text nodes state visually.
      */}
      <svg
        className="cxc-svg"
        viewBox={`0 0 ${viewW} 1000`}
        role={single ? "img" : "group"}
        aria-label={single ? singleLabel : "Your courses, drawn as constellation figures"}
      >
        <defs>
          {ghostFilter(ids.ghostBronze, BRONZE, 0.7)}
          {ghostFilter(ids.ghostBronzeHalo, BRONZE, 6)}
          {ghostFilter(ids.ghostGold, GOLD, 0.7)}
          {ghostFilter(ids.ghostGoldHalo, GOLD, 6)}

          {/*
            Figures fade at the crown and the feet so they read as apparitions
            in the sky rather than stickers pasted on the plate.
          */}
          <linearGradient id={`${ids.fade}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.16" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="0.62" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.9" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={ids.fade} maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill={`url(#${ids.fade}-grad)`} />
          </mask>

          {/* Depth pocket: each figure sits in its own pool of deeper sky. */}
          <radialGradient id={ids.pocket}>
            <stop offset="0" stopColor="#0a1428" stopOpacity="0.85" />
            <stop offset="0.6" stopColor="#070d1c" stopOpacity="0.45" />
            <stop offset="1" stopColor="#05070e" stopOpacity="0" />
          </radialGradient>

          {/* The dome itself — brighter toward the centre so it reads curved. */}
          <radialGradient id={`cxc-dome-${uid}`}>
            <stop offset="0" stopColor="#22376a" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#14224a" stopOpacity="0.8" />
            <stop offset="0.75" stopColor="#0b1230" stopOpacity="0.5" />
            <stop offset="1" stopColor="#05070e" stopOpacity="0" />
          </radialGradient>

          <filter id={`cxc-starglow-${uid}`} x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>

          {/* Nebula clouds. Colour is carried almost entirely by alpha. */}
          {NEBULAE.map((n) => (
            <radialGradient key={n.id} id={`${n.id}-${uid}`}>
              <stop offset="0" stopColor={n.color} stopOpacity={n.alpha} />
              <stop offset="0.5" stopColor={n.color} stopOpacity={n.alpha * 0.4} />
              <stop offset="1" stopColor={n.color} stopOpacity="0" />
            </radialGradient>
          ))}

          <radialGradient id={`cxc-vignette-${uid}`}>
            <stop offset="0.62" stopColor="#05070e" stopOpacity="0" />
            <stop offset="0.88" stopColor="#04060c" stopOpacity="0.22" />
            <stop offset="1" stopColor="#02040a" stopOpacity="0.6" />
          </radialGradient>

          <linearGradient id={`cxc-shoot-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#cfe4ff" stopOpacity="0" />
            <stop offset="1" stopColor="#eaf3ff" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* ---- Far: dome, nebulae, deep star field ---- */}
        <g className="cxc-par cxc-par-far" aria-hidden="true">
          <g transform={`translate(${shiftX} 0)`}>
            <circle cx="500" cy="520" r="520" fill={`url(#cxc-dome-${uid})`} />
            {NEBULAE.map((n) => (
              <ellipse
                key={n.id}
                className="cxc-neb"
                cx={n.cx}
                cy={n.cy}
                rx={n.rx}
                ry={n.ry}
                fill={`url(#${n.id}-${uid})`}
                transform={`rotate(${n.rot} ${n.cx} ${n.cy})`}
                style={{ animationDuration: `${n.drift}s`, animationDelay: `-${n.rot}s` }}
              />
            ))}
          </g>
          {far.map((s, i) => (
            <circle key={i} className="cxc-bg-star" cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
          ))}
        </g>

        {/* ---- Mid: graticule, plate edge, twinkling field ---- */}
        <g className="cxc-par cxc-par-mid" aria-hidden="true">
          <g transform={`translate(${shiftX} 0)`}>
            <Graticule />
            <circle className="cxc-plate" cx="500" cy="520" r="440" fill="none" />
          </g>
          {mid.map((s, i) => (
            <circle
              key={i}
              className="cxc-bg-star is-twinkle"
              cx={s.x}
              cy={s.y}
              r={s.r}
              opacity={s.o}
              style={{ animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
            />
          ))}
        </g>

        {/* ---- Near: the courses ---- */}
        <g className="cxc-par cxc-par-near">
          <g filter={`url(#cxc-starglow-${uid})`} aria-hidden="true">
            {near.map((s, i) => (
              <circle
                key={i}
                className="cxc-bg-star is-near"
                cx={s.x}
                cy={s.y}
                r={s.r * 1.6}
                opacity={s.o * 0.55}
              />
            ))}
          </g>
          {near.map((s, i) => (
            <circle
              key={i}
              className="cxc-bg-star is-twinkle is-near"
              aria-hidden="true"
              cx={s.x}
              cy={s.y}
              r={s.r}
              opacity={s.o}
              style={{ animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
            />
          ))}

          <g transform={`translate(${shiftX} 0)`}>
            {figures.map((figure, i) => {
              const slot = layout[i];
              if (!slot) return null;
              return (
                <FigureSvg
                  key={figure.seriesSlug}
                  figure={figure}
                  slot={{
                    ...slot,
                    scale: slot.scale * (focusSlug === figure.seriesSlug ? 1.08 : 1),
                  }}
                  focused={focusSlug === figure.seriesSlug}
                  dimmed={Boolean(focusSlug && focusSlug !== figure.seriesSlug)}
                  showArt={showArt}
                  index={i}
                  ids={ids}
                  interactive={!single}
                  onSelect={() =>
                    onFocusChange(
                      focusSlug === figure.seriesSlug ? null : figure.seriesSlug,
                    )
                  }
                />
              );
            })}
          </g>
        </g>

        {/* Occasional meteors — the sky is alive, not a screenshot */}
        <g className="cxc-shooters" aria-hidden="true">
          <line className="cxc-shoot" x1="0" y1="0" x2="90" y2="0" stroke={`url(#cxc-shoot-${uid})`} />
          <line className="cxc-shoot is-b" x1="0" y1="0" x2="70" y2="0" stroke={`url(#cxc-shoot-${uid})`} />
        </g>

        <rect
          className="cxc-vignette"
          aria-hidden="true"
          x={-60}
          y="-60"
          width={viewW + 120}
          height="1120"
          fill={`url(#cxc-vignette-${uid})`}
        />
      </svg>

      {/* Coming-soon caption — the gap between published and the final
          curriculum. Per-star placeholders don't apply here (the figure's
          stars map lesson groups, not individual lessons, so once a course has
          published ≥ its figure size every star already has a published lesson);
          this line is the honest "n still coming" signal. */}
      {single && figures[0] && figures[0].curriculumLessons > figures[0].totalStars ? (
        <p className="cxc-coming-soon" data-testid="chart-coming-soon">
          {figures[0].curriculumLessons - figures[0].totalStars} more{" "}
          {figures[0].curriculumLessons - figures[0].totalStars === 1 ? "lesson" : "lessons"}{" "}
          in this curriculum coming soon
        </p>
      ) : null}

      {focused && !single ? (
        <aside className="cxc-inspect" data-testid="cxc-inspect">
          <p className="cxc-kicker">Course</p>
          <h3 className="cxc-title">{focused.name}</h3>
          <p className="cxc-meta">
            {focused.figureName ? (
              <>
                Drawn as <strong>{focused.figureName}</strong>
                {" · "}
              </>
            ) : null}
            {focused.complete
              ? focused.examPassed
                ? "Finished — exam passed"
                : "Finished"
              : `${focused.litStars} of ${focused.totalStars} lessons done`}
          </p>
          {!isGuest && onOpenCourse ? (
            <button
              type="button"
              className="cxc-cta"
              onClick={() => onOpenCourse(focused.seriesSlug)}
            >
              {focused.complete ? "Review course" : "Continue course"}
            </button>
          ) : null}
          <button type="button" className="cxc-clear" onClick={() => onFocusChange(null)}>
            Show all courses
          </button>
        </aside>
      ) : null}
    </div>
  );
}

export default StarChart;
