"use client";

import Image from "next/image";
import type { RefCallback } from "react";
import { cn } from "../../lib/cn";

export const HERO_APPROVED_COMPOSITE_SRC =
  "/images/hero-asset-pack/hero-composite-preview.png";

/** Desktop crop — woman center-right, river and flowers retained. */
export const HERO_APPROVED_COMPOSITE_OBJECT_DESKTOP = "58% 50%";

/** Mobile crop — face, arm, and river preserved in portrait frame. */
export const HERO_APPROVED_COMPOSITE_OBJECT_MOBILE = "60% 48%";

/** Pointer / device-tilt wrapper — max translate at full deflection (px). */
export const HERO_COMPOSITE_SENSOR_PARALLAX_PX = 12;

type Hero3DApprovedCompositeArtProps = {
  reducedMotion?: boolean;
  /** Interactive pointer + orientation transforms (outer motion shell). */
  sensorLayerRef?: RefCallback<HTMLDivElement>;
};

/**
 * Homepage approved composite with nested motion wrappers:
 * clip (stable) → sensor (pointer/tilt) → ambient (CSS pan/zoom) → canvas (overscan image).
 */
export function Hero3DApprovedCompositeArt({
  reducedMotion = false,
  sensorLayerRef,
}: Hero3DApprovedCompositeArtProps) {
  return (
    <div className="htbf-hero3d-composite-clip absolute inset-0 overflow-hidden">
      <div
        ref={sensorLayerRef}
        className="htbf-hero3d-composite-sensor absolute inset-0"
      >
        <div
          className={cn(
            "htbf-hero3d-composite-ambient absolute inset-0",
            !reducedMotion && "htbf-hero3d-composite-ambient-active"
          )}
        >
          <div className="htbf-hero3d-composite-canvas absolute">
            <Image
              src={HERO_APPROVED_COMPOSITE_SRC}
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 100vw, 560px"
              className="object-cover object-[60%_48%] md:object-[58%_50%]"
              draggable={false}
            />
            <div
              aria-hidden
              className="htbf-hero3d-approved-polish-glow pointer-events-none absolute inset-0"
            />
            <div
              aria-hidden
              className="htbf-hero3d-approved-polish-vignette pointer-events-none absolute inset-0"
            />
            <div
              aria-hidden
              className="htbf-hero3d-approved-polish-grain pointer-events-none absolute inset-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
