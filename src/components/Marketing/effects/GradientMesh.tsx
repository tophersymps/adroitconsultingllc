"use client";

import { useEffect, useRef } from "react";

/**
 * Marketing hero gradient-mesh background. Uses the --orb-* semantic tokens
 * (merger, kara t_f9f4d486) so the carmine/navy orbs resolve in BOTH light and
 * dark mode — no hardcoded light-only hexes.
 */
export default function GradientMesh() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) return;

    let rafId: number;
    let mouseX = 0.5;
    let mouseY = 0.5;

    function onMove(e: MouseEvent) {
      mouseX = e.clientX / window.innerWidth;
      mouseY = e.clientY / window.innerHeight;
    }

    function animate() {
      if (!el) return;
      el.style.setProperty("--mx", String(mouseX));
      el.style.setProperty("--my", String(mouseY));
      rafId = requestAnimationFrame(animate);
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" style={{ "--mx": "0.5", "--my": "0.5" } as React.CSSProperties}>
      {/* Primary carmine orb */}
      <div
        className="absolute h-[600px] w-[600px] rounded-full blur-[120px] animate-drift-slow"
        style={{
          background: "radial-gradient(circle, var(--orb-carmine) 0%, transparent 70%)",
          left: "calc(10% + var(--mx) * 15%)",
          top: "calc(5% + var(--my) * 20%)",
        }}
      />
      {/* Secondary navy orb */}
      <div
        className="absolute h-[500px] w-[500px] rounded-full blur-[100px] animate-drift-slow-reverse"
        style={{
          background: "radial-gradient(circle, var(--orb-navy) 0%, transparent 70%)",
          right: "calc(5% + (1 - var(--mx)) * 10%)",
          bottom: "calc(0% + (1 - var(--my)) * 15%)",
        }}
      />
      {/* Accent glow */}
      <div
        className="absolute h-[350px] w-[350px] rounded-full blur-[80px] animate-drift-medium"
        style={{
          background: "radial-gradient(circle, var(--orb-navy-light) 0%, transparent 70%)",
          left: "50%",
          top: "40%",
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}
