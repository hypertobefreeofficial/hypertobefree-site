/**
 * Hero3D layer stack (back → front).
 *
 * Depth factors control parallax amplitude: farther layers move more on pointer
 * tilt; the subject layer moves least so the silhouette stays the focal point.
 *
 * All motion is applied via GPU `translate3d` only — no layout-affecting props.
 */
export type Hero3DLayerId =
  | "sky"
  | "sunrise-glow"
  | "cloud-far"
  | "cloud-near"
  | "hill-silhouette"
  | "subject"
  | "atmospheric-haze";

export type Hero3DLayerDefinition = {
  id: Hero3DLayerId;
  /** Parallax depth multiplier (0 = static, 1 = full range). */
  depth: number;
  zIndex: number;
  /** Max pointer displacement in px at depth 1. */
  maxTranslatePx?: number;
  label: string;
};

export const HERO3D_MAX_TRANSLATE_PX = 28;

export const HERO3D_LAYERS: Hero3DLayerDefinition[] = [
  {
    id: "sky",
    depth: 0.22,
    zIndex: 1,
    label: "Deep sky gradient",
  },
  {
    id: "sunrise-glow",
    depth: 0.16,
    zIndex: 2,
    label: "Sun disc + warm bloom",
  },
  {
    id: "cloud-far",
    depth: 0.28,
    zIndex: 3,
    label: "Distant cloud plane",
  },
  {
    id: "cloud-near",
    depth: 0.36,
    zIndex: 4,
    label: "Near cloud plane",
  },
  {
    id: "hill-silhouette",
    depth: 0.12,
    zIndex: 5,
    label: "Horizon silhouette",
  },
  {
    id: "subject",
    depth: 0.04,
    zIndex: 6,
    label: "HTBF freedom silhouette (focal)",
  },
  {
    id: "atmospheric-haze",
    depth: 0.1,
    zIndex: 7,
    label: "Foreground haze + vignette",
  },
];

export const HERO3D_SUBJECT_IMAGE = "/images/hero-freedom.png";

export function buildParallaxTransform(
  offsetX: number,
  offsetY: number,
  depth: number,
  maxTranslatePx = HERO3D_MAX_TRANSLATE_PX
): string {
  const x = offsetX * depth * maxTranslatePx;
  const y = offsetY * depth * maxTranslatePx;
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
}
