"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import {
  getHero3DParallaxPx,
  getHero3DZIndex,
  HERO3D_ASSETS,
  type Hero3DLayerId,
} from "../../lib/hero3d/hero3dLayers";
import { Hero3DClouds } from "./Hero3DClouds";
import { Hero3DForeground } from "./Hero3DForeground";
import { Hero3DVideoCard, Hero3DWorldCard } from "./Hero3DGlassCards";
import { Hero3DParticles } from "./Hero3DParticles";
import "./hero3d.css";

type Hero3DLayerProps = {
  layerRef: (node: HTMLDivElement | null) => void;
  zIndex: number;
  className?: string;
  children?: ReactNode;
};

export function Hero3DLayer({
  layerRef,
  zIndex,
  className,
  children,
}: Hero3DLayerProps) {
  return (
    <div
      ref={layerRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ zIndex }}
    >
      {children}
    </div>
  );
}

type Hero3DLayerStackProps = {
  registerLayer: (parallaxPx: number) => (node: HTMLElement | null) => void;
  showFloatingCards?: boolean;
  reducedMotion?: boolean;
  lowPowerMode?: boolean;
};

function layerRef(
  registerLayer: Hero3DLayerStackProps["registerLayer"],
  id: Hero3DLayerId
) {
  return registerLayer(getHero3DParallaxPx(id));
}

export function Hero3DLayerStack({
  registerLayer,
  showFloatingCards = true,
  reducedMotion = false,
  lowPowerMode = false,
}: Hero3DLayerStackProps) {
  const breathe = reducedMotion ? "" : "htbf-hero3d-sun-breathe";
  const breatheOuter = reducedMotion ? "" : "htbf-hero3d-sun-breathe-outer";
  const rayShift = reducedMotion ? "" : "htbf-hero3d-ray-shift";
  const hazeDrift = reducedMotion ? "" : "htbf-hero3d-haze-drift";

  return (
    <>
      {/* L1 · Film-graded sky */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "sky")}
        zIndex={getHero3DZIndex("sky")}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(
                180deg,
                #0a1628 0%,
                #0f2347 12%,
                #1a3a6e 28%,
                #2a5588 42%,
                #5a7898 52%,
                #c4a070 68%,
                #e8c890 78%,
                #f5e8d0 88%,
                #fff8ee 100%
              )
            `,
          }}
        />
        {/* Teal shadow grade */}
        <div className="absolute inset-0 htbf-hero3d-grade-teal-shadow mix-blend-multiply opacity-80" />
        {/* Atmospheric haze in upper sky */}
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(ellipse at 50% 20%, rgba(180,210,230,0.18) 0%, transparent 55%)",
          }}
        />
      </Hero3DLayer>

      {/* L2 · Volumetric sun */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "sun")}
        zIndex={getHero3DZIndex("sun")}
      >
        <div className={cn("absolute inset-0", !reducedMotion && "htbf-hero3d-enter-sun")}>
          {/* Outer lens haze */}
          <div
            className={cn(
              "absolute left-[54%] top-[10%] h-72 w-72 -translate-x-1/2 rounded-full sm:h-80 sm:w-80",
              breatheOuter
            )}
            style={{
              background:
                "radial-gradient(circle, rgba(255,235,200,0.22) 0%, rgba(255,210,150,0.1) 35%, transparent 68%)",
            }}
          />
          {/* Mid bloom layer */}
          <div
            className={cn(
              "absolute left-[56%] top-[14%] h-52 w-52 -translate-x-1/2 rounded-full sm:h-64 sm:w-64",
              breathe
            )}
            style={{
              background:
                "radial-gradient(circle, rgba(255,228,180,0.75) 0%, rgba(255,195,120,0.38) 28%, rgba(255,170,90,0.12) 48%, transparent 68%)",
            }}
          />
          {/* Core disc */}
          <div
            className={cn(
              "absolute left-[56%] top-[16%] h-24 w-24 -translate-x-1/2 rounded-full sm:h-28 sm:w-28",
              breathe
            )}
            style={{
              background:
                "radial-gradient(circle, rgba(255,245,220,0.95) 0%, rgba(255,220,160,0.65) 42%, rgba(255,190,110,0.18) 62%, transparent 78%)",
            }}
          />
          {/* Brighter horizon wash */}
          <div className="absolute inset-x-0 bottom-[32%] h-40 bg-[radial-gradient(ellipse_at_58%_50%,rgba(255,215,160,0.38),transparent_68%)]" />
          <div className="absolute inset-x-0 bottom-[28%] h-28 bg-[radial-gradient(ellipse_at_50%_80%,rgba(255,235,200,0.28),transparent_72%)]" />
          {/* Light rays */}
          <div
            className={cn("absolute inset-0 opacity-40", rayShift)}
            style={{
              background: `
                conic-gradient(from 205deg at 56% 18%,
                  transparent 0deg,
                  rgba(255,230,190,0.12) 14deg,
                  transparent 28deg,
                  rgba(255,220,175,0.09) 44deg,
                  transparent 58deg,
                  rgba(255,210,165,0.11) 74deg,
                  transparent 92deg
                )
              `,
            }}
          />
          <div className="absolute left-[40%] top-0 h-full w-[32%] bg-gradient-to-b from-[#f5e0c0]/18 via-[#f0d8b0]/6 to-transparent blur-2xl" />
        </div>
      </Hero3DLayer>

      {/* L3 · Far clouds */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "cloud-far")}
        zIndex={getHero3DZIndex("cloud-far")}
      >
        <div className={cn(!reducedMotion && "htbf-hero3d-enter-clouds")}>
          <Hero3DClouds variant="far" reducedMotion={reducedMotion} />
        </div>
      </Hero3DLayer>

      {/* L4 · Near clouds */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "cloud-near")}
        zIndex={getHero3DZIndex("cloud-near")}
      >
        <div className={cn(!reducedMotion && "htbf-hero3d-enter-clouds")}>
          <Hero3DClouds variant="near" reducedMotion={reducedMotion} />
        </div>
      </Hero3DLayer>

      {/* L5 · Mountains + horizon */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "mountains")}
        zIndex={getHero3DZIndex("mountains")}
      >
        {/* Atmospheric perspective — distant peaks */}
        <div
          className="absolute inset-x-[-8%] bottom-[28%] h-24 rounded-t-[100%] opacity-50 blur-sm"
          style={{
            background:
              "linear-gradient(180deg, rgba(30,55,80,0.35) 0%, rgba(15,35,55,0.55) 100%)",
          }}
        />
        <div
          className="absolute inset-x-[-5%] bottom-[24%] h-20 rounded-t-[90%] opacity-65"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,45,65,0.45) 0%, rgba(8,25,42,0.7) 100%)",
          }}
        />
        {/* Ground + teal shadow grade */}
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[linear-gradient(180deg,transparent_0%,rgba(18,45,55,0.14)_30%,rgba(6,28,38,0.55)_100%)]" />
        <div className="absolute inset-x-[-10%] bottom-0 h-32 rounded-t-[100%] bg-[#041428]/35 blur-md" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,195,130,0.18),transparent_70%)]" />
      </Hero3DLayer>

      {/* L6 · Foreground depth haze */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "foreground-haze")}
        zIndex={getHero3DZIndex("foreground-haze")}
      >
        <div
          className={cn(
            "absolute inset-0 bg-[radial-gradient(circle_at_50%_78%,rgba(255,240,215,0.28),transparent_62%)]",
            hazeDrift
          )}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#041428]/40 via-[#041428]/8 to-transparent" />
        {/* Depth atmospheric perspective */}
        <div
          className="absolute inset-0 opacity-35"
          style={{
            background:
              "linear-gradient(180deg, transparent 55%, rgba(20,50,60,0.15) 100%)",
          }}
        />
      </Hero3DLayer>

      {/* L7 · Foreground flora */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "foreground-flora")}
        zIndex={getHero3DZIndex("foreground-flora")}
      >
        <Hero3DForeground reducedMotion={reducedMotion} />
      </Hero3DLayer>

      {/* L8 · Subject silhouette + embedded lighting */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "subject")}
        zIndex={getHero3DZIndex("subject")}
      >
        <div className={cn("relative h-full w-full", !reducedMotion && "htbf-hero3d-enter-subject")}>
          <img
            src={HERO3D_ASSETS.subject}
            alt=""
            draggable={false}
            className="relative z-[1] h-full w-full object-cover object-[center_40%]"
          />
          {/* Gold rim light from sunrise */}
          <div className="absolute inset-0 z-[2] bg-[radial-gradient(circle_at_72%_36%,rgba(255,220,160,0.22),transparent_46%)] mix-blend-screen" />
          {/* Warm hair bloom */}
          <div className="absolute inset-0 z-[2] bg-[radial-gradient(ellipse_at_68%_28%,rgba(255,235,200,0.18),transparent_38%)] mix-blend-soft-light" />
          {/* Atmospheric edge lighting */}
          <div className="absolute inset-0 z-[2] bg-gradient-to-tr from-transparent via-transparent to-[#f5e0c0]/10 mix-blend-overlay" />
          {/* Shadow separation from background */}
          <div
            className="absolute inset-0 z-[2]"
            style={{
              background:
                "radial-gradient(ellipse at 50% 85%, rgba(4,16,28,0.28) 0%, transparent 55%)",
            }}
          />
        </div>
      </Hero3DLayer>

      {showFloatingCards ? (
        <>
          {/* L9 · Video testimony card */}
          <Hero3DLayer
            layerRef={layerRef(registerLayer, "glass-card-video")}
            zIndex={getHero3DZIndex("glass-card-video")}
          >
            <Hero3DVideoCard reducedMotion={reducedMotion} />
          </Hero3DLayer>

          {/* L10 · World stories card */}
          <Hero3DLayer
            layerRef={layerRef(registerLayer, "glass-card-world")}
            zIndex={getHero3DZIndex("glass-card-world")}
          >
            <Hero3DWorldCard reducedMotion={reducedMotion} />
          </Hero3DLayer>
        </>
      ) : null}

      {/* L11 · Pollen + light dust */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "particles")}
        zIndex={getHero3DZIndex("particles")}
      >
        <div className={cn(!reducedMotion && "htbf-hero3d-enter-particles")}>
          <Hero3DParticles
            reducedMotion={reducedMotion}
            lowPowerMode={lowPowerMode}
          />
        </div>
      </Hero3DLayer>
    </>
  );
}
