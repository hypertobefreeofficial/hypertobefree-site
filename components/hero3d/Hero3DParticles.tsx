"use client";

type Hero3DParticlesProps = {
  reducedMotion?: boolean;
  lowPowerMode?: boolean;
};

const PARTICLE_SEEDS = [
  { left: "12%", top: "18%", size: 3, delay: "0s", duration: "16s", opacity: 0.45 },
  { left: "28%", top: "32%", size: 2, delay: "-3s", duration: "20s", opacity: 0.35 },
  { left: "44%", top: "14%", size: 4, delay: "-6s", duration: "22s", opacity: 0.5 },
  { left: "62%", top: "26%", size: 2, delay: "-2s", duration: "18s", opacity: 0.4 },
  { left: "78%", top: "16%", size: 3, delay: "-8s", duration: "24s", opacity: 0.38 },
  { left: "18%", top: "48%", size: 2, delay: "-4s", duration: "19s", opacity: 0.32 },
  { left: "52%", top: "42%", size: 3, delay: "-1s", duration: "21s", opacity: 0.42 },
  { left: "86%", top: "38%", size: 2, delay: "-5s", duration: "17s", opacity: 0.36 },
  { left: "34%", top: "58%", size: 2, delay: "-7s", duration: "23s", opacity: 0.3 },
  { left: "70%", top: "52%", size: 4, delay: "-9s", duration: "25s", opacity: 0.48 },
  { left: "8%", top: "62%", size: 2, delay: "-2.5s", duration: "20s", opacity: 0.28 },
  { left: "92%", top: "24%", size: 3, delay: "-4.5s", duration: "18s", opacity: 0.4 },
] as const;

export function Hero3DParticles({
  reducedMotion = false,
  lowPowerMode = false,
}: Hero3DParticlesProps) {
  if (reducedMotion) return null;

  const count = lowPowerMode ? 6 : PARTICLE_SEEDS.length;

  return (
    <>
      {PARTICLE_SEEDS.slice(0, count).map((particle, index) => (
        <span
          key={`${particle.left}-${particle.top}-${index}`}
          className="htbf-hero3d-particle-float absolute rounded-full bg-white shadow-[0_0_12px_rgba(255,240,200,0.85)]"
          style={{
            left: particle.left,
            top: particle.top,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            animationDelay: particle.delay,
            ["--htbf-particle-duration" as string]: particle.duration,
            ["--htbf-particle-opacity" as string]: String(particle.opacity),
          }}
          aria-hidden
        />
      ))}
    </>
  );
}
