/**
 * Hero3D V3 — cinematic depth stack (back → front).
 *
 * Parallax uses absolute pixel ranges at full pointer deflection (±1).
 * Background layers move subtly; cards and particles move most, creating
 * Apple-style layered depth. Replace artwork via `HERO3D_ASSETS` or layer JSX.
 */
export type Hero3DLayerId =
  | "sky"
  | "sun"
  | "cloud-far"
  | "cloud-near"
  | "mountains"
  | "foreground-haze"
  | "foreground-flora"
  | "subject"
  | "glass-card-video"
  | "glass-card-world"
  | "particles";

export type Hero3DLayerDefinition = {
  id: Hero3DLayerId;
  parallaxPx: number;
  zIndex: number;
  label: string;
};

export const HERO3D_MAX_PARALLAX_PX = 40;

export const HERO3D_LAYERS: Hero3DLayerDefinition[] = [
  { id: "sky", parallaxPx: 4, zIndex: 1, label: "Film-graded royal sky" },
  { id: "sun", parallaxPx: 5, zIndex: 2, label: "Volumetric sunrise + rays" },
  { id: "cloud-far", parallaxPx: 6, zIndex: 3, label: "Far cloud plane" },
  { id: "cloud-near", parallaxPx: 9, zIndex: 4, label: "Near cloud plane" },
  { id: "mountains", parallaxPx: 12, zIndex: 5, label: "Mountain horizon" },
  { id: "foreground-haze", parallaxPx: 15, zIndex: 6, label: "Depth haze" },
  { id: "foreground-flora", parallaxPx: 17, zIndex: 7, label: "Grass + flora" },
  { id: "subject", parallaxPx: 20, zIndex: 8, label: "Silhouette (anchored focal)" },
  { id: "glass-card-video", parallaxPx: 28, zIndex: 9, label: "Video testimony card" },
  { id: "glass-card-world", parallaxPx: 30, zIndex: 10, label: "World stories card" },
  { id: "particles", parallaxPx: 38, zIndex: 11, label: "Pollen + light dust" },
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
  return `translate3d(${(offsetX * px).toFixed(2)}px, ${(offsetY * px).toFixed(2)}px, 0)`;
}
