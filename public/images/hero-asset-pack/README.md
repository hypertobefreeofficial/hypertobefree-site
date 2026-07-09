# HTBF Premium Hero Asset Pack

Cinematic faith-based layered hero artwork for the HTBF homepage parallax scene.

**Resolution:** 2560 × 1600 (16∶10)  
**Location:** `public/images/hero-asset-pack/`  
**Regenerate:** `node scripts/generate-hero-asset-pack.mjs`

## Mood & style

Golden sunrise · deep navy upper sky · warm gold horizon · soft realistic clouds · distant mountains · morning haze · rolling grass · peaceful hopeful atmosphere.

Hope, freedom, healing, peace, light, new beginning.

## Layer stack (back → front)

| # | File | Background | Description |
|---|------|------------|-------------|
| 1 | `hero-sky.webp` | Opaque | Deep navy → sunrise gold gradient sky. No subject or foreground. |
| 2 | `hero-sun-rays.png` | Transparent | Volumetric golden rays, sun bloom, brighter horizon wash. |
| 3 | `hero-clouds-far.png` | Transparent | Soft distant clouds with warm sunrise highlights, horizon fade. |
| 4 | `hero-clouds-near.png` | Transparent | Larger closer clouds, independent placement, horizon fade. |
| 5 | `hero-mountains.png` | Transparent | Muted distant mountain horizon silhouettes. |
| 6 | `hero-haze.png` | Transparent | Soft atmospheric mist and depth haze. |
| 7 | `hero-foreground-grass.png` | Transparent | Subtle rolling hill / grass silhouette. |
| 8 | `hero-flowers-pollen.png` | Transparent | Tiny flowers, dust, pollen, light particles. |
| 9 | `hero-freedom-girl.png` | Transparent | Joyful jumping silhouette girl with warm gold rim light. |

**QA composite:** `hero-composite-preview.png` — all layers stacked for visual verification.

## Regeneration

```bash
npm run generate:hero-assets
```

Procedural layers are generated from a shared cinematic palette. The freedom girl uses `assets/hero-freedom-girl-ai.png` when present (AI-enhanced cutout with transparent background); otherwise a procedural SVG fallback is used.

## Usage in Hero3D

Wire layers in `components/hero3d/Hero3DLayer.tsx` or extend `HERO3D_ASSETS` in `lib/hero3d/hero3dLayers.ts`:

```ts
export const HERO3D_ASSETS = {
  sky: "/images/hero-asset-pack/hero-sky.webp",
  sunRays: "/images/hero-asset-pack/hero-sun-rays.png",
  cloudsFar: "/images/hero-asset-pack/hero-clouds-far.png",
  cloudsNear: "/images/hero-asset-pack/hero-clouds-near.png",
  mountains: "/images/hero-asset-pack/hero-mountains.png",
  haze: "/images/hero-asset-pack/hero-haze.png",
  grass: "/images/hero-asset-pack/hero-foreground-grass.png",
  pollen: "/images/hero-asset-pack/hero-flowers-pollen.png",
  subject: "/images/hero-asset-pack/hero-freedom-girl.png",
} as const;
```

Each layer should use `object-cover` and fill its parallax plane. Transparent PNGs composite over the sky base.

## Notes

- Procedurally generated with a shared cinematic palette for perfect layer matching.
- No text, logos, clipart, or extra people.
- `hero-freedom-girl.png` is also copied to `/images/hero-freedom.png` for existing app references.
- For production, consider commissioning photorealistic replacements using this pack as a layout/color reference.
