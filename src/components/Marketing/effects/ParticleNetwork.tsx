"use client";

import { useState } from "react";
import { Particles, ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";

const OPTIONS: ISourceOptions = {
  fullScreen: false,
  fpsLimit: 60,
  particles: {
    number: { value: 70, density: { enable: true, width: 1200, height: 800 } },
    color: { value: ["#ffffff", "#A50044", "#004D98"] },
    opacity: { value: { min: 0.15, max: 0.5 } },
    size: { value: { min: 1.5, max: 3 } },
    move: {
      enable: true,
      speed: 0.6,
      direction: "none",
      outModes: { default: "bounce" },
    },
    links: {
      enable: true,
      distance: 160,
      color: "#ffffff",
      opacity: 0.1,
      width: 1,
    },
  },
  interactivity: {
    events: {
      onHover: { enable: true, mode: "grab" },
    },
    modes: {
      grab: { distance: 180, links: { opacity: 0.3 } },
    },
  },
  detectRetina: true,
  pauseOnOutsideViewport: true,
};

/**
 * Marketing hero particle network (tsparticles v4 provider pattern). The
 * ParticlesProvider wraps a single <Particles> so the slim engine is registered
 * once on the client. Renders nothing until the engine is loaded.
 */
export default function ParticleNetwork() {
  const [ready, setReady] = useState(false);

  if (!ready) {
    return (
      <ParticlesProvider
        init={async (engine) => {
          await loadSlim(engine);
          setReady(true);
        }}
      >
        <span />
      </ParticlesProvider>
    );
  }

  return (
    <Particles
      className="absolute inset-0 transition-opacity duration-1000"
      id="hero-particles"
      options={OPTIONS}
    />
  );
}
