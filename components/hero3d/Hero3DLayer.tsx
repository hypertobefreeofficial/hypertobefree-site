"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import {
  getHero3DParallaxPx,
  getHero3DZIndex,
  HERO3D_ASSETS,
  type Hero3DLayerId,
} from "../../lib/hero3d/hero3dLayers";
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
  const ambient = reducedMotion ? "" : "htbf-hero3d-ambient";

  return (
    <>
      {/* ── L1 · Deep sky ── replace with artwork: HERO3D_ASSETS.sky */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "sky")}
        zIndex={getHero3DZIndex("sky")}
        className="bg-[linear-gradient(180deg,#030b18_0%,#0c2347_22%,#1e4a7a_48%,#c96b3a_72%,#f0c078_88%,#fff4e8_100%)]"
      />

      {/* ── L2 · Sunrise bloom ── */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "sunrise-glow")}
        zIndex={getHero3DZIndex("sunrise-glow")}
      >
        <div
          className={cn(
            "absolute left-[56%] top-[14%] h-48 w-48 -translate-x-1/2 rounded-full sm:h-60 sm:w-60",
            !reducedMotion && "htbf-hero3d-sun-breathe"
          )}
          style={{
            background:
              "radial-gradient(circle, rgba(255,228,170,0.98) 0%, rgba(255,180,90,0.55) 32%, rgba(255,140,60,0.18) 52%, transparent 72%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-[30%] h-48 bg-[radial-gradient(ellipse_at_58%_50%,rgba(255,200,120,0.42),transparent_68%)]" />
      </Hero3DLayer>

      {/* ── L3 · Far clouds ── */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "cloud-far")}
        zIndex={getHero3DZIndex("cloud-far")}
      >
        <div
          className={cn(
            "absolute left-[4%] top-[20%] h-20 w-52 rounded-full bg-white/14 blur-3xl",
            ambient,
            "htbf-hero3d-cloud-drift-a"
          )}
        />
        <div
          className={cn(
            "absolute right-[6%] top-[24%] h-24 w-60 rounded-full bg-amber-50/12 blur-3xl",
            ambient,
            "htbf-hero3d-cloud-drift-b"
          )}
        />
        <div className="absolute left-[38%] top-[16%] h-16 w-44 rounded-full bg-white/10 blur-2xl" />
      </Hero3DLayer>

      {/* ── L4 · Near clouds ── */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "cloud-near")}
        zIndex={getHero3DZIndex("cloud-near")}
      >
        <div
          className={cn(
            "absolute -left-8 top-[36%] h-28 w-72 rounded-full bg-white/22 blur-2xl",
            ambient,
            "htbf-hero3d-cloud-drift-b"
          )}
        />
        <div
          className={cn(
            "absolute -right-10 top-[40%] h-32 w-80 rounded-full bg-orange-100/18 blur-2xl",
            ambient,
            "htbf-hero3d-cloud-drift-a"
          )}
        />
      </Hero3DLayer>

      {/* ── L5 · Volumetric sun rays ── */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "sun-rays")}
        zIndex={getHero3DZIndex("sun-rays")}
      >
        <div
          className={cn(
            "absolute inset-0 opacity-50",
            !reducedMotion && "htbf-hero3d-ray-shift"
          )}
          style={{
            background: `
              conic-gradient(from 210deg at 58% 22%,
                transparent 0deg,
                rgba(255,220,160,0.14) 18deg,
                transparent 36deg,
                rgba(255,210,150,0.1) 52deg,
                transparent 70deg,
                rgba(255,200,140,0.12) 88deg,
                transparent 110deg
              )
            `,
          }}
        />
        <div className="absolute left-[42%] top-0 h-full w-[28%] bg-gradient-to-b from-amber-200/20 via-amber-100/8 to-transparent blur-2xl" />
      </Hero3DLayer>

      {/* ── L6 · Landscape + horizon warmth ── */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "landscape")}
        zIndex={getHero3DZIndex("landscape")}
      >
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[linear-gradient(180deg,transparent_0%,rgba(6,42,87,0.15)_35%,rgba(4,18,36,0.62)_100%)]" />
        <div className="absolute inset-x-[-10%] bottom-0 h-32 rounded-t-[100%] bg-[#041428]/40 blur-md" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,180,100,0.22),transparent_70%)]" />
      </Hero3DLayer>

      {/* ── L7 · Foreground atmospheric haze ── */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "foreground-haze")}
        zIndex={getHero3DZIndex("foreground-haze")}
      >
        <div
          className={cn(
            "absolute inset-0 bg-[radial-gradient(circle_at_50%_78%,rgba(255,235,200,0.32),transparent_62%)]",
            !reducedMotion && "htbf-hero3d-haze-drift"
          )}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#041428]/45 via-transparent to-transparent" />
      </Hero3DLayer>

      {/* ── L8 · Subject silhouette ── swap image via HERO3D_ASSETS.subject */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "subject")}
        zIndex={getHero3DZIndex("subject")}
      >
        <img
          src={HERO3D_ASSETS.subject}
          alt=""
          draggable={false}
          className="h-full w-full object-cover object-[center_40%]"
        />
      </Hero3DLayer>

      {/* ── L9 · Rim light + color grade (locked to subject depth) ── */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "rim-light")}
        zIndex={getHero3DZIndex("rim-light")}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_38%,rgba(255,220,160,0.28),transparent_48%)] mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-amber-100/12 mix-blend-overlay" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 42%, rgba(4,16,32,0.38) 100%)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#041428]/50 via-[#041428]/10 to-transparent" />
      </Hero3DLayer>

      {showFloatingCards ? (
        <>
          {/* ── L10 · Testimony glass card ── */}
          <Hero3DLayer
            layerRef={layerRef(registerLayer, "glass-card-video")}
            zIndex={getHero3DZIndex("glass-card-video")}
          >
            <Hero3DVideoCard reducedMotion={reducedMotion} />
          </Hero3DLayer>

          {/* ── L11 · World stories glass card ── */}
          <Hero3DLayer
            layerRef={layerRef(registerLayer, "glass-card-world")}
            zIndex={getHero3DZIndex("glass-card-world")}
          >
            <Hero3DWorldCard reducedMotion={reducedMotion} />
          </Hero3DLayer>
        </>
      ) : null}

      {/* ── L12 · Foreground particles ── */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "particles")}
        zIndex={getHero3DZIndex("particles")}
      >
        <Hero3DParticles
          reducedMotion={reducedMotion}
          lowPowerMode={lowPowerMode}
        />
      </Hero3DLayer>
    </>
  );
}
