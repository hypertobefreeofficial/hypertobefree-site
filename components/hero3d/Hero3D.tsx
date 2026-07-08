"use client";

import { useCallback, useId, useRef } from "react";
import { cn } from "../../lib/cn";
import {
  HERO3D_LAYERS,
  HERO3D_SUBJECT_IMAGE,
} from "../../lib/hero3d/hero3dLayers";
import { useParallax } from "../../hooks/useParallax";
import { Hero3DLayer, Hero3DLayerStack } from "./Hero3DLayer";

export type Hero3DProps = {
  className?: string;
  /** Accessible label for the hero scene. */
  ariaLabel?: string;
  /** Show a compact motion-status badge (useful on preview pages). */
  showMotionBadge?: boolean;
  /** Optional slot for CTA copy over the scene. */
  children?: React.ReactNode;
};

export default function Hero3D({
  className,
  ariaLabel = "Sunrise scene with a person walking in freedom",
  showMotionBadge = false,
  children,
}: Hero3DProps) {
  const subjectDepth =
    HERO3D_LAYERS.find((layer) => layer.id === "subject")?.depth ?? 0.04;
  const subjectZ =
    HERO3D_LAYERS.find((layer) => layer.id === "subject")?.zIndex ?? 6;

  const {
    containerRef: parallaxContainerRef,
    registerLayer,
    mode,
    reducedMotion,
    orientationAvailable,
    orientationPermission,
    requestOrientationAccess,
  } = useParallax();

  const rootRef = useRef<HTMLElement | null>(null);
  const labelId = useId();

  const setRootRef = useCallback(
    (node: HTMLElement | null) => {
      rootRef.current = node;
      parallaxContainerRef(node);
    },
    [parallaxContainerRef]
  );

  const subjectRef = registerLayer(subjectDepth);

  return (
    <section
      ref={setRootRef}
      className={cn(
        "relative isolate overflow-hidden rounded-[2.5rem] bg-[#041428] shadow-2xl shadow-blue-950/15",
        "touch-none select-none",
        className
      )}
      aria-labelledby={children ? labelId : undefined}
      aria-label={children ? undefined : ariaLabel}
      role="img"
    >
      <div className="relative aspect-[4/5] w-full sm:aspect-[5/6] md:aspect-[16/10] lg:aspect-[16/9]">
        <Hero3DLayerStack registerLayer={registerLayer} />

        <div
          ref={subjectRef}
          className="absolute inset-0"
          style={{ zIndex: subjectZ }}
        >
          <img
            src={HERO3D_SUBJECT_IMAGE}
            alt=""
            draggable={false}
            className="h-full w-full object-cover object-[center_42%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#041428]/35 via-transparent to-transparent" />
        </div>

        {children ? (
          <div
            id={labelId}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[8] bg-gradient-to-t from-[#041428]/75 via-[#041428]/35 to-transparent px-6 pb-8 pt-24 sm:px-10 sm:pb-10"
          >
            <div className="pointer-events-auto max-w-xl">{children}</div>
          </div>
        ) : null}
      </div>

      {showMotionBadge ? (
        <div className="absolute left-4 top-4 z-[9] flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-black/45 px-3 py-1 text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm">
            {reducedMotion
              ? "Static · reduced motion"
              : mode === "mouse"
                ? "Parallax · pointer"
                : mode === "orientation"
                  ? "Parallax · device tilt"
                  : "Static · idle"}
          </span>

          {orientationAvailable &&
          orientationPermission === "prompt" &&
          !reducedMotion ? (
            <button
              type="button"
              onClick={() => void requestOrientationAccess()}
              className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-heading font-bold text-[#062a57] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b63ce]/40 focus-visible:ring-offset-2"
            >
              Enable tilt
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
