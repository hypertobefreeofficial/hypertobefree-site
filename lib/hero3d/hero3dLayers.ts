/**
 * Hero3D V2 — cinematic depth stack (back → front).
 *
 * Each layer declares an absolute parallax range in pixels at full pointer
 * deflection (offset ±1). Closer layers receive higher values so the scene
 * feels like Apple's layered wallpapers — you look *into* the sunrise, not
 * at a sliding photograph.
 *
 * Replace artwork by swapping `HERO3D_ASSETS` paths or layer JSX in
 * `Hero3DLayerStack.tsx` without touching the parallax engine.
 */
export type Hero3DLayerId =
  | "sky"
  | "sunrise-glow"
  | "cloud-far"
  | "cloud-near"
  | "sun-rays"
  | "landscape"
  | "foreground-haze"
  | "subject"
  | "rim-light"
  | "glass-card-video"
  | "glass-card-world"
  | "particles";

export type Hero3DLayerDefinition = {
  id: Hero3DLayerId;
  /** Max translate3d displacement in px when parallax offset is ±1. */
  parallaxPx: number;
  zIndex: number;
  label: string;
};

/** Upper bound used for low-end scaling; individual layers use `parallaxPx`. */
export const HERO3D_MAX_PARALLAX_PX = 40;

export const HERO3D_LAYERS: Hero3DLayerDefinition[] = [
  {
    id: "sky",
    parallaxPx: 4,
    zIndex: 1,
    label: "Deep blue gradient sky",
  },
  {
    id: "sunrise-glow",
    parallaxPx: 8,
    zIndex: 2,
    label: "Warm sunrise core + bloom",
  },
  {
    id: "cloud-far",
    parallaxPx: 6,
    zIndex: 3,
    label: "Distant cloud plane",
  },
  {
    id: "cloud-near",
    parallaxPx: 6,
    zIndex: 4,
    label: "Near cloud plane",
  },
  {
    id: "sun-rays",
    parallaxPx: 8,
    zIndex: 5,
    label: "Volumetric sun rays",
  },
  {
    id: "landscape",
    parallaxPx: 12,
    zIndex: 6,
    label: "Horizon + landscape warmth",
  },
  {
    id: "foreground-haze",
    parallaxPx: 18,
    zIndex: 7,
    label: "Atmospheric foreground haze",
  },
  {
    id: "subject",
    parallaxPx: 24,
    zIndex: 8,
    label: "HTBF freedom silhouette (focal)",
  },
  {
    id: "rim-light",
    parallaxPx: 24,
    zIndex: 9,
    label: "Rim light + color grade on subject",
  },
  {
    id: "glass-card-video",
    parallaxPx: 32,
    zIndex: 10,
    label: "Floating testimony card",
  },
  {
    id: "glass-card-world",
    parallaxPx: 32,
    zIndex: 11,
    label: "Stories around the world card",
  },
  {
    id: "particles",
    parallaxPx: 40,
    zIndex: 12,
    label: "Foreground dust + light specks",
  },
];

export const HERO3D_ASSETS = {
  subject: "/images/hero-freedom.png",
} as const;

/** @deprecated Use HERO3D_ASSETS.subject */
export const HERO3D_SUBJECT_IMAGE = HERO3D_ASSETS.subject;

export function getHero3DLayer(id: Hero3DLayerId) {
  return HERO3D_LAYERS.find((layer) => layer.id === id);
}

export function getHero3DParallaxPx(id: Hero3DLayerId, scale = 1) {
  const layer = getHero3DLayer(id);
  return (layer?.parallaxPx ?? 0) * scale;
}

export function getHero3DZIndex(id: Hero3DLayerId) {
  return getHero3DLayer(id)?.zIndex ?? 1;
}

export function buildParallaxTransform(
  offsetX: number,
  offsetY: number,
  parallaxPx: number,
  intensity = 1
): string {
  const px = parallaxPx * intensity;
  const x = offsetX * px;
  const y = offsetY * px;
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
}
