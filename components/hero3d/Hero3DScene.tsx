"use client";

import { useCallback, useRef } from "react";
import { cn } from "../../lib/cn";
import { useParallax } from "../../hooks/useParallax";
import { Hero3DApprovedCompositeArt, HERO_COMPOSITE_SENSOR_PARALLAX_PX } from "./Hero3DApprovedCompositeArt";
import { Hero3DVideoCard, Hero3DWorldCard } from "./Hero3DGlassCards";
import { Hero3DLayerStack } from "./Hero3DLayer";

export type Hero3DSceneProps = {
  className?: string;
  sceneClassName?: string;
  showFloatingCards?: boolean;
  showMotionBadge?: boolean;
  /** Homepage: render the approved composite still instead of individual layers. */
  useApprovedComposite?: boolean;
  children?: React.ReactNode;
  ariaLabel?: string;
};

export default function Hero3DScene({
  className,
  sceneClassName,
  showFloatingCards = true,
  showMotionBadge = false,
  useApprovedComposite = false,
  children,
  ariaLabel = "Cinematic sunrise scene with a person walking in freedom",
}: Hero3DSceneProps) {
  const {
    containerRef: parallaxContainerRef,
    registerLayer,
    mode,
    reducedMotion,
    lowPowerMode,
  } = useParallax();

  const rootRef = useRef<HTMLElement | null>(null);

  const setRootRef = useCallback(
    (node: HTMLElement | null) => {
      rootRef.current = node;
      parallaxContainerRef(node);
    },
    [parallaxContainerRef]
  );

  return (
    <div className={cn("relative", className)}>
      <section
        ref={setRootRef}
        className={cn(
          "htbf-hero3d-scene",
          "relative isolate overflow-hidden rounded-[2.5rem] bg-[#030b18]",
          "shadow-[0_32px_64px_-24px_rgba(4,20,40,0.45),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
          "touch-none select-none",
          sceneClassName
        )}
        aria-label={ariaLabel}
        role="img"
      >
        <div
          className={cn(
            "relative w-full h-[clamp(33rem,114vw,36rem)] md:h-auto md:aspect-[4/5] lg:aspect-[5/6]",
            !reducedMotion && "htbf-hero3d-entrance"
          )}
        >
          {useApprovedComposite ? (
            <>
              <Hero3DApprovedCompositeArt
                reducedMotion={reducedMotion}
                sensorLayerRef={registerLayer(HERO_COMPOSITE_SENSOR_PARALLAX_PX)}
              />
              {showFloatingCards ? (
                <div className="pointer-events-none absolute inset-0 z-[12]">
                  <Hero3DVideoCard reducedMotion={reducedMotion} />
                  <Hero3DWorldCard reducedMotion={reducedMotion} />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <Hero3DLayerStack
                registerLayer={registerLayer}
                showFloatingCards={showFloatingCards}
                reducedMotion={reducedMotion}
                lowPowerMode={lowPowerMode}
              />

              {/* Static V4 cinematic grade — no parallax */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[19]"
              >
                <div className="absolute inset-0 htbf-hero3d-grade-bloom-v4" />
                <div className="absolute inset-0 htbf-hero3d-grade-filmic" />
                <div className="absolute inset-0 htbf-hero3d-grade-vignette-v4" />
                <div className="absolute inset-0 htbf-hero3d-grade-teal-v4 mix-blend-multiply opacity-40" />
              </div>
            </>
          )}

          {children ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[20] bg-gradient-to-t from-[#041428]/80 via-[#041428]/25 to-transparent px-5 pb-6 pt-16 sm:px-8 sm:pb-8">
              <div className="pointer-events-auto">{children}</div>
            </div>
          ) : null}
        </div>

        {showMotionBadge ? (
          <div className="absolute left-4 top-4 z-[21] flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] font-heading font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-md ring-1 ring-white/10">
              {reducedMotion
                ? "Static · reduced motion"
                : lowPowerMode
                  ? "Lite · low power"
                  : mode === "mouse"
                    ? "Depth · pointer"
                    : mode === "orientation"
                      ? "Depth · tilt"
                      : "Static · idle"}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
