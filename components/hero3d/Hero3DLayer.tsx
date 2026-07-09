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
import {
  Hero3DForegroundBokeh,
  Hero3DOOFGrass,
  Hero3DParticles,
} from "./Hero3DParticles";
import "./hero3d.css";

type Hero3DLayerProps = {
  layerRef: (node: HTMLDivElement | null) => void;
  zIndex: number;
  className?: string;
  /**
   * Cinematic scale applied to the layer's *content*, never the parallax node.
   * The parallax rAF writes translate3d to the outer node every frame, so the
   * scale lives on an inner wrapper to avoid being overwritten. "env" pushes the
   * whole world in; "subject" grows the girl from a high origin so she stays
   * fully in frame. Cards pass no zoom, so they sit embedded in the larger world.
   */
  zoom?: "env" | "subject";
  children?: ReactNode;
};

export function Hero3DLayer({
  layerRef,
  zIndex,
  className,
  zoom,
  children,
}: Hero3DLayerProps) {
  const content = zoom ? (
    <div
      className={cn(
        "absolute inset-0",
        zoom === "subject"
          ? "htbf-hero3d-subject-zoom"
          : "htbf-hero3d-env-zoom"
      )}
    >
      {children}
    </div>
  ) : (
    children
  );

  return (
    <div
      ref={layerRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ zIndex }}
    >
      {content}
    </div>
  );
}

type LayerImageProps = {
  src: string;
  className?: string;
  priority?: boolean;
};

function LayerImage({ src, className, priority = false }: LayerImageProps) {
  return (
    <div className="absolute inset-0">
      <img
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        className={cn("h-full w-full object-cover object-center", className)}
      />
    </div>
  );
}

/**
 * A cloud band that is lit by the scene's single sun. The warm light and the
 * cool underside are both masked to the cloud PNG's own alpha, so the light lands
 * on the clouds — the same sun that catches the girl — without spilling onto the
 * open sky behind them. `src` doubles as artwork and as the light mask.
 */
function Hero3DCloudBand({
  src,
  imageClassName,
}: {
  src: string;
  imageClassName?: string;
}) {
  const maskStyle = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
  } as const;

  return (
    <div className="absolute inset-0">
      <LayerImage src={src} className={imageClassName} />
      <div
        aria-hidden
        className="htbf-hero3d-cloud-light absolute inset-0"
        style={maskStyle}
      />
      <div
        aria-hidden
        className="htbf-hero3d-cloud-shade absolute inset-0"
        style={maskStyle}
      />
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
  const glowPulse = reducedMotion ? "" : "htbf-hero3d-glow-pulse";
  const rayShift = reducedMotion ? "" : "htbf-hero3d-ray-shift";
  const hazeDrift = reducedMotion ? "" : "htbf-hero3d-haze-drift";
  const driftA = reducedMotion
    ? ""
    : "htbf-hero3d-ambient htbf-hero3d-cloud-drift-a";
  const driftB = reducedMotion
    ? ""
    : "htbf-hero3d-ambient htbf-hero3d-cloud-drift-b";
  const driftC = reducedMotion
    ? ""
    : "htbf-hero3d-ambient htbf-hero3d-cloud-drift-c";

  return (
    <>
      {/* L1 · Deep sky */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "sky")}
        zIndex={getHero3DZIndex("sky")}
        zoom="env"
      >
        <LayerImage src={HERO3D_ASSETS.sky} priority />
        <div className="absolute inset-0 htbf-hero3d-grade-sky-v4" />
        <div className="absolute inset-0 htbf-hero3d-grade-teal-shadow mix-blend-multiply opacity-55" />
      </Hero3DLayer>

      {/* L2 · Sunrise glow — huge warm bloom behind the scene */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "sun-glow")}
        zIndex={getHero3DZIndex("sun-glow")}
        zoom="env"
      >
        <div
          className={cn(
            "absolute inset-0 htbf-hero3d-backlight-bloom",
            !reducedMotion && "htbf-hero3d-enter-sun",
            glowPulse
          )}
        />
        {/* Diffused sun disc — soft glowing core with a clean, breathing falloff.
            Outer element handles the entrance fade; inner breathes, so the two
            animations never contend for the same `animation` property. */}
        <div
          className={cn(
            "absolute inset-0",
            !reducedMotion && "htbf-hero3d-enter-sun"
          )}
        >
          <div
            className={cn(
              "absolute inset-0 htbf-hero3d-sun-disc",
              !reducedMotion && "htbf-hero3d-sun-breathe"
            )}
          />
        </div>
      </Hero3DLayer>

      {/* L3 · High clouds */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "cloud-high")}
        zIndex={getHero3DZIndex("cloud-high")}
        zoom="env"
      >
        <div
          className={cn(
            "absolute inset-0",
            !reducedMotion && "htbf-hero3d-enter-clouds"
          )}
        >
          <div className={cn("absolute inset-0", driftA)}>
            <Hero3DCloudBand
              src={HERO3D_ASSETS.cloudsHigh}
              imageClassName="htbf-hero3d-clouds-v4 opacity-[0.24]"
            />
          </div>
        </div>
      </Hero3DLayer>

      {/* L4 · Mid clouds */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "cloud-mid")}
        zIndex={getHero3DZIndex("cloud-mid")}
        zoom="env"
      >
        <div
          className={cn(
            "absolute inset-0",
            !reducedMotion && "htbf-hero3d-enter-clouds"
          )}
        >
          <div className={cn("absolute inset-0", driftB)}>
            <Hero3DCloudBand
              src={HERO3D_ASSETS.cloudsMid}
              imageClassName="htbf-hero3d-clouds-v4 opacity-[0.26]"
            />
          </div>
        </div>
      </Hero3DLayer>

      {/* L5 · Volumetric sun rays */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "sun-rays")}
        zIndex={getHero3DZIndex("sun-rays")}
        zoom="env"
      >
        <div className={cn("absolute inset-0 htbf-hero3d-sunbeams", rayShift)} />
      </Hero3DLayer>

      {/* L6 · Mountain range — softened w/ atmospheric haze */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "mountains")}
        zIndex={getHero3DZIndex("mountains")}
        zoom="env"
      >
        <LayerImage
          src={HERO3D_ASSETS.mountains}
          className="opacity-[0.82] saturate-[0.92] blur-[1.5px]"
        />
        <div className="absolute inset-0 htbf-hero3d-mountain-haze" />
      </Hero3DLayer>

      {/* L7 · Valley + river */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "valley")}
        zIndex={getHero3DZIndex("valley")}
        zoom="env"
      >
        <LayerImage src={HERO3D_ASSETS.valley} className="opacity-[0.72]" />
        {/* River sunlight sheen + warm scattering */}
        <div className={cn("absolute inset-0 htbf-hero3d-river-sheen", glowPulse)} />
        <div className={cn("absolute inset-0 htbf-hero3d-soft-haze-v4", hazeDrift)} />
        {/* Aerial perspective — luminous air drifting across the mid-distance */}
        <div
          className={cn(
            "absolute inset-0 htbf-hero3d-aerial-fog",
            !reducedMotion && "htbf-hero3d-fog-drift"
          )}
        />
      </Hero3DLayer>

      {/* L8 · Distant trees */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "trees")}
        zIndex={getHero3DZIndex("trees")}
        zoom="env"
      >
        <LayerImage src={HERO3D_ASSETS.trees} className="opacity-[0.8]" />
      </Hero3DLayer>

      {/* L9 · Wildflowers */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "wildflowers")}
        zIndex={getHero3DZIndex("wildflowers")}
        zoom="env"
      >
        <div className={cn("absolute inset-0 opacity-90", driftC)}>
          <LayerImage src={HERO3D_ASSETS.wildflowers} />
        </div>
      </Hero3DLayer>

      {/* L10 · Subject */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "subject")}
        zIndex={getHero3DZIndex("subject")}
        zoom="subject"
      >
        <div
          className={cn(
            "relative h-full w-full",
            !reducedMotion && "htbf-hero3d-enter-subject"
          )}
        >
          {/* Contre-jour backlight — sits behind her so the sun wraps her edges */}
          <div className="absolute inset-0 htbf-hero3d-subject-backlight" />
          <LayerImage src={HERO3D_ASSETS.subject} />
          <div
            className={cn(
              "absolute inset-0 htbf-hero3d-rim-boost mix-blend-screen",
              !reducedMotion && "htbf-hero3d-rim-shimmer"
            )}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 60% 90%, rgba(4,16,28,0.2) 0%, transparent 46%)",
            }}
          />
        </div>
      </Hero3DLayer>

      {/* L11 · Floating pollen */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "pollen")}
        zIndex={getHero3DZIndex("pollen")}
        zoom="env"
      >
        <div
          className={cn(
            "absolute inset-0 opacity-[0.66]",
            !reducedMotion && "htbf-hero3d-enter-particles"
          )}
        >
          <LayerImage src={HERO3D_ASSETS.pollen} />
        </div>
      </Hero3DLayer>

      {showFloatingCards ? (
        <>
          {/* L12 · Video testimony card */}
          <Hero3DLayer
            layerRef={layerRef(registerLayer, "glass-card-video")}
            zIndex={getHero3DZIndex("glass-card-video")}
          >
            <Hero3DVideoCard reducedMotion={reducedMotion} />
          </Hero3DLayer>

          {/* L13 · World stories card */}
          <Hero3DLayer
            layerRef={layerRef(registerLayer, "glass-card-world")}
            zIndex={getHero3DZIndex("glass-card-world")}
          >
            <Hero3DWorldCard reducedMotion={reducedMotion} />
          </Hero3DLayer>
        </>
      ) : null}

      {/* L14 · Illuminated dust */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "dust")}
        zIndex={getHero3DZIndex("dust")}
      >
        <Hero3DParticles
          reducedMotion={reducedMotion}
          lowPowerMode={lowPowerMode}
        />
      </Hero3DLayer>

      {/* L15 · Premium foreground grasses (moves most) */}
      <Hero3DLayer
        layerRef={layerRef(registerLayer, "grasses")}
        zIndex={getHero3DZIndex("grasses")}
        zoom="env"
      >
        <div className="absolute inset-0 translate-y-[13px]">
          <div className={cn("absolute inset-0 opacity-[0.8]", driftC)}>
            <LayerImage src={HERO3D_ASSETS.grasses} />
          </div>
        </div>
        <Hero3DOOFGrass reducedMotion={reducedMotion} />
        {/* Near out-of-focus bokeh — the closest plane of the depth field */}
        <Hero3DForegroundBokeh reducedMotion={reducedMotion} />
      </Hero3DLayer>
    </>
  );
}
