"use client";

import dynamic from "next/dynamic";

const GradientMesh = dynamic(
  () => import("@/components/effects/GradientMesh"),
  { ssr: false },
);

const ParticleNetwork = dynamic(
  () => import("@/components/effects/ParticleNetwork"),
  { ssr: false },
);

export default function HeroBackground({ particles = false }: { particles?: boolean }) {
  return (
    <>
      <GradientMesh />
      {particles && <ParticleNetwork />}
    </>
  );
}
