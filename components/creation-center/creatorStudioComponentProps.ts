import type { CreatorStudioDesign, CreatorStudioTextLayer } from "../../lib/creationCenter";

export type CreatorStudioSuggestionChipsProps = {
  design: CreatorStudioDesign;
  onChange: (updates: Partial<CreatorStudioDesign>) => void;
  onFocusLayer?: (layer: CreatorStudioTextLayer) => void;
};

export type CreatorStudioDesignCardsProps = {
  designs: CreatorStudioDesign[];
  selectedDesignId: string | null;
  videoPreviewUrl: string | null;
  photoPreviewUrl: string | null;
  onSelect: (design: CreatorStudioDesign) => void;
};
