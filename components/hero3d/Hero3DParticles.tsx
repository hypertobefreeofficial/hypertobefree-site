"use client";

import { cn } from "../../lib/cn";

/** Extremely subtle floating dust — depth, not sparkle. V4: lower opacity. */
type Hero3DParticlesProps = {
  reducedMotion?: boolean;
  lowPowerMode?: boolean;
};

/**
 * Dust motes across three depth tiers. Far motes are tiny, dim and slow; near
 * motes are larger, softer and drift more — so the air reads as a volume rather
 * than a flat sparkle plane. All drift with transform/opacity only (GPU-cheap).
 * `tier` sets the pre-rendered blur; the blur is static, never animated.
 */
const PARTICLE_SEEDS = [
  // Far tier — deep in the scene
  { left: "18%", top: "22%", size: 1.5, delay: "0s", duration: "28s", opacity: 0.09, tier: "far" },
  { left: "34%", top: "38%", size: 1, delay: "-4s", duration: "32s", opacity: 0.07, tier: "far" },
  { left: "82%", top: "20%", size: 1.5, delay: "-9s", duration: "30s", opacity: 0.08, tier: "far" },
  { left: "70%", top: "44%", size: 1, delay: "-3s", duration: "34s", opacity: 0.06, tier: "far" },
  // Mid tier — the body of the air
  { left: "52%", top: "28%", size: 2, delay: "-7s", duration: "24s", opacity: 0.12, tier: "mid" },
  { left: "68%", top: "34%", size: 1.5, delay: "-2s", duration: "20s", opacity: 0.11, tier: "mid" },
  { left: "24%", top: "52%", size: 1.5, delay: "-5s", duration: "23s", opacity: 0.09, tier: "mid" },
  { left: "58%", top: "48%", size: 2, delay: "-1s", duration: "25s", opacity: 0.12, tier: "mid" },
  { left: "42%", top: "62%", size: 1.5, delay: "-6s", duration: "27s", opacity: 0.08, tier: "mid" },
  // Near tier — soft, catching the light close to camera
  { left: "12%", top: "58%", size: 3.5, delay: "-2.5s", duration: "19s", opacity: 0.1, tier: "near" },
  { left: "88%", top: "56%", size: 3, delay: "-8s", duration: "21s", opacity: 0.09, tier: "near" },
] as const;

const TIER_BLUR: Record<string, string> = {
  far: "blur-[0.5px]",
  mid: "blur-[1px]",
  near: "blur-[2.5px]",
};

export function Hero3DParticles({
  reducedMotion = false,
  lowPowerMode = false,
}: Hero3DParticlesProps) {
  if (reducedMotion) return null;

  const count = lowPowerMode ? 5 : PARTICLE_SEEDS.length;

  return (
    <>
      {PARTICLE_SEEDS.slice(0, count).map((particle, index) => (
        <span
          key={`${particle.left}-${particle.top}-${index}`}
          className={cn(
            "htbf-hero3d-particle-float absolute rounded-full bg-[#fff8ee]",
            TIER_BLUR[particle.tier]
          )}
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

/**
 * Near out-of-focus bokeh — a few large, soft warm orbs at the very front of the
 * depth field. Faint and slow; the blur is pre-rendered (static) so only cheap
 * transforms animate. Makes the viewer feel they are looking *through* the scene.
 */
const BOKEH_SEEDS = [
  { left: "6%", top: "26%", size: 90, opacity: 0.1, blur: "blur-3xl", delay: "0s", duration: "26s" },
  { left: "84%", top: "16%", size: 120, opacity: 0.08, blur: "blur-3xl", delay: "-9s", duration: "30s" },
  { left: "68%", top: "70%", size: 70, opacity: 0.09, blur: "blur-2xl", delay: "-5s", duration: "22s" },
] as const;

export function Hero3DForegroundBokeh({
  reducedMotion = false,
}: {
  reducedMotion?: boolean;
}) {
  return (
    <>
      {BOKEH_SEEDS.map((orb, index) => (
        <span
          key={`bokeh-${index}`}
          className={cn(
            "htbf-hero3d-bokeh absolute",
            orb.blur,
            !reducedMotion && "htbf-hero3d-bokeh-drift"
          )}
          style={{
            left: orb.left,
            top: orb.top,
            width: `${orb.size}px`,
            height: `${orb.size}px`,
            opacity: orb.opacity,
            background:
              "radial-gradient(circle, rgba(255,244,220,0.9) 0%, rgba(255,226,170,0.35) 45%, transparent 72%)",
            animationDelay: orb.delay,
            animationDuration: orb.duration,
          }}
          aria-hidden
        />
      ))}
    </>
  );
}

/** Soft OOF grasses crossing bottom edge — camera looking through nature. */
export function Hero3DOOFGrass({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const sway = reducedMotion ? "" : "htbf-hero3d-flora-sway";
  return (
    <>
      <div
        className={cn(
          "absolute -bottom-4 -left-8 h-28 w-48 rounded-t-[80%] bg-[#1a3d2e]/30 blur-2xl",
          sway
        )}
        aria-hidden
      />
      <div
        className={cn(
          "absolute -bottom-2 left-[18%] h-32 w-36 rounded-t-[70%] bg-[#234a38]/22 blur-3xl",
          sway
        )}
        style={{ animationDelay: "-4s" }}
        aria-hidden
      />
      <div
        className={cn(
          "absolute -bottom-3 right-[12%] h-24 w-52 rounded-t-[90%] bg-[#1a3d2e]/25 blur-2xl",
          sway
        )}
        style={{ animationDelay: "-7s" }}
        aria-hidden
      />
      <div
        className={cn(
          "absolute bottom-0 right-[-5%] h-20 w-40 rounded-t-[65%] bg-[#2d5240]/18 blur-3xl",
          sway
        )}
        style={{ animationDelay: "-2s" }}
        aria-hidden
      />
    </>
  );
}
