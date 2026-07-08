"use client";

import { useCallback, useRef } from "react";
import { cn } from "../../lib/cn";
import { useParallax } from "../../hooks/useParallax";
import { Hero3DLayerStack } from "./Hero3DLayer";

export type Hero3DSceneProps = {
  className?: string;
  sceneClassName?: string;
  showFloatingCards?: boolean;
  showMotionBadge?: boolean;
  /** iOS tilt permission prompt on coarse pointers */
  showTiltPrompt?: boolean;
  children?: React.ReactNode;
  ariaLabel?: string;
};

export default function Hero3DScene({
  className,
  sceneClassName,
  showFloatingCards = true,
  showMotionBadge = false,
  showTiltPrompt = false,
  children,
  ariaLabel = "Cinematic sunrise scene with a person walking in freedom",
}: Hero3DSceneProps) {
  const {
    containerRef: parallaxContainerRef,
    registerLayer,
    mode,
    reducedMotion,
    lowPowerMode,
    orientationAvailable,
    orientationPermission,
    requestOrientationAccess,
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
          "relative isolate overflow-hidden rounded-[2.5rem] bg-[#030b18]",
          "shadow-[0_32px_64px_-24px_rgba(4,20,40,0.45),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
          "touch-none select-none",
          sceneClassName
        )}
        aria-label={ariaLabel}
        role="img"
      >
        <div className="relative aspect-[4/5] w-full sm:aspect-[5/6] md:aspect-[4/5] lg:aspect-[16/11]">
          <Hero3DLayerStack
            registerLayer={registerLayer}
            showFloatingCards={showFloatingCards}
            reducedMotion={reducedMotion}
            lowPowerMode={lowPowerMode}
          />

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

        {showTiltPrompt &&
        orientationAvailable &&
        orientationPermission === "prompt" &&
        !reducedMotion ? (
          <button
            type="button"
            onClick={() => void requestOrientationAccess()}
            className="absolute bottom-4 right-4 z-[21] rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-heading font-bold text-[#062a57] shadow-lg backdrop-blur-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b63ce]/40 focus-visible:ring-offset-2"
          >
            Enable tilt depth
          </button>
        ) : null}
      </section>
    </div>
  );
}
