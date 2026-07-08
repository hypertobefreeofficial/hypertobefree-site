"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { HERO3D_LAYERS } from "../../lib/hero3d/hero3dLayers";

type Hero3DLayerProps = {
  layerRef: (node: HTMLDivElement | null) => void;
  zIndex: number;
  className?: string;
  children?: ReactNode;
  "aria-hidden"?: boolean;
};

export function Hero3DLayer({
  layerRef,
  zIndex,
  className,
  children,
  "aria-hidden": ariaHidden = true,
}: Hero3DLayerProps) {
  return (
    <div
      ref={layerRef}
      aria-hidden={ariaHidden}
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ zIndex }}
    >
      {children}
    </div>
  );
}

export function Hero3DLayerStack({
  registerLayer,
}: {
  registerLayer: ReturnType<
    typeof import("../../hooks/useParallax").useParallax
  >["registerLayer"];
}) {
  const depth = (id: (typeof HERO3D_LAYERS)[number]["id"]) =>
    HERO3D_LAYERS.find((layer) => layer.id === id)?.depth ?? 0;

  const z = (id: (typeof HERO3D_LAYERS)[number]["id"]) =>
    HERO3D_LAYERS.find((layer) => layer.id === id)?.zIndex ?? 1;

  return (
    <>
      <Hero3DLayer
        layerRef={registerLayer(depth("sky"))}
        zIndex={z("sky")}
        className="bg-[linear-gradient(180deg,#041428_0%,#1a3a6e_28%,#c45c2a_62%,#f6b35a_82%,#fff1dc_100%)]"
      />

      <Hero3DLayer
        layerRef={registerLayer(depth("sunrise-glow"))}
        zIndex={z("sunrise-glow")}
      >
        <div className="absolute left-[58%] top-[18%] h-44 w-44 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,220,140,0.95)_0%,rgba(255,170,70,0.45)_38%,transparent_72%)] blur-[1px] sm:h-56 sm:w-56" />
        <div className="absolute inset-x-0 bottom-[34%] h-40 bg-[radial-gradient(ellipse_at_center,rgba(255,196,120,0.35),transparent_68%)]" />
      </Hero3DLayer>

      <Hero3DLayer
        layerRef={registerLayer(depth("cloud-far"))}
        zIndex={z("cloud-far")}
      >
        <div className="absolute left-[8%] top-[22%] h-16 w-40 rounded-full bg-white/20 blur-2xl" />
        <div className="absolute right-[10%] top-[28%] h-20 w-48 rounded-full bg-white/16 blur-2xl" />
        <div className="absolute left-[34%] top-[18%] h-14 w-56 rounded-full bg-amber-100/18 blur-3xl" />
      </Hero3DLayer>

      <Hero3DLayer
        layerRef={registerLayer(depth("cloud-near"))}
        zIndex={z("cloud-near")}
      >
        <div className="absolute -left-6 top-[34%] h-24 w-64 rounded-full bg-white/28 blur-xl" />
        <div className="absolute -right-8 top-[38%] h-28 w-72 rounded-full bg-orange-100/22 blur-xl" />
        <div className="absolute left-[22%] top-[42%] h-16 w-44 rounded-full bg-white/24 blur-lg" />
      </Hero3DLayer>

      <Hero3DLayer
        layerRef={registerLayer(depth("hill-silhouette"))}
        zIndex={z("hill-silhouette")}
      >
        <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[linear-gradient(180deg,transparent_0%,rgba(8,47,99,0.18)_38%,rgba(4,20,40,0.55)_100%)]" />
        <div className="absolute inset-x-[-8%] bottom-0 h-28 rounded-t-[100%] bg-[#062a57]/35 blur-sm" />
      </Hero3DLayer>

      <Hero3DLayer
        layerRef={registerLayer(depth("atmospheric-haze"))}
        zIndex={z("atmospheric-haze")}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_72%,rgba(255,240,210,0.28),transparent_58%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(4,20,40,0.22)_100%)]" />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
      </Hero3DLayer>
    </>
  );
}
