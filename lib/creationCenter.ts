export const CREATION_CENTER_V2_ENABLED = true;
export const CREATION_CENTER_IMAGES_ENABLED = true;
export const MAX_FAITH_STREAMS = 5;

const CREATION_CENTER_IMAGE_BASE =
  "/images/backgrounds/public-pack-v1/";

export const creationCenterImages = {
  scriptureWoods: `${CREATION_CENTER_IMAGE_BASE}01-scripture-woods.PNG`,
  psalmPraise: `${CREATION_CENTER_IMAGE_BASE}03-psalm-praise.PNG`,
  lighthouseScripture: `${CREATION_CENTER_IMAGE_BASE}05-lighthouse-scripture.PNG`,
  eagleSoar: `${CREATION_CENTER_IMAGE_BASE}09-eagle-soar.PNG`,
  lakeWorship: `${CREATION_CENTER_IMAGE_BASE}14-lake-worship.PNG`,
  breakingChainsFreedom: `${CREATION_CENTER_IMAGE_BASE}18-breaking-chains-freedom.PNG`,
  valleyPraise: `${CREATION_CENTER_IMAGE_BASE}19-valley-praise.PNG`,
  beStillPrayer: `${CREATION_CENTER_IMAGE_BASE}20-be-still-psalms-prayer.PNG`,
} as const;

export type CreationCenterFormat =
  | "video"
  | "photo"
  | "written-story"
  | "voice-message"
  | "testimony-card"
  | "prayer-card"
  | "encouragement-card";

export type CreationCenterStoryType =
  | "testimony"
  | "prayer"
  | "prophecy"
  | "teaching"
  | "worship"
  | "encouragement"
  | "praise-report"
  | "deliverance-story";

export type FaithStream =
  | "healing"
  | "deliverance"
  | "prayer-warriors"
  | "worship"
  | "teachings"
  | "prophecy"
  | "encouragement"
  | "marriage"
  | "veterans"
  | "missions"
  | "salvation"
  | "freedom"
  | "scripture"
  | "revival";

export type CreationCenterTemplateId =
  | "none"
  | "scripture-woods"
  | "psalm-praise"
  | "lighthouse-scripture"
  | "eagle-freedom"
  | "breaking-chains-deliverance"
  | "be-still-prayer"
  | "lake-worship"
  | "valley-praise";

export type CreationCenterStoryTemplate = {
  id: CreationCenterTemplateId;
  label: string;
  description: string;
  imagePath: string | null;
};

export type CreationCenterPrompt = {
  id: string;
  label: string;
  placeholder: string;
};

export type CreationCenterSuggestion = {
  storyType: string;
  topics: string[];
  faithStreams: FaithStream[];
  titles: string[];
  caption: string;
  scriptureReferences: string[];
  template: string;
  layoutSuggestion: string;
};

export type CreatorStudioDesign = {
  id: string;
  studioPath:
    | "tell-story"
    | "create-design"
    | "scripture-post"
    | "ai-surprise";
  sourceMode:
    | "upload-video"
    | "upload-photo"
    | "build-ai"
    | "start-template";
  title: string;
  overlayText: string;
  caption: string;
  category: string;
  topic: string;
  templateId: CreationCenterTemplateId;
  styleMood: string;
  layoutType:
    | "full-image-poster"
    | "text-over-image-testimony"
    | "split-layout"
    | "quote-card"
    | "prayer-request-card"
    | "praise-report-card"
    | "scripture-card"
    | "photo-collage"
    | "video-photo-mixed"
    | "before-after-testimony"
    | "timeline-story"
    | "magazine-style"
    | "journal-style";
  scriptureSuggestion: string;
  suggestedPostFormat: string;
  colorPalette?: string[];
  typographyStyle?: string;
  designTreatment?: string;
  callToAction?: string;
  typographyPairing?: string;
  fontHierarchy?: string;
  backgroundTreatment?: string;
  layoutComposition?: string;
  overlayStyle?: string;
  decorativeElements?: string;
  visualTheme?: string;
  filterRecommendation?: string;
  cropRecommendation?: string;
  generatedImageUrl?: string;
  generatedImagePath?: string;
  generatedImageBucket?: string;
  imageGenerationPrompt?: string;
  alternateTitles?: string[];
  alternateCaptions?: string[];
  hashtags?: string[];
  conceptReason?: string;
  textStyle?: {
    fontSize?: "small" | "medium" | "large" | "hero";
    fontScale?: number;
    weight?: "regular" | "bold";
    italic?: boolean;
    align?: "left" | "center" | "right";
    color?: string;
    position?: "top" | "center" | "bottom";
  };
  layerStyles?: Partial<
    Record<CreatorStudioTextLayer, CreatorStudioLayerStyle>
  >;
};

export type CreatorStudioTextLayer =
  | "title"
  | "overlay"
  | "caption"
  | "scripture"
  | "callToAction";

export type CreatorStudioLayerPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type CreatorStudioLayerStyle = {
  fontSize?: "small" | "medium" | "large" | "hero";
  fontScale?: number;
  weight?: "regular" | "bold";
  italic?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  position?: CreatorStudioLayerPosition;
};

export const creatorStudioTextLayers: {
  value: CreatorStudioTextLayer;
  label: string;
  defaultPosition: CreatorStudioLayerPosition;
}[] = [
  { value: "title", label: "Title", defaultPosition: "top-center" },
  { value: "overlay", label: "Subtitle", defaultPosition: "center" },
  { value: "caption", label: "Caption", defaultPosition: "bottom-center" },
  { value: "scripture", label: "Scripture", defaultPosition: "bottom-left" },
  { value: "callToAction", label: "CTA", defaultPosition: "bottom-right" },
];

export const creatorStudioLayerPositions: CreatorStudioLayerPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export function getCreatorStudioLayerStyle(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer
): CreatorStudioLayerStyle {
  const layerDefault = creatorStudioTextLayers.find(
    (entry) => entry.value === layer
  );

  return {
    fontSize: design.textStyle?.fontSize ?? "large",
    fontScale: design.textStyle?.fontScale ?? 1,
    weight: design.textStyle?.weight ?? "bold",
    italic: design.textStyle?.italic ?? false,
    align: design.textStyle?.align ?? "left",
    color: design.textStyle?.color ?? "#FFFFFF",
    position: layerDefault?.defaultPosition ?? "center",
    ...design.layerStyles?.[layer],
  };
}

export function getCreatorStudioLayerText(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer
): string {
  switch (layer) {
    case "title":
      return design.title;
    case "overlay":
      return design.overlayText;
    case "caption":
      return design.caption;
    case "scripture":
      return design.scriptureSuggestion ?? "";
    case "callToAction":
      return design.callToAction ?? "";
  }
}

export function buildCreatorStudioLayerTextUpdate(
  layer: CreatorStudioTextLayer,
  value: string
): Partial<CreatorStudioDesign> {
  switch (layer) {
    case "title":
      return { title: value };
    case "overlay":
      return { overlayText: value };
    case "caption":
      return { caption: value };
    case "scripture":
      return { scriptureSuggestion: value };
    case "callToAction":
      return { callToAction: value };
  }
}

export function buildCreatorStudioLayerStyleUpdate(
  design: CreatorStudioDesign,
  layer: CreatorStudioTextLayer,
  updates: Partial<CreatorStudioLayerStyle>
): Partial<CreatorStudioDesign> {
  return {
    layerStyles: {
      ...design.layerStyles,
      [layer]: {
        ...getCreatorStudioLayerStyle(design, layer),
        ...updates,
      },
    },
  };
}

export type CreatorStudioTool =
  | "templates"
  | "ai"
  | "filters"
  | "text"
  | "fonts"
  | "colors"
  | "scripture"
  | "layout"
  | "publish";

export const creatorStudioTopCarousel: {
  value: CreatorStudioTool;
  label: string;
}[] = [
  { value: "templates", label: "Templates" },
  { value: "ai", label: "AI" },
  { value: "filters", label: "Filters" },
  { value: "text", label: "Text" },
  { value: "scripture", label: "Scripture" },
  { value: "layout", label: "Layouts" },
];

export const creatorStudioBottomToolbar: {
  value: CreatorStudioTool;
  label: string;
}[] = [
  { value: "text", label: "Text" },
  { value: "fonts", label: "Fonts" },
  { value: "colors", label: "Colors" },
  { value: "ai", label: "AI" },
  { value: "scripture", label: "Scripture" },
  { value: "filters", label: "Filters" },
  { value: "layout", label: "Layout" },
  { value: "publish", label: "Publish" },
];

export const creatorStudioQuickActions = [
  "More Like This",
  "Surprise Me",
  "Change Style",
  "Rewrite Text",
  "Different Scripture",
  "New Background",
] as const;

export type CreatorStudioPath = CreatorStudioDesign["studioPath"];
export type CreatorStudioSourceMode = CreatorStudioDesign["sourceMode"];
export type CreatorStudioLayoutType = CreatorStudioDesign["layoutType"];
export type CreatorStudioImageAction =
  | "AI Background"
  | "New Background"
  | "Generate Visual Design";

export type CreatorStudioImageRequest = {
  action: CreatorStudioImageAction;
  prompt: string;
  design: CreatorStudioDesign;
};

export type CreatorStudioImageResult = {
  imageUrl: string;
  imagePath: string;
  bucket: string;
  prompt: string;
};

export type CreatorStudioRequestOptions = {
  studioPath: CreatorStudioPath;
  sourceMode: CreatorStudioSourceMode;
  selectedTemplateId: CreationCenterTemplateId;
  category: string;
  topic: string;
  mood: string;
  layoutType: CreatorStudioLayoutType;
};

export const creatorStudioPathOptions: {
  value: CreatorStudioPath;
  title: string;
  description: string;
}[] = [
  {
    value: "tell-story",
    title: "Tell My Story",
    description: "Shape a testimony, prayer, or praise moment from your words.",
  },
  {
    value: "create-design",
    title: "Create a Design",
    description: "Build a polished HTBF graphic from a prompt or media.",
  },
  {
    value: "scripture-post",
    title: "Scripture Post",
    description: "Create a faith-centered reflection with reference-only guidance.",
  },
  {
    value: "ai-surprise",
    title: "AI Surprise Me",
    description: "Let HTBF create several directions from your idea.",
  },
];

export const creatorStudioCategoryOptions = [
  "Testimony",
  "Prayer Request",
  "Praise Report",
  "Deliverance",
  "Healing",
  "Worship",
  "Teaching",
  "Prophecy",
  "Encouragement",
  "Bible Study",
  "Devotional",
  "Other",
];

export const creatorStudioMoodOptions = [
  "Hopeful and bright",
  "Bold testimony",
  "Calm and prayerful",
  "Worshipful",
  "Devotional",
  "Breakthrough",
  "Warm encouragement",
  "Clean and minimal",
  "Premium cinematic",
];

export const creatorStudioLayoutOptions: {
  value: CreatorStudioDesign["layoutType"];
  label: string;
}[] = [
  { value: "full-image-poster", label: "Full image poster" },
  {
    value: "text-over-image-testimony",
    label: "Text-over-image testimony",
  },
  { value: "split-layout", label: "Split layout" },
  { value: "quote-card", label: "Quote card" },
  { value: "prayer-request-card", label: "Prayer request card" },
  { value: "praise-report-card", label: "Praise report card" },
  { value: "scripture-card", label: "Scripture card" },
  { value: "photo-collage", label: "Photo collage" },
  {
    value: "video-photo-mixed",
    label: "Video + photo mixed",
  },
  {
    value: "before-after-testimony",
    label: "Before/after testimony",
  },
  { value: "timeline-story", label: "Timeline story" },
  { value: "magazine-style", label: "Magazine style" },
  { value: "journal-style", label: "Journal style" },
];

export const creationCenterFormats: {
  value: CreationCenterFormat;
  label: string;
  description: string;
  available: boolean;
}[] = [
  {
    value: "written-story",
    label: "Write",
    description: "Tell the story in your own words.",
    available: true,
  },
  {
    value: "photo",
    label: "Photo",
    description: "Add a photo and share what it means.",
    available: true,
  },
  {
    value: "video",
    label: "Video",
    description: "Use the current HTBF video creator.",
    available: true,
  },
  {
    value: "testimony-card",
    label: "Testimony Card",
    description: "Shape a concise testimony post.",
    available: true,
  },
  {
    value: "prayer-card",
    label: "Prayer Card",
    description: "Share a prayer need with care.",
    available: true,
  },
  {
    value: "encouragement-card",
    label: "Encouragement Card",
    description: "Offer hope to someone who needs it.",
    available: true,
  },
  {
    value: "voice-message",
    label: "Voice Message",
    description: "Voice creation is being prepared.",
    available: false,
  },
];

export const creationCenterStoryTypes: {
  value: CreationCenterStoryType;
  label: string;
}[] = [
  { value: "testimony", label: "Testimony" },
  { value: "praise-report", label: "Praise Report" },
  { value: "prayer", label: "Prayer Request" },
  { value: "deliverance-story", label: "Deliverance" },
  { value: "prophecy", label: "Prophecy" },
  { value: "teaching", label: "Teaching" },
  { value: "worship", label: "Worship Moment" },
  { value: "encouragement", label: "Encouragement" },
];

export const creationCenterStoryTemplates: CreationCenterStoryTemplate[] = [
  {
    id: "none",
    label: "No Template",
    description: "Keep the clean HTBF blue style.",
    imagePath: null,
  },
  {
    id: "scripture-woods",
    label: "Scripture Woods",
    description: "A quiet, reflective scripture setting.",
    imagePath: creationCenterImages.scriptureWoods,
  },
  {
    id: "psalm-praise",
    label: "Psalm Praise",
    description: "A joyful background for praise and worship.",
    imagePath: creationCenterImages.psalmPraise,
  },
  {
    id: "lighthouse-scripture",
    label: "Lighthouse Scripture",
    description: "Guidance, hope, and steady direction.",
    imagePath: creationCenterImages.lighthouseScripture,
  },
  {
    id: "eagle-freedom",
    label: "Eagle Freedom",
    description: "A bold setting for freedom and breakthrough.",
    imagePath: creationCenterImages.eagleSoar,
  },
  {
    id: "breaking-chains-deliverance",
    label: "Breaking Chains",
    description: "A testimony background centered on deliverance.",
    imagePath: creationCenterImages.breakingChainsFreedom,
  },
  {
    id: "be-still-prayer",
    label: "Be Still Prayer",
    description: "A calm setting for prayer and reflection.",
    imagePath: creationCenterImages.beStillPrayer,
  },
  {
    id: "lake-worship",
    label: "Lake Worship",
    description: "A peaceful worship-centered background.",
    imagePath: creationCenterImages.lakeWorship,
  },
  {
    id: "valley-praise",
    label: "Valley Praise",
    description: "Hope and praise through every season.",
    imagePath: creationCenterImages.valleyPraise,
  },
];

export const faithStreamOptions: { value: FaithStream; label: string }[] = [
  { value: "healing", label: "Healing" },
  { value: "deliverance", label: "Deliverance" },
  { value: "prayer-warriors", label: "Prayer Warriors" },
  { value: "worship", label: "Worship" },
  { value: "teachings", label: "Teachings" },
  { value: "prophecy", label: "Prophecy" },
  { value: "encouragement", label: "Encouragement" },
  { value: "marriage", label: "Marriage" },
  { value: "veterans", label: "Veterans" },
  { value: "missions", label: "Missions" },
  { value: "salvation", label: "Salvation" },
  { value: "freedom", label: "Freedom" },
  { value: "scripture", label: "Scripture" },
  { value: "revival", label: "Revival" },
];

export const FAITH_STREAM_VALUES = faithStreamOptions.map(
  (option) => option.value
) as FaithStream[];

export const creationCenterPrompts: Record<
  CreationCenterStoryType,
  CreationCenterPrompt[]
> = {
  testimony: [
    {
      id: "before",
      label: "What was life like before?",
      placeholder: "Share only what feels helpful...",
    },
    {
      id: "god-did",
      label: "What did God do?",
      placeholder: "Describe the moment, process, or breakthrough...",
    },
    {
      id: "changed",
      label: "What changed?",
      placeholder: "What is different now?",
    },
    {
      id: "encouragement",
      label: "What would you say to someone walking through this?",
      placeholder: "Leave them with hope...",
    },
  ],
  prayer: [
    {
      id: "request",
      label: "What are you praying for?",
      placeholder: "Share the prayer need...",
    },
    {
      id: "who",
      label: "Who is this prayer for?",
      placeholder: "You can keep names private...",
    },
    {
      id: "breakthrough",
      label: "What breakthrough are you believing for?",
      placeholder: "Share what you are asking God to do...",
    },
  ],
  prophecy: [
    {
      id: "word",
      label: "What word or encouragement are you sharing?",
      placeholder: "Write what was placed on your heart...",
    },
    {
      id: "audience",
      label: "Who is this meant to encourage?",
      placeholder: "Describe the people or situation...",
    },
    {
      id: "context",
      label: "What discernment or context should accompany it?",
      placeholder: "Add humble, helpful context...",
    },
  ],
  teaching: [
    {
      id: "topic",
      label: "What are you teaching or reflecting on?",
      placeholder: "Name the central idea...",
    },
    {
      id: "takeaway",
      label: "What is the main takeaway?",
      placeholder: "What should someone remember?",
    },
    {
      id: "reference",
      label: "What scripture reference supports it?",
      placeholder: "Add references rather than full passages...",
    },
  ],
  worship: [
    {
      id: "moment",
      label: "What worship moment are you sharing?",
      placeholder: "Describe what happened...",
    },
    {
      id: "heart",
      label: "What did God place on your heart?",
      placeholder: "Share the reflection...",
    },
    {
      id: "reflection",
      label: "What should others pause and reflect on?",
      placeholder: "Invite the community into the moment...",
    },
  ],
  encouragement: [
    {
      id: "message",
      label: "What encouragement are you sharing?",
      placeholder: "Write the heart of the message...",
    },
    {
      id: "for-who",
      label: "Who needs to hear this?",
      placeholder: "Think about the person reading it...",
    },
    {
      id: "hope",
      label: "What hope should they hold onto?",
      placeholder: "Leave them with something steady...",
    },
  ],
  "praise-report": [
    {
      id: "praise",
      label: "What are you praising God for?",
      placeholder: "Share the good news...",
    },
    {
      id: "moment",
      label: "What happened?",
      placeholder: "Tell the moment simply...",
    },
    {
      id: "thanks",
      label: "What do you want to thank Him for?",
      placeholder: "Name what is on your heart...",
    },
  ],
  "deliverance-story": [
    {
      id: "bondage",
      label: "What did God bring you out of?",
      placeholder: "Share with the level of detail that feels right...",
    },
    {
      id: "freedom",
      label: "How did freedom come?",
      placeholder: "Describe the journey or breakthrough...",
    },
    {
      id: "now",
      label: "What is different now?",
      placeholder: "Share the change...",
    },
    {
      id: "hope",
      label: "What hope would you give someone else?",
      placeholder: "Speak to someone still waiting...",
    },
  ],
};

export function getCreationCenterFormat(
  value: CreationCenterFormat
) {
  return creationCenterFormats.find((option) => option.value === value);
}

export function isFaithStream(value: unknown): value is FaithStream {
  return (
    typeof value === "string" &&
    FAITH_STREAM_VALUES.includes(value as FaithStream)
  );
}

export function sanitizeFaithStreams(
  values: unknown,
  limit = MAX_FAITH_STREAMS
): FaithStream[] {
  if (!Array.isArray(values)) return [];

  return Array.from(new Set(values.filter(isFaithStream))).slice(0, limit);
}

export function getCreationCenterTemplate(
  templateId: CreationCenterTemplateId
) {
  return creationCenterStoryTemplates.find(
    (template) => template.id === templateId
  );
}
