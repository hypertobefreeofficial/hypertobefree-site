/**
 * Hero3D V3 — cinematic depth stack (back → front).
 *
 * Parallax uses absolute pixel ranges at full pointer deflection (±1).
 * Background layers move subtly; cards and particles move most, creating
 * Apple-style layered depth. Replace artwork via `HERO3D_ASSETS` or layer JSX.
 */
export type Hero3DLayerId =
  | "sky"
  | "sun-glow"
  | "cloud-high"
  | "cloud-mid"
  | "sun-rays"
  | "mountains"
  | "valley"
  | "trees"
  | "wildflowers"
  | "subject"
  | "pollen"
  | "glass-card-video"
  | "glass-card-world"
  | "dust"
  | "grasses";

export type Hero3DLayerDefinition = {
  id: Hero3DLayerId;
  parallaxPx: number;
  zIndex: number;
  label: string;
};

export const HERO3D_MAX_PARALLAX_PX = 40;

/**
 * V6 — a miniature movie set. Each element lives on its own depth plane.
 * parallaxPx ascends from back (barely moves) to front (moves most):
 * sky → mountains (slight) → subject (more) → cards (most) → grasses (the most).
 */
export const HERO3D_LAYERS: Hero3DLayerDefinition[] = [
  { id: "sky", parallaxPx: 3, zIndex: 1, label: "Deep sky (hero-sky.webp)" },
  { id: "sun-glow", parallaxPx: 4, zIndex: 2, label: "Sunrise glow / bloom" },
  { id: "cloud-high", parallaxPx: 6, zIndex: 3, label: "High clouds (hero-clouds-far.png)" },
  { id: "cloud-mid", parallaxPx: 9, zIndex: 4, label: "Mid clouds (hero-clouds-near.png)" },
  { id: "sun-rays", parallaxPx: 7, zIndex: 5, label: "Volumetric sun rays" },
  { id: "mountains", parallaxPx: 12, zIndex: 6, label: "Mountain range (hero-mountains.png)" },
  { id: "valley", parallaxPx: 15, zIndex: 7, label: "Valley + river (hero-valley.png)" },
  { id: "trees", parallaxPx: 18, zIndex: 8, label: "Distant trees (hero-trees.png)" },
  { id: "wildflowers", parallaxPx: 23, zIndex: 9, label: "Wildflowers (hero-foreground-grass.png)" },
  { id: "subject", parallaxPx: 21, zIndex: 10, label: "Freedom girl (hero-freedom-girl.png)" },
  { id: "pollen", parallaxPx: 28, zIndex: 11, label: "Floating pollen (hero-flowers-pollen.png)" },
  { id: "glass-card-video", parallaxPx: 33, zIndex: 12, label: "Video testimony card" },
  { id: "glass-card-world", parallaxPx: 35, zIndex: 13, label: "World stories card" },
  { id: "dust", parallaxPx: 37, zIndex: 14, label: "Illuminated dust" },
  { id: "grasses", parallaxPx: 40, zIndex: 15, label: "Foreground grasses (moves most)" },
];

/** Premium layered hero artwork — `public/images/hero-asset-pack/` */
export const HERO3D_ASSET_PACK = "/images/hero-asset-pack";

export const HERO3D_ASSETS = {
  sky: `${HERO3D_ASSET_PACK}/hero-sky.webp`,
  cloudsHigh: `${HERO3D_ASSET_PACK}/hero-clouds-far.png`,
  cloudsMid: `${HERO3D_ASSET_PACK}/hero-clouds-near.png`,
  mountains: `${HERO3D_ASSET_PACK}/hero-mountains.png`,
  valley: `${HERO3D_ASSET_PACK}/hero-valley.png`,
  trees: `${HERO3D_ASSET_PACK}/hero-trees.png`,
  haze: `${HERO3D_ASSET_PACK}/hero-haze.png`,
  wildflowers: `${HERO3D_ASSET_PACK}/hero-foreground-grass.png`,
  grasses: `${HERO3D_ASSET_PACK}/hero-grasses.png`,
  pollen: `${HERO3D_ASSET_PACK}/hero-flowers-pollen.png`,
  subject: `${HERO3D_ASSET_PACK}/hero-freedom-girl.png`,
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
  return `translate3d(${(offsetX * px).toFixed(2)}px, ${(offsetY * px).toFixed(2)}px, 0)`;
}
