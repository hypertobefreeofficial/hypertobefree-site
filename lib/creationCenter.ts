export const CREATION_CENTER_V2_ENABLED = true;
export const CREATION_CENTER_IMAGES_ENABLED = true;
export const MAX_FAITH_STREAMS = 5;

const CREATION_CENTER_IMAGE_BASE =
  "/images/backgrounds/public-pack-v1/";

export const creationCenterImages = {
  scriptureWoods: `${CREATION_CENTER_IMAGE_BASE}01-scripture-woods.png`,
  valley: `${CREATION_CENTER_IMAGE_BASE}02-valley.png`,
  psalmPraise: `${CREATION_CENTER_IMAGE_BASE}03-psalm-praise.png`,
  lighthouseScripture: `${CREATION_CENTER_IMAGE_BASE}05-lighthouse-scripture.png`,
  eagleSoar: `${CREATION_CENTER_IMAGE_BASE}09-eagle-soar.png`,
  lakeWorship: `${CREATION_CENTER_IMAGE_BASE}14-lake-worship.png`,
  breakingChainsFreedom: `${CREATION_CENTER_IMAGE_BASE}18-breaking-chains-freedom.png`,
  valleyPraise: `${CREATION_CENTER_IMAGE_BASE}19-valley-praise.png`,
  beStillPrayer: `${CREATION_CENTER_IMAGE_BASE}20-be-still-psalms-prayer.png`,
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

const faithStreamImageMap: Partial<Record<FaithStream, string>> = {
  scripture: creationCenterImages.scriptureWoods,
  teachings: creationCenterImages.scriptureWoods,
  worship: creationCenterImages.lakeWorship,
  freedom: creationCenterImages.eagleSoar,
  deliverance: creationCenterImages.breakingChainsFreedom,
  "prayer-warriors": creationCenterImages.beStillPrayer,
  encouragement: creationCenterImages.valleyPraise,
};

const storyTypeImageMap: Record<CreationCenterStoryType, string> = {
  testimony: creationCenterImages.valley,
  prayer: creationCenterImages.beStillPrayer,
  prophecy: creationCenterImages.lighthouseScripture,
  teaching: creationCenterImages.scriptureWoods,
  worship: creationCenterImages.lakeWorship,
  encouragement: creationCenterImages.valleyPraise,
  "praise-report": creationCenterImages.psalmPraise,
  "deliverance-story": creationCenterImages.breakingChainsFreedom,
};

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

export function getFaithStreamImage(stream: FaithStream) {
  if (!CREATION_CENTER_IMAGES_ENABLED) return null;

  return faithStreamImageMap[stream] ?? null;
}

export function getCreationCenterImage(
  storyType: CreationCenterStoryType,
  selectedStreams: FaithStream[] = []
) {
  if (!CREATION_CENTER_IMAGES_ENABLED) return null;

  const streamImage = selectedStreams
    .map((stream) => faithStreamImageMap[stream])
    .find(Boolean);

  return streamImage ?? storyTypeImageMap[storyType];
}
