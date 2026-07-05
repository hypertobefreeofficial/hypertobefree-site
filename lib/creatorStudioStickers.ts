export type CreatorStudioStickerOption = {
  id: string;
  emoji: string;
  label: string;
};

export const creatorStudioStickerOptions: CreatorStudioStickerOption[] = [
  { id: "amen", emoji: "🙏", label: "Amen" },
  { id: "praise", emoji: "🙌", label: "Praise" },
  { id: "love", emoji: "❤️", label: "Love" },
  { id: "peace", emoji: "🕊️", label: "Peace" },
  { id: "hope", emoji: "✨", label: "Hope" },
  { id: "fire", emoji: "🔥", label: "Fire" },
  { id: "scripture", emoji: "📖", label: "Scripture" },
  { id: "cross", emoji: "✝️", label: "Cross" },
  { id: "living-waters", emoji: "🌊", label: "Living Waters" },
  { id: "olive-branch", emoji: "🌿", label: "Olive Branch" },
  { id: "sunrise", emoji: "☀️", label: "Sunrise" },
];

export function getCreatorStudioStickerOption(id: string) {
  return creatorStudioStickerOptions.find((option) => option.id === id);
}
