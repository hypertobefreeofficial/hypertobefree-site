export type HTBFLoadingScene = {
  id: string;
  label: string;
  src: string;
  fallbackGradient: string;
};

export const HTBF_LOADING_SCENES: HTBFLoadingScene[] = [
  {
    id: "sunrise-hills",
    label: "Sunrise hills",
    src: "/images/loading-scenes/sunrise-hills.jpg",
    fallbackGradient:
      "radial-gradient(circle at 20% 20%, rgba(255,214,153,0.55), transparent 42%), linear-gradient(165deg, #fff8ef 0%, #fde6c8 28%, #7eb6ff 72%, #4f46e5 100%)",
  },
  {
    id: "ocean-light",
    label: "Ocean light",
    src: "/images/loading-scenes/ocean-light.jpg",
    fallbackGradient:
      "radial-gradient(circle at 75% 15%, rgba(255,255,255,0.45), transparent 35%), linear-gradient(160deg, #eef6ff 0%, #93c5fd 45%, #6366f1 100%)",
  },
  {
    id: "golden-wheat",
    label: "Golden wheat",
    src: "/images/loading-scenes/golden-wheat.jpg",
    fallbackGradient:
      "radial-gradient(circle at 50% 80%, rgba(212,175,55,0.35), transparent 40%), linear-gradient(155deg, #fffdf7 0%, #f5d78e 38%, #c084fc 100%)",
  },
  {
    id: "mountain-glow",
    label: "Mountain glow",
    src: "/images/loading-scenes/mountain-glow.jpg",
    fallbackGradient:
      "radial-gradient(circle at 30% 25%, rgba(147,197,253,0.5), transparent 38%), linear-gradient(170deg, #f8fbff 0%, #bfdbfe 35%, #4338ca 100%)",
  },
  {
    id: "soft-clouds",
    label: "Soft clouds",
    src: "/images/loading-scenes/soft-clouds.jpg",
    fallbackGradient:
      "radial-gradient(circle at 60% 30%, rgba(255,255,255,0.65), transparent 36%), linear-gradient(180deg, #fffdf8 0%, #dbeafe 55%, #818cf8 100%)",
  },
];

export const HTBF_LOADING_MESSAGES = [
  "Hope is waiting...",
  "One testimony can change everything.",
  "Welcome home.",
  "Preparing a place of encouragement...",
  "Light is breaking through...",
] as const;

export function pickRandomLoadingScene(): HTBFLoadingScene {
  const index = Math.floor(Math.random() * HTBF_LOADING_SCENES.length);
  return HTBF_LOADING_SCENES[index] ?? HTBF_LOADING_SCENES[0];
}
