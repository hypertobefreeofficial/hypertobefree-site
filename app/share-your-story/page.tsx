"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileText,
  Globe2,
  HeartHandshake,
  ImagePlus,
  Music2,
  Send,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import StoryMediaStamp from "../../components/StoryMediaStamp";
import StoryOverlayText from "../../components/StoryOverlayText";
import CreationCenter from "../../components/creation-center/CreationCenter";
import {
  CREATION_CENTER_V2_ENABLED,
  MAX_FAITH_STREAMS,
  type FaithStream,
} from "../../lib/creationCenter";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  real_name?: string | null;
  location: string | null;
  profile_completed: boolean | null;
};

type MediaMode = "text" | "photo" | "video";
type SharePath = "quick" | "guided";
type CreationFormat =
  | "video"
  | "photo"
  | "written-story"
  | "voice-message"
  | "testimony-card"
  | "prayer-card"
  | "encouragement-card";
type GuidedStoryType =
  | "testimony"
  | "prayer"
  | "prophecy"
  | "teaching"
  | "worship"
  | "encouragement"
  | "praise-report"
  | "deliverance-story";
type PhotoDisplayStyle = "original" | "soft-rounded" | "full-width" | "framed";
type CaptionStyle =
  | "classic-caption"
  | "bold-center"
  | "bottom-banner"
  | "highlight-box"
  | "scripture-card"
  | "praise-glow"
  | "testimony-quote"
  | "minimal-white"
  | "black-outline"
  | "soft-gradient"
  | "elegant-script";
type CaptionPosition = "top" | "center" | "bottom";
type CaptionSize = "small" | "medium" | "large" | "extra-large";
type CaptionAlign = "left" | "center" | "right";
type CaptionColorPreset =
  | "white"
  | "black"
  | "deep-navy"
  | "soft-gold"
  | "prayer-blue"
  | "warm-cream"
  | "praise-green";
type CaptionColor = CaptionColorPreset | `#${string}`;
type CaptionFont =
  | "classic"
  | "bold"
  | "scripture"
  | "praise"
  | "testimony"
  | "minimal"
  | "grace-script";
type CaptionBackground =
  | "none"
  | "soft-pill"
  | "glass-blur"
  | "dark-banner"
  | "glow-box"
  | "scripture-card";
type CaptionTemplate =
  | "testimony-light"
  | "prayer-calm"
  | "scripture-focus"
  | "freedom-glow"
  | "quiet-strength"
  | "celebration-praise";
type VideoTemplate =
  | "none"
  | "htbf-logo"
  | "freedom-silhouette"
  | "shared-through-htbf"
  | "freedom-story"
  | "prayer-moment"
  | "praise-report"
  | "god-did-it";
type TextEditorPanel =
  | "template"
  | "style"
  | "bubble"
  | "color"
  | "align"
  | "size"
  | "position";
type MobileVideoTool =
  | "message"
  | "template"
  | "style"
  | "bubble"
  | "color"
  | "size"
  | "position"
  | "music"
  | "preview";
type DesktopVideoTool =
  | "message"
  | "template"
  | "style"
  | "bubble"
  | "color"
  | "size"
  | "align"
  | "position"
  | "music"
  | "emoji";
type VideoTextTarget = "overlay" | "caption";
type CaptionPositionPercent = {
  x: number;
  y: number;
};
type OverlayContext = "editor" | "freedom-feed" | "video-feed";
type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  duration_seconds?: number;
  preview_url?: string;
  audio_url?: string;
  license_status: "approved" | "pending" | "disabled";
  usage_scope?: "htbf_posts" | "testimony_only" | "praise_only";
};
type StoryShapeSuggestion = {
  storyType: GuidedStoryType | string;
  topics: string[];
  titles: string[];
  caption: string;
  scriptureReferences: string[];
  template: string;
};
type GuidedPrompt = {
  id: string;
  label: string;
};

type AiModerationDecision = {
  statusToUse: "approved" | "submitted";
  aiRiskLevel: "low" | "medium" | "high";
  aiSuggestedAction: "approve" | "review" | "reject";
  aiSummary: string;
  aiFlags: string[];
  aiReviewStatus: string;
};

const STORY_IMAGE_BUCKET = "story-images";
const creationFormatOptions: {
  label: string;
  value: CreationFormat;
  mediaMode: MediaMode;
  description: string;
}[] = [
  {
    label: "Video",
    value: "video",
    mediaMode: "video",
    description: "Use the current HTBF video upload flow.",
  },
  {
    label: "Photo",
    value: "photo",
    mediaMode: "photo",
    description: "Add a photo and shape the story around it.",
  },
  {
    label: "Written Story",
    value: "written-story",
    mediaMode: "text",
    description: "Write a testimony, teaching, prayer, or encouragement.",
  },
  {
    label: "Voice Message",
    value: "voice-message",
    mediaMode: "text",
    description: "Prepare the message now. Voice capture can be added later.",
  },
  {
    label: "Testimony Card",
    value: "testimony-card",
    mediaMode: "text",
    description: "Create a short polished testimony-style post.",
  },
  {
    label: "Prayer Card",
    value: "prayer-card",
    mediaMode: "text",
    description: "Shape a prayer request or prayer encouragement.",
  },
  {
    label: "Encouragement Card",
    value: "encouragement-card",
    mediaMode: "text",
    description: "Share a short word of hope with the community.",
  },
];

const guidedStoryTypeOptions: {
  label: string;
  value: GuidedStoryType;
  description: string;
}[] = [
  {
    label: "Testimony",
    value: "testimony",
    description: "What God has done in your life.",
  },
  {
    label: "Prayer",
    value: "prayer",
    description: "A request or prayer encouragement.",
  },
  {
    label: "Prophecy",
    value: "prophecy",
    description: "A word of encouragement shared with care.",
  },
  {
    label: "Teaching",
    value: "teaching",
    description: "A lesson, reflection, or biblical takeaway.",
  },
  {
    label: "Worship",
    value: "worship",
    description: "A worship moment or reflection.",
  },
  {
    label: "Encouragement",
    value: "encouragement",
    description: "Hope for someone who needs strength.",
  },
  {
    label: "Praise Report",
    value: "praise-report",
    description: "Celebrate what God did.",
  },
  {
    label: "Deliverance Story",
    value: "deliverance-story",
    description: "Share freedom, breakthrough, or restoration.",
  },
];

const guidedTopicOptions = [
  "Deliverance",
  "Healing",
  "Freedom",
  "Addiction",
  "Anxiety",
  "Depression",
  "Marriage",
  "Family",
  "Salvation",
  "Spiritual Warfare",
  "Revival",
  "Forgiveness",
  "Identity in Christ",
  "Breakthrough",
  "Restoration",
  "Worship",
  "Prayer",
  "Prophecy",
];

const guidedPromptMap: Record<GuidedStoryType, GuidedPrompt[]> = {
  testimony: [
    { id: "before", label: "What was life like before?" },
    { id: "god-did", label: "What did God do?" },
    { id: "changed", label: "What changed?" },
    {
      id: "encouragement",
      label: "What encouragement would you give someone else?",
    },
  ],
  prayer: [
    { id: "request", label: "What are you praying for?" },
    { id: "who", label: "Who is this prayer for?" },
    {
      id: "breakthrough",
      label: "What breakthrough are you believing for?",
    },
  ],
  prophecy: [
    {
      id: "word",
      label: "What word or encouragement are you sharing?",
    },
    {
      id: "audience",
      label: "Who is this meant to encourage?",
    },
    {
      id: "context",
      label: "Add a discernment or context note.",
    },
  ],
  teaching: [
    { id: "topic", label: "What topic are you teaching on?" },
    { id: "takeaway", label: "What is the main takeaway?" },
    {
      id: "reference",
      label: "What scripture or reference supports it?",
    },
  ],
  worship: [
    { id: "moment", label: "What worship moment are you sharing?" },
    {
      id: "heart",
      label: "What did God place on your heart?",
    },
    {
      id: "reflection",
      label: "What should others reflect on?",
    },
  ],
  encouragement: [
    { id: "message", label: "What encouragement are you sharing?" },
    { id: "for-who", label: "Who needs to hear this?" },
    { id: "hope", label: "What hope should they hold onto?" },
  ],
  "praise-report": [
    { id: "praise", label: "What are you praising God for?" },
    { id: "moment", label: "What happened?" },
    { id: "thanks", label: "What do you want to thank Him for?" },
  ],
  "deliverance-story": [
    { id: "bondage", label: "What did God bring you out of?" },
    { id: "freedom", label: "How did freedom come?" },
    { id: "now", label: "What is different now?" },
    { id: "hope", label: "What hope would you give someone else?" },
  ],
};

const mediaOptions: {
  label: string;
  value: MediaMode;
  icon: typeof FileText;
  description: string;
}[] = [
  {
    label: "Text Story",
    value: "text",
    icon: FileText,
    description: "Share a written testimony, praise report, or prayer request.",
  },
  {
    label: "Photo Story",
    value: "photo",
    icon: Camera,
    description: "Upload a photo and add the story behind it.",
  },
  {
    label: "Video Story",
    value: "video",
    icon: Video,
    description: "Upload a video testimony or encouragement.",
  },
];

const storyTypes = [
  {
    label: "Testimony",
    value: "Testimony",
    icon: Sparkles,
    description: "Share what God has done in your life.",
  },
  {
    label: "Praise Report",
    value: "Praise Report",
    icon: CheckCircle2,
    description: "Share a quick praise or answered moment.",
  },
  {
    label: "Prayer Request",
    value: "Prayer Encouragement",
    icon: HeartHandshake,
    description: "Ask the HTBF community to pray with you.",
  },
];

const emojiOptions = ["🙏", "❤️", "✝️", "🙌", "🕊️", "🔥", "😭", "✨"];

const photoDisplayOptions: { label: string; value: PhotoDisplayStyle }[] = [
  { label: "Original", value: "original" },
  { label: "Soft Rounded", value: "soft-rounded" },
  { label: "Full Width", value: "full-width" },
  { label: "Framed", value: "framed" },
];

const captionFontOptions: { label: string; value: CaptionFont }[] = [
  { label: "Classic", value: "classic" },
  { label: "Bold", value: "bold" },
  { label: "Scripture", value: "scripture" },
  { label: "Praise", value: "praise" },
  { label: "Testimony", value: "testimony" },
  { label: "Minimal", value: "minimal" },
  { label: "Grace Script", value: "grace-script" },
];

const captionBackgroundOptions: { label: string; value: CaptionBackground }[] =
  [
    { label: "No background", value: "none" },
    { label: "Soft pill", value: "soft-pill" },
    { label: "Glass blur", value: "glass-blur" },
    { label: "Dark banner", value: "dark-banner" },
    { label: "Glow box", value: "glow-box" },
    { label: "Scripture card", value: "scripture-card" },
  ];

const captionTemplateOptions: {
  label: string;
  value: CaptionTemplate;
  settings: {
    align: CaptionAlign;
    background: CaptionBackground;
    color: CaptionColor;
    font: CaptionFont;
    position: CaptionPosition;
    size: CaptionSize;
  };
}[] = [
  {
    label: "Testimony Light",
    value: "testimony-light",
    settings: {
      align: "center",
      background: "glass-blur",
      color: "soft-gold",
      font: "testimony",
      position: "bottom",
      size: "large",
    },
  },
  {
    label: "Prayer Calm",
    value: "prayer-calm",
    settings: {
      align: "center",
      background: "glass-blur",
      color: "prayer-blue",
      font: "scripture",
      position: "center",
      size: "medium",
    },
  },
  {
    label: "Scripture Focus",
    value: "scripture-focus",
    settings: {
      align: "center",
      background: "scripture-card",
      color: "deep-navy",
      font: "scripture",
      position: "top",
      size: "medium",
    },
  },
  {
    label: "Freedom Glow",
    value: "freedom-glow",
    settings: {
      align: "center",
      background: "glow-box",
      color: "soft-gold",
      font: "bold",
      position: "center",
      size: "extra-large",
    },
  },
  {
    label: "Quiet Strength",
    value: "quiet-strength",
    settings: {
      align: "left",
      background: "dark-banner",
      color: "white",
      font: "minimal",
      position: "bottom",
      size: "medium",
    },
  },
  {
    label: "Celebration Praise",
    value: "celebration-praise",
    settings: {
      align: "center",
      background: "glow-box",
      color: "soft-gold",
      font: "praise",
      position: "bottom",
      size: "large",
    },
  },
];

const videoTemplateOptions: {
  label: string;
  value: VideoTemplate;
  description: string;
}[] = [
  {
    label: "No stamp",
    value: "none",
    description: "Keep the media clean with no HTBF stamp.",
  },
  {
    label: "HTBF logo",
    value: "htbf-logo",
    description: "Small subtle HTBF logo watermark inside the media.",
  },
  {
    label: "Freedom silhouette",
    value: "freedom-silhouette",
    description: "Low-opacity freedom silhouette in the corner.",
  },
  {
    label: "Shared through HTBF",
    value: "shared-through-htbf",
    description: "A small badge that marks this as shared through HTBF.",
  },
  {
    label: "Freedom Story",
    value: "freedom-story",
    description: "A tasteful freedom story stamp for testimonies.",
  },
  {
    label: "Prayer Moment",
    value: "prayer-moment",
    description: "A gentle prayer badge for prayer-centered posts.",
  },
  {
    label: "Praise Report",
    value: "praise-report",
    description: "A warm praise badge for celebration moments.",
  },
  {
    label: "God Did It",
    value: "god-did-it",
    description: "A simple answered-prayer stamp for breakthrough stories.",
  },
];

const captionColorOptions: {
  label: string;
  value: CaptionColorPreset;
  swatchClass: string;
  hex: `#${string}`;
}[] = [
  { label: "White", value: "white", swatchClass: "bg-white", hex: "#ffffff" },
  { label: "Black", value: "black", swatchClass: "bg-slate-950", hex: "#020617" },
  { label: "Deep Navy", value: "deep-navy", swatchClass: "bg-[#062a57]", hex: "#062a57" },
  { label: "Prayer Blue", value: "prayer-blue", swatchClass: "bg-blue-200", hex: "#bfdbfe" },
  { label: "Soft Gold", value: "soft-gold", swatchClass: "bg-amber-200", hex: "#fde68a" },
  { label: "Warm Cream", value: "warm-cream", swatchClass: "bg-[#fff4d6]", hex: "#fff4d6" },
  { label: "Praise Green", value: "praise-green", swatchClass: "bg-emerald-200", hex: "#a7f3d0" },
];

const captionAlignOptions: { label: string; value: CaptionAlign }[] = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];

const captionSizeOptions: { label: string; value: CaptionSize }[] = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
  { label: "XL", value: "extra-large" },
];

const captionPositionOptions: { label: string; value: CaptionPosition }[] = [
  { label: "Top", value: "top" },
  { label: "Center", value: "center" },
  { label: "Bottom", value: "bottom" },
];

// Only approved/licensed HTBF music should be listed here.
// Do not support user-uploaded copyrighted music without rights verification.
const musicCatalog: MusicTrack[] = [];

const mobileVideoToolOptions: { label: string; value: MobileVideoTool }[] = [
  { label: "Message", value: "message" },
  { label: "Stamp", value: "template" },
  { label: "Text", value: "style" },
  { label: "Bubble", value: "bubble" },
  { label: "Color", value: "color" },
  { label: "Size", value: "size" },
  { label: "Position", value: "position" },
  { label: "Music", value: "music" },
  { label: "Preview", value: "preview" },
];

const desktopVideoToolOptions: { label: string; value: DesktopVideoTool }[] = [
  { label: "Message", value: "message" },
  { label: "Stamp", value: "template" },
  { label: "Text", value: "style" },
  { label: "Bubble", value: "bubble" },
  { label: "Color", value: "color" },
  { label: "Size", value: "size" },
  { label: "Align", value: "align" },
  { label: "Position", value: "position" },
  { label: "Music", value: "music" },
  { label: "Emoji", value: "emoji" },
];

export default function ShareYourStoryPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [sharePath, setSharePath] = useState<SharePath | null>(null);
  const [creationFormat, setCreationFormat] =
    useState<CreationFormat>("video");
  const [guidedStoryType, setGuidedStoryType] =
    useState<GuidedStoryType>("testimony");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedFaithStreams, setSelectedFaithStreams] = useState<
    FaithStream[]
  >([]);
  const [guidedPromptAnswers, setGuidedPromptAnswers] = useState<
    Record<string, string>
  >({});
  const [storyShapeSuggestion, setStoryShapeSuggestion] =
    useState<StoryShapeSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState("");

  const [mediaMode, setMediaMode] = useState<MediaMode>("text");
  const [storyType, setStoryType] = useState("Testimony");
  const [storyText, setStoryText] = useState("");
  const [overlayText, setOverlayText] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoDisplayStyle, setPhotoDisplayStyle] =
    useState<PhotoDisplayStyle>("soft-rounded");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [captionStyle, setCaptionStyle] =
    useState<CaptionStyle>("classic-caption");
  const [captionFont, setCaptionFont] = useState<CaptionFont>("classic");
  const [captionBackground, setCaptionBackground] =
    useState<CaptionBackground>("soft-pill");
  const [captionTemplate, setCaptionTemplate] =
    useState<CaptionTemplate | null>(null);
  const [videoTemplate, setVideoTemplate] =
    useState<VideoTemplate>("none");
  const [captionColor, setCaptionColor] = useState<CaptionColor>("white");
  const [captionPosition, setCaptionPosition] =
    useState<CaptionPosition>("bottom");
  const [captionSize, setCaptionSize] = useState<CaptionSize>("medium");
  const [captionAlign, setCaptionAlign] = useState<CaptionAlign>("center");
  const [mobileVideoTool, setMobileVideoTool] =
    useState<MobileVideoTool>("message");
  const [desktopVideoTool, setDesktopVideoTool] =
    useState<DesktopVideoTool>("style");
  const [desktopEmojiTarget, setDesktopEmojiTarget] =
    useState<VideoTextTarget>("overlay");
  const [mobileCaptionPositionPercent, setMobileCaptionPositionPercent] =
    useState<CaptionPositionPercent>({ x: 50, y: 78 });
  const mobileCaptionDragPointerRef = useRef<number | null>(null);
  const [message, setMessage] = useState("");

  const previewText = useMemo(
    () => (mediaMode === "video" ? overlayText : storyText).trim(),
    [mediaMode, overlayText, storyText]
  );
  const hasSelectedVideo = mediaMode === "video" && Boolean(videoFile);
  const shouldShowMessageInput = mediaMode !== "video" || hasSelectedVideo;
  const captionSizeSliderIndex = Math.max(
    0,
    captionSizeOptions.findIndex((option) => option.value === captionSize)
  );
  const selectedCaptionColorOption = captionColorOptions.find(
    (option) => option.value === captionColor
  );
  const selectedVideoTemplateLabel =
    videoTemplateOptions.find((option) => option.value === videoTemplate)
      ?.label ?? "No stamp";
  const guidedPrompts = guidedPromptMap[guidedStoryType] ?? [];

  useEffect(() => {
    async function loadPage() {
      setCheckingUser(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, email, display_name, username, real_name, location, profile_completed"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setMessage(`Could not load your profile: ${profileError.message}`);
        setCheckingUser(false);
        return;
      }

      if (
        !profileData ||
        !profileData.display_name ||
        !profileData.username ||
        profileData.profile_completed !== true
      ) {
        window.location.href = "/profile-setup";
        return;
      }

      setProfile(profileData as ProfileRow);

      const params = new URLSearchParams(window.location.search);
      const typeParam = params.get("type");

      if (typeParam === "video") {
        setSharePath("quick");
        setMediaMode("video");
      }

      if (typeParam === "photo") {
        setSharePath("quick");
        setMediaMode("photo");
      }

      if (typeParam === "prayer") {
        setSharePath("quick");
        setStoryType("Prayer Encouragement");
      }

      setCheckingUser(false);
    }

    loadPage();
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile]);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [videoFile]);

  function getPostingName() {
    return (
      profile?.display_name?.trim() ||
      profile?.username?.trim() ||
      profile?.real_name?.trim() ||
      "HTBF Community"
    );
  }

  function getPostingLocation() {
    return profile?.location?.trim() || null;
  }

  function getGuidedStoryTypeLabel(value: GuidedStoryType) {
    return (
      guidedStoryTypeOptions.find((option) => option.value === value)?.label ??
      "Testimony"
    );
  }

  function normalizeTopic(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, "-");
  }

  function selectSharePath(nextPath: SharePath) {
    setSharePath(nextPath);
    setMessage("");
    setSuggestionMessage("");

    if (nextPath === "guided") {
      applyCreationFormat(creationFormat);
      applyGuidedStoryType(guidedStoryType);
    }
  }

  function applyCreationFormat(nextFormat: CreationFormat) {
    const option = creationFormatOptions.find(
      (item) => item.value === nextFormat
    );

    setCreationFormat(nextFormat);

    if (option) {
      selectMediaMode(option.mediaMode);
    }
  }

  function applyGuidedStoryType(nextStoryType: GuidedStoryType) {
    setGuidedStoryType(nextStoryType);
    setStoryType(getGuidedStoryTypeLabel(nextStoryType));
  }

  function toggleGuidedTopic(topic: string) {
    setSelectedTopics((current) => {
      const exists = current.includes(topic);

      if (exists) {
        return current.filter((item) => item !== topic);
      }

      return [...current, topic];
    });
  }

  function toggleFaithStream(stream: FaithStream) {
    setSelectedFaithStreams((current) => {
      if (current.includes(stream)) {
        return current.filter((item) => item !== stream);
      }

      if (current.length >= MAX_FAITH_STREAMS) {
        return current;
      }

      return [...current, stream];
    });
  }

  function updateGuidedPromptAnswer(promptId: string, value: string) {
    setGuidedPromptAnswers((current) => ({
      ...current,
      [promptId]: value,
    }));
  }

  function buildGuidedDraftText() {
    const answers = guidedPrompts
      .map((prompt) => {
        const answer = guidedPromptAnswers[prompt.id]?.trim();

        if (!answer) return null;

        return `${prompt.label}\n${answer}`;
      })
      .filter(Boolean);

    return answers.join("\n\n");
  }

  function useGuidedPromptsAsCaption() {
    const draft = buildGuidedDraftText();

    if (!draft) {
      setSuggestionMessage("Add a few details first, then I can shape it.");
      return;
    }

    setStoryText(draft);
    setSuggestionMessage("Your guided answers were added to the post text.");
  }

  function applySuggestedTopics(topics: string[]) {
    const nextTopics = topics
      .map((topic) => {
        const normalizedTopic = normalizeTopic(topic);

        return (
          guidedTopicOptions.find(
            (option) => normalizeTopic(option) === normalizedTopic
          ) ?? topic
        );
      })
      .filter(Boolean);

    setSelectedTopics((current) =>
      Array.from(new Set([...current, ...nextTopics]))
    );
  }

  function applySuggestedStoryType() {
    const suggestedType = storyShapeSuggestion?.storyType
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    const matchedType = guidedStoryTypeOptions.find(
      (option) =>
        option.value === suggestedType ||
        normalizeTopic(option.label) === suggestedType
    );

    if (!matchedType) return;

    applyGuidedStoryType(matchedType.value);
    setSuggestionMessage(`Story type changed to ${matchedType.label}.`);
  }

  async function requestStoryShapeSuggestion() {
    const promptText = buildGuidedDraftText();
    const currentText = storyText.trim();

    if (!promptText && !currentText && selectedTopics.length === 0) {
      setSuggestionMessage(
        "Add a few story details first so HTBF can suggest a helpful shape."
      );
      return;
    }

    setSuggestionLoading(true);
    setSuggestionMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Please sign in again before shaping this story.");
      }

      const response = await fetch("/api/shape-story", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentFormat: creationFormat,
          storyType: guidedStoryType,
          topics: selectedTopics,
          promptAnswers: guidedPromptAnswers,
          currentText,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not shape this story right now.");
      }

      const data = await response.json();
      const suggestion: StoryShapeSuggestion = {
        storyType:
          typeof data.storyType === "string" ? data.storyType : guidedStoryType,
        topics: Array.isArray(data.topics)
          ? data.topics.filter((topic: unknown) => typeof topic === "string")
          : [],
        titles: Array.isArray(data.titles)
          ? data.titles.filter((title: unknown) => typeof title === "string")
          : [],
        caption: typeof data.caption === "string" ? data.caption : "",
        scriptureReferences: Array.isArray(data.scriptureReferences)
          ? data.scriptureReferences.filter(
              (reference: unknown) => typeof reference === "string"
            )
          : [],
        template: typeof data.template === "string" ? data.template : "",
      };

      setStoryShapeSuggestion(suggestion);
      setSuggestionMessage("Suggestions are ready. You can use or edit them.");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not shape this story.";

      setSuggestionMessage(errorMessage);
    } finally {
      setSuggestionLoading(false);
    }
  }

  function applySuggestedCaption() {
    const caption = storyShapeSuggestion?.caption.trim();

    if (!caption) return;

    setStoryText(caption);
    setSuggestionMessage("Suggested post text added. You can keep editing it.");
  }

  function applySuggestedTitle(title: string) {
    const cleanTitle = title.trim();

    if (!cleanTitle) return;

    setStoryText((current) =>
      current.trim() ? `${cleanTitle}\n\n${current.trim()}` : cleanTitle
    );
    setSuggestionMessage("Suggested title added to your post text.");
  }

  function applySuggestedScriptureReferences() {
    const references =
      storyShapeSuggestion?.scriptureReferences
        .map((reference) => reference.trim())
        .filter(Boolean) ?? [];

    if (references.length === 0) return;

    const referenceLine = `Scripture references: ${references.join(", ")}`;
    setStoryText((current) =>
      current.trim()
        ? `${current.trim()}\n\n${referenceLine}`
        : referenceLine
    );
    setSuggestionMessage("Scripture references added without verse text.");
  }

  function applySuggestedTemplate() {
    const template = storyShapeSuggestion?.template.toLowerCase() ?? "";

    if (template.includes("prayer")) {
      applyCaptionTemplate("prayer-calm");
      return;
    }

    if (template.includes("scripture") || template.includes("teaching")) {
      applyCaptionTemplate("scripture-focus");
      return;
    }

    if (template.includes("praise") || template.includes("worship")) {
      applyCaptionTemplate("celebration-praise");
      return;
    }

    if (template.includes("deliverance") || template.includes("freedom")) {
      applyCaptionTemplate("freedom-glow");
      return;
    }

    applyCaptionTemplate("testimony-light");
  }

  function selectMediaMode(nextMode: MediaMode) {
    setMediaMode(nextMode);
    setMessage("");

    if (nextMode !== "photo") {
      removePhoto();
    }

    if (nextMode !== "video") {
      removeVideo();
    }
  }

  function appendToken(current: string, token: string) {
    if (!current.trim()) {
      return token;
    }

    return `${current} ${token}`;
  }

  function addEmoji(emoji: string) {
    if (mediaMode === "video" && desktopEmojiTarget === "overlay") {
      setOverlayText((current) => appendToken(current, emoji));
      return;
    }

    setStoryText((current) => appendToken(current, emoji));
  }

  function markTemplateCustom() {
    setCaptionTemplate(null);
  }

  function changeCaptionFont(nextFont: CaptionFont) {
    setCaptionFont(nextFont);
    setCaptionStyle(getLegacyCaptionStyle(nextFont, captionBackground));
    markTemplateCustom();
  }

  function changeCaptionBackground(nextBackground: CaptionBackground) {
    setCaptionBackground(nextBackground);
    setCaptionStyle(getLegacyCaptionStyle(captionFont, nextBackground));
    markTemplateCustom();
  }

  function changeCaptionColor(nextColor: CaptionColor) {
    setCaptionColor(nextColor);
    markTemplateCustom();
  }

  function changeCaptionSize(nextSize: CaptionSize) {
    setCaptionSize(nextSize);
    markTemplateCustom();
  }

  function changeCaptionAlign(nextAlign: CaptionAlign) {
    setCaptionAlign(nextAlign);
    markTemplateCustom();
  }

  function applyCaptionTemplate(template: CaptionTemplate) {
    const option = captionTemplateOptions.find(
      (item) => item.value === template
    );

    if (!option) return;

    setCaptionTemplate(template);
    setCaptionAlign(option.settings.align);
    setCaptionBackground(option.settings.background);
    setCaptionColor(option.settings.color);
    setCaptionFont(option.settings.font);
    setCaptionPosition(option.settings.position);
    setCaptionSize(option.settings.size);
    setCaptionStyle(
      getLegacyCaptionStyle(option.settings.font, option.settings.background)
    );
    setMobileCaptionPositionPercent(
      getCaptionPositionPercent(option.settings.position)
    );
  }

  function getCaptionPositionPercent(
    position: CaptionPosition
  ): CaptionPositionPercent {
    if (position === "top") return { x: 50, y: 20 };
    if (position === "center") return { x: 50, y: 50 };
    return { x: 50, y: 78 };
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoDisplayStyle("soft-rounded");
  }

  function removeVideo() {
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setOverlayText("");
    setDesktopVideoTool("style");
    setDesktopEmojiTarget("overlay");
    setMobileVideoTool("message");
    setMobileCaptionPositionPercent({ x: 50, y: 78 });
  }

  function handlePhotoSelect(file: File | null) {
    if (!file) {
      setPhotoFile(null);
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setMessage("Please upload a JPEG, PNG, or WebP photo.");
      return;
    }

    setMessage("");
    setPhotoFile(file);
    setMediaMode("photo");
  }

  function handleVideoSelect(file: File | null) {
    setMessage("");
    setVideoFile(file);

    if (file) {
      setMediaMode("video");
      setDesktopVideoTool("style");
      setMobileVideoTool("message");
      setMobileCaptionPositionPercent({ x: 50, y: 78 });
    }
  }

  function updateMobileCaptionPositionFromPointer(event: PointerEvent<HTMLElement>) {
    const previewBounds =
      event.currentTarget.parentElement?.getBoundingClientRect();

    if (!previewBounds) return;

    event.preventDefault();
    event.stopPropagation();

    const captionBounds = event.currentTarget.getBoundingClientRect();
    const halfCaptionWidthPercent =
      ((captionBounds.width / 2) / previewBounds.width) * 100;
    const halfCaptionHeightPercent =
      ((captionBounds.height / 2) / previewBounds.height) * 100;

    const nextX = clamp(
      ((event.clientX - previewBounds.left) / previewBounds.width) * 100,
      halfCaptionWidthPercent + 2,
      100 - halfCaptionWidthPercent - 2
    );
    const nextY = clamp(
      ((event.clientY - previewBounds.top) / previewBounds.height) * 100,
      halfCaptionHeightPercent + 2,
      100 - halfCaptionHeightPercent - 2
    );

    setMobileCaptionPositionPercent({ x: nextX, y: nextY });
    markTemplateCustom();
  }

  function startMobileCaptionDrag(event: PointerEvent<HTMLElement>) {
    mobileCaptionDragPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateMobileCaptionPositionFromPointer(event);
  }

  function dragMobileCaption(event: PointerEvent<HTMLElement>) {
    if (mobileCaptionDragPointerRef.current !== event.pointerId) return;

    updateMobileCaptionPositionFromPointer(event);
  }

  function stopMobileCaptionDrag(event: PointerEvent<HTMLElement>) {
    if (mobileCaptionDragPointerRef.current !== event.pointerId) return;

    mobileCaptionDragPointerRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function selectCaptionPosition(position: CaptionPosition) {
    setCaptionPosition(position);
    setMobileCaptionPositionPercent(getCaptionPositionPercent(position));
    markTemplateCustom();
  }

  function selectMobileCaptionShortcut(position: CaptionPosition) {
    selectCaptionPosition(position);
  }

  async function moderateStoryText({
    finalStoryType,
    cleanStoryText,
    hasVideo,
    hasPhoto,
  }: {
    finalStoryType: string;
    cleanStoryText: string;
    hasVideo: boolean;
    hasPhoto: boolean;
  }): Promise<AiModerationDecision> {
    try {
      const response = await fetch("/api/moderate-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          story_type: finalStoryType,
          story_text: cleanStoryText,
          has_video: hasVideo,
          has_photo: hasPhoto,
        }),
      });

      if (!response.ok) {
        throw new Error("AI moderation route failed.");
      }

      const data = await response.json();

      return {
        statusToUse:
          data.statusToUse === "approved" ? "approved" : "submitted",
        aiRiskLevel:
          data.aiRiskLevel === "low" ||
          data.aiRiskLevel === "medium" ||
          data.aiRiskLevel === "high"
            ? data.aiRiskLevel
            : "medium",
        aiSuggestedAction:
          data.aiSuggestedAction === "approve" ||
          data.aiSuggestedAction === "review" ||
          data.aiSuggestedAction === "reject"
            ? data.aiSuggestedAction
            : "review",
        aiSummary:
          typeof data.aiSummary === "string"
            ? data.aiSummary
            : "AI Assist completed with no summary.",
        aiFlags: Array.isArray(data.aiFlags) ? data.aiFlags : [],
        aiReviewStatus:
          typeof data.aiReviewStatus === "string"
            ? data.aiReviewStatus
            : "completed",
      };
    } catch (error) {
      console.error("Moderation failed:", error);

      return {
        statusToUse: "submitted",
        aiRiskLevel: "medium",
        aiSuggestedAction: "review",
        aiSummary:
          "AI Assist could not complete the review, so this upload was sent to admin review.",
        aiFlags: ["moderation_unavailable"],
        aiReviewStatus: "failed",
      };
    }
  }

  function createVideoThumbnail(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const objectUrl = URL.createObjectURL(file);

      video.src = objectUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        try {
          video.currentTime = Math.min(0.5, video.duration || 0.5);
        } catch {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Could not seek video for thumbnail."));
        }
      };

      video.onseeked = () => {
        try {
          canvas.width = video.videoWidth || 720;
          canvas.height = video.videoHeight || 1280;

          const context = canvas.getContext("2d");

          if (!context) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Could not create thumbnail canvas."));
            return;
          }

          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);

              if (!blob) {
                reject(new Error("Could not create video thumbnail."));
                return;
              }

              resolve(blob);
            },
            "image/jpeg",
            0.82
          );
        } catch {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Could not capture video thumbnail."));
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not load video for thumbnail."));
      };
    });
  }

  async function uploadPhotoIfNeeded(
    currentUserId: string
  ): Promise<string | null> {
    if (!photoFile) return null;

    const fileExtension = photoFile.name.split(".").pop() || "jpg";
    const cleanExtension = fileExtension.toLowerCase();
    const photoFileName = `${currentUserId}/${Date.now()}-${crypto.randomUUID()}.${cleanExtension}`;

    const { error: photoUploadError } = await supabase.storage
      .from(STORY_IMAGE_BUCKET)
      .upload(photoFileName, photoFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: photoFile.type || "image/jpeg",
      });

    if (photoUploadError) {
      throw new Error(photoUploadError.message);
    }

    return photoFileName;
  }

  async function uploadVideoIfNeeded(currentUserId: string) {
    if (!videoFile) {
      return {
        videoUrl: null as string | null,
        thumbnailUrl: null as string | null,
      };
    }

    const fileExtension = videoFile.name.split(".").pop() || "mp4";
    const cleanExtension = fileExtension.toLowerCase();
    const videoFileName = `${currentUserId}/${Date.now()}-${crypto.randomUUID()}.${cleanExtension}`;

    const { error: videoUploadError } = await supabase.storage
      .from("story-videos")
      .upload(videoFileName, videoFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: videoFile.type || "video/mp4",
      });

    if (videoUploadError) {
      throw new Error(videoUploadError.message);
    }

    const { data: videoPublicData } = supabase.storage
      .from("story-videos")
      .getPublicUrl(videoFileName);

    const videoPublicUrl = videoPublicData.publicUrl;

    let thumbnailUrl: string | null = null;

    try {
      const thumbnailBlob = await createVideoThumbnail(videoFile);
      const thumbnailFileName = `${currentUserId}/${Date.now()}-${crypto.randomUUID()}.jpg`;

      const { error: thumbnailUploadError } = await supabase.storage
        .from("story-thumbnails")
        .upload(thumbnailFileName, thumbnailBlob, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        });

      if (thumbnailUploadError) {
        throw new Error(
          `Thumbnail upload failed: ${thumbnailUploadError.message}`
        );
      }

      const { data: thumbnailPublicData } = supabase.storage
        .from("story-thumbnails")
        .getPublicUrl(thumbnailFileName);

      thumbnailUrl = thumbnailPublicData.publicUrl;
    } catch (thumbnailError) {
      const errorMessage =
        thumbnailError instanceof Error
          ? thumbnailError.message
          : "Thumbnail creation failed.";

      throw new Error(errorMessage);
    }

    return {
      videoUrl: videoPublicUrl,
      thumbnailUrl,
    };
  }

  function getSubmitStoryText() {
    const cleanStoryText = storyText.trim();

    if (cleanStoryText || sharePath !== "guided") {
      return cleanStoryText;
    }

    return buildGuidedDraftText().trim();
  }

  function isCreationMetadataColumnError(message: string) {
    return [
      "content_type",
      "topics",
      "creation_mode",
      "ai_suggestions",
    ].some((column) => message.includes(column));
  }

  async function submitStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId || !profile) {
      setMessage("Please sign in before sharing.");
      return;
    }

    const cleanStoryText = getSubmitStoryText();
    const cleanOverlayText = overlayText.trim();
    const moderationText = [cleanStoryText, cleanOverlayText]
      .filter(Boolean)
      .join("\n\n");
    const hasPhoto = mediaMode === "photo" && Boolean(photoFile);
    const hasVideo = mediaMode === "video" && Boolean(videoFile);

    if (!cleanStoryText && !cleanOverlayText && !hasPhoto && !hasVideo) {
      setMessage(
        "Please write a story, prayer request, praise report, or upload a photo or video."
      );
      return;
    }

    if (mediaMode === "photo" && !hasPhoto) {
      setMessage("Please upload a photo or choose text story only.");
      return;
    }

    if (mediaMode === "video" && !hasVideo) {
      setMessage("Please upload a video or choose text story only.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const finalStoryType =
        sharePath === "guided"
          ? getGuidedStoryTypeLabel(guidedStoryType)
          : mediaMode === "video"
            ? "Video Testimony"
            : mediaMode === "photo"
              ? "Photo Story"
              : storyType;
      const finalContentType =
        sharePath === "guided" ? creationFormat : mediaMode;
      const finalTopics =
        sharePath === "guided"
          ? selectedTopics.map((topic) => normalizeTopic(topic))
          : [];
      const creationMode = sharePath === "guided" ? "guided" : "quick";
      const suggestionPayload =
        sharePath === "guided"
          ? {
              prompts: guidedPromptAnswers,
              suggestions: storyShapeSuggestion,
            }
          : {};

      setMessage("Checking your post...");

      const moderationDecision = await moderateStoryText({
        finalStoryType,
        cleanStoryText: moderationText,
        hasVideo,
        hasPhoto,
      });

      setMessage("Uploading your post...");

      const imagePath = hasPhoto ? await uploadPhotoIfNeeded(userId) : null;
      const { videoUrl, thumbnailUrl } = hasVideo
        ? await uploadVideoIfNeeded(userId)
        : { videoUrl: null, thumbnailUrl: null };

      const storyPayload = {
        user_id: userId,
        name: getPostingName(),
        location: getPostingLocation(),
        story_type: finalStoryType,
        story_text: cleanStoryText || null,
        overlay_text: hasVideo ? cleanOverlayText || null : null,
        overlay_x: hasVideo ? mobileCaptionPositionPercent.x : null,
        overlay_y: hasVideo ? mobileCaptionPositionPercent.y : null,
        image_url: imagePath,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        video_template:
          mediaMode === "photo" || hasVideo ? videoTemplate : null,
        htbf_watermark_enabled:
          mediaMode === "photo" || hasVideo
            ? videoTemplate === "htbf-logo"
            : null,
        silhouette_watermark_enabled:
          mediaMode === "photo" || hasVideo
            ? videoTemplate === "freedom-silhouette"
            : null,
        shared_htbf_intro_enabled:
          mediaMode === "photo" || hasVideo
            ? videoTemplate === "shared-through-htbf"
            : null,
        caption_style:
          mediaMode === "photo" || mediaMode === "video"
            ? captionStyle
            : null,
        caption_font:
          mediaMode === "photo" || mediaMode === "video" ? captionFont : null,
        caption_background:
          mediaMode === "photo" || mediaMode === "video"
            ? captionBackground
            : null,
        caption_template: mediaMode === "photo" ? captionTemplate : null,
        caption_color:
          mediaMode === "photo" || mediaMode === "video"
            ? captionColor
            : null,
        caption_size:
          mediaMode === "photo" || mediaMode === "video"
            ? captionSize
            : null,
        caption_align:
          mediaMode === "photo" || mediaMode === "video"
            ? captionAlign
            : null,
        text_size: "text-medium",
        text_style: "style-clean",
        text_position: "position-bottom-left",
        text_background: "background-dark",
        status: moderationDecision.statusToUse,
        ai_review_status: moderationDecision.aiReviewStatus,
        ai_reviewed_at: new Date().toISOString(),
        ai_risk_level: moderationDecision.aiRiskLevel,
        ai_suggested_action: moderationDecision.aiSuggestedAction,
        ai_flags: moderationDecision.aiFlags,
        ai_summary: moderationDecision.aiSummary,
      };

      const storyPayloadWithCreationMetadata = {
        ...storyPayload,
        content_type: finalContentType,
        topics: finalTopics,
        creation_mode: creationMode,
        ai_suggestions: suggestionPayload,
      };

      const { error } = await supabase
        .from("stories")
        .insert(storyPayloadWithCreationMetadata);

      if (error) {
        if (isCreationMetadataColumnError(error.message)) {
          const { error: fallbackError } = await supabase
            .from("stories")
            .insert(storyPayload);

          if (fallbackError) {
            throw new Error(fallbackError.message);
          }
        } else {
          throw new Error(error.message);
        }
      }

      const wentLiveInstantly = moderationDecision.statusToUse === "approved";

      setStoryText("");
      setOverlayText("");
      setSelectedTopics([]);
      setSelectedFaithStreams([]);
      setGuidedPromptAnswers({});
      setStoryShapeSuggestion(null);
      setSuggestionMessage("");
      removePhoto();
      removeVideo();
      setMediaMode("text");
      setStoryType("Testimony");

      setMessage(
        wentLiveInstantly
          ? "Your post is live on HTBF."
          : "Your post was submitted for admin review before appearing publicly."
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong.";

      setMessage(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  function renderMessageInput({
    label,
    placeholder,
    rows = 8,
  }: {
    label: string;
    placeholder: string;
    rows?: number;
  }) {
    return (
      <div className="w-full max-w-full overflow-hidden">
        <label className="mb-2 block text-sm font-black text-[#062a57]">
          {label}
        </label>

        <textarea
          value={storyText}
          onChange={(event) => setStoryText(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full max-w-full resize-none overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
          style={{
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        />

        <div className="mt-3 flex max-w-full flex-wrap gap-2 overflow-hidden">
          {emojiOptions.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xl ring-1 ring-slate-200 transition hover:bg-blue-50"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderVideoCaptionContextInput() {
    return (
      <div className="w-full max-w-full overflow-hidden rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="mb-2 block text-sm font-black text-[#062a57]">
          Caption / context
        </label>

        <textarea
          value={storyText}
          onChange={(event) => setStoryText(event.target.value)}
          onFocus={() => setDesktopEmojiTarget("caption")}
          rows={4}
          placeholder="Add context about what happened, what God did, or why this moment matters..."
          className="w-full max-w-full resize-none overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
          style={{
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        />

        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          This appears below the video as the post caption. The short video
          message above is the only text shown directly on the video.
        </p>
      </div>
    );
  }

  function renderSafetyNotice() {
    return (
      <div className="rounded-[1.5rem] bg-amber-50 p-4 text-sm leading-6 text-amber-900 ring-1 ring-amber-100">
        <div className="font-black">HTBF safety review</div>
        <p className="mt-1">
          Most low-risk posts can appear quickly. Posts that need a closer look
          may go to admin review before appearing publicly.
        </p>
      </div>
    );
  }

  function renderStatusMessage() {
    if (!message) return null;

    return (
      <div className="rounded-[1.5rem] bg-blue-50 p-4 text-sm font-bold leading-6 text-[#082f63] ring-1 ring-blue-100">
        {message}
      </div>
    );
  }

  function renderShareEntryScreen() {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
            Choose how you want to share
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-[#062a57]">
            Fast upload or guided story?
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Quick Share keeps the current working upload flow. Create a Story
            helps shape a more searchable, meaningful HTBF post.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => selectSharePath("quick")}
            className="group rounded-[1.75rem] bg-blue-50 p-5 text-left ring-1 ring-blue-100 transition hover:bg-blue-100"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b63ce] text-white">
              <Upload className="h-6 w-6" />
            </div>
            <div className="mt-4 text-xl font-black text-[#062a57]">
              Quick Share
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Upload a video, photo, or written story with the current HTBF
              flow.
            </p>
            <div className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100">
              Start quick upload
            </div>
          </button>

          <button
            type="button"
            onClick={() => selectSharePath("guided")}
            className="group rounded-[1.75rem] bg-gradient-to-br from-[#082f63] to-[#0b63ce] p-5 text-left text-white shadow-lg shadow-blue-950/10 transition hover:scale-[1.01]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="mt-4 text-xl font-black">Create a Story</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-blue-100">
              Choose a format, name what God is doing, and get gentle help
              shaping the post.
            </p>
            <div className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce]">
              Open Creation Center
            </div>
          </button>
        </div>
      </div>
    );
  }

  function renderCreationCenter() {
    if (sharePath !== "guided") return null;

    return (
      <div className="space-y-5 rounded-[2rem] bg-gradient-to-br from-blue-50 to-white p-4 ring-1 ring-blue-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
              Creation Center
            </div>
            <h2 className="mt-1 text-2xl font-black text-[#062a57]">
              Help shape your story
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
              Choose the heart of the post, then keep editing anything before
              you submit.
            </p>
          </div>

          <button
            type="button"
            onClick={() => selectSharePath("quick")}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-50"
          >
            Switch to Quick Share
          </button>
        </div>

        <div>
          <div className="mb-2 text-sm font-black text-[#062a57]">
            1. Choose content format
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {creationFormatOptions.map((option) => {
              const selected = creationFormat === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => applyCreationFormat(option.value)}
                  className={`rounded-[1.25rem] p-3 text-left ring-1 transition ${
                    selected
                      ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : "bg-white text-slate-700 ring-slate-200 hover:bg-blue-50"
                  }`}
                >
                  <div className="text-sm font-black">{option.label}</div>
                  <p
                    className={`mt-1 text-xs font-semibold leading-5 ${
                      selected ? "text-blue-50" : "text-slate-500"
                    }`}
                  >
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-black text-[#062a57]">
            2. What are you sharing?
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {guidedStoryTypeOptions.map((option) => {
              const selected = guidedStoryType === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => applyGuidedStoryType(option.value)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ring-1 transition ${
                    selected
                      ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : "bg-white text-slate-700 ring-slate-200 hover:bg-blue-50"
                  }`}
                  title={option.description}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-black text-[#062a57]">
            3. What is God doing?
          </div>
          <div className="flex max-w-full flex-wrap gap-2">
            {guidedTopicOptions.map((topic) => {
              const selected = selectedTopics.includes(topic);

              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => toggleGuidedTopic(topic)}
                  className={`rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                    selected
                      ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50"
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-black text-[#062a57]">
            4. Guided creation
          </div>
          <div className="grid gap-3">
            {guidedPrompts.map((prompt) => (
              <label key={prompt.id} className="block">
                <span className="mb-1.5 block text-xs font-black text-slate-600">
                  {prompt.label}
                </span>
                <textarea
                  value={guidedPromptAnswers[prompt.id] ?? ""}
                  onChange={(event) =>
                    updateGuidedPromptAnswer(prompt.id, event.target.value)
                  }
                  rows={2}
                  className="w-full resize-none rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  placeholder="Write a few honest details..."
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={useGuidedPromptsAsCaption}
            className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-50"
          >
            Use these as my post text
          </button>
        </div>

        <div className="rounded-[1.5rem] bg-white p-4 ring-1 ring-blue-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black text-[#062a57]">
                5. Suggested shape
              </div>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Get title ideas, themes, a polished caption, and scripture
                references you can accept, edit, or remove.
              </p>
            </div>

            <button
              type="button"
              onClick={requestStoryShapeSuggestion}
              disabled={suggestionLoading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {suggestionLoading ? "Shaping..." : "Help me shape this"}
            </button>
          </div>

          {suggestionMessage && (
            <div className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-[#082f63]">
              {suggestionMessage}
            </div>
          )}

          {storyShapeSuggestion && (
            <div className="mt-4 space-y-3">
              {storyShapeSuggestion.storyType && (
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Suggested story type
                  </div>
                  <button
                    type="button"
                    onClick={applySuggestedStoryType}
                    className="rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
                  >
                    Use:{" "}
                    {titleCaseStoryShapeValue(storyShapeSuggestion.storyType)}
                  </button>
                </div>
              )}

              {storyShapeSuggestion.titles.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Suggested title
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {storyShapeSuggestion.titles.map((title) => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => applySuggestedTitle(title)}
                        className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-[#062a57]"
                      >
                        Use: {title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {storyShapeSuggestion.topics.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Suggested themes
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {storyShapeSuggestion.topics.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 ring-1 ring-emerald-100"
                      >
                        {topic}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        applySuggestedTopics(storyShapeSuggestion.topics)
                      }
                      className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
                    >
                      Add themes
                    </button>
                  </div>
                </div>
              )}

              {storyShapeSuggestion.caption && (
                <div className="rounded-[1.25rem] bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Polished post text
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
                    {storyShapeSuggestion.caption}
                  </p>
                  <button
                    type="button"
                    onClick={applySuggestedCaption}
                    className="mt-3 rounded-full bg-[#0b63ce] px-4 py-2 text-xs font-black text-white"
                  >
                    Use this text
                  </button>
                </div>
              )}

              {storyShapeSuggestion.scriptureReferences.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    Scripture references
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {storyShapeSuggestion.scriptureReferences.map(
                      (reference) => (
                        <span
                          key={reference}
                          className="rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 ring-1 ring-amber-100"
                        >
                          {reference}
                        </span>
                      )
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={applySuggestedScriptureReferences}
                    className="mt-2 rounded-full bg-white px-3 py-2 text-xs font-black text-amber-900 ring-1 ring-amber-100"
                  >
                    Add references
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applySuggestedTemplate}
                  className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-100"
                >
                  Try suggested post layout
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStoryShapeSuggestion(null);
                    setSuggestionMessage("");
                  }}
                  className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-600"
                >
                  Clear suggestions
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderSubmitControls() {
    return (
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Link
          href="/journey"
          className="inline-flex items-center justify-center rounded-full bg-slate-100 px-6 py-4 text-base font-black text-slate-700 hover:bg-slate-200"
        >
          Not Yet
        </Link>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-4 text-base font-black text-white shadow-sm hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-48"
        >
          {submitting ? "Submitting..." : "Submit for Review"}
          <Send className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-slate-200">
          Loading share page...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f8fbff] pb-24 text-slate-900">
      <div className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-6">
        <div className="mb-5 flex items-center justify-between">
          <Link
            href="/journey"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#082f63] shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </Link>

          <div className="rounded-full bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
            SHARE YOUR STORY
          </div>
        </div>

        <section className="w-full max-w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            SHARE YOUR STORY
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-tight">
            What has God done?
          </h1>

          <p className="mt-3 max-w-2xl leading-7 text-blue-100">
            Share a testimony, praise report, prayer request, photo, or video
            with the HTBF community.
          </p>
        </section>

        <section className="mt-5 w-full max-w-full overflow-hidden rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {!sharePath ? (
            renderShareEntryScreen()
          ) : (
            <>
          <div className="mb-5 rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              Posting as
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#062a57] ring-1 ring-slate-200">
                {getPostingName()}
              </span>

              {getPostingLocation() && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-200">
                  <Globe2 className="h-4 w-4" />
                  {getPostingLocation()}
                </span>
              )}
            </div>
          </div>

          <form onSubmit={submitStory} className="space-y-5">
            {sharePath === "quick" && (
              <div className="flex flex-col gap-3 rounded-[1.5rem] bg-blue-50 p-4 ring-1 ring-blue-100 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
                    Quick Share
                  </div>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                    This is the current HTBF upload flow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSharePath(null)}
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-100"
                >
                  Change path
                </button>
              </div>
            )}

            {sharePath === "guided" && CREATION_CENTER_V2_ENABLED ? (
              <CreationCenter
                format={creationFormat}
                storyType={guidedStoryType}
                selectedStreams={selectedFaithStreams}
                promptAnswers={guidedPromptAnswers}
                onFormatChange={applyCreationFormat}
                onStoryTypeChange={applyGuidedStoryType}
                onToggleStream={toggleFaithStream}
                onPromptAnswerChange={updateGuidedPromptAnswer}
                onUsePromptAnswers={useGuidedPromptsAsCaption}
                onSwitchToQuickShare={() => selectSharePath("quick")}
              />
            ) : (
              renderCreationCenter()
            )}

            {sharePath === "quick" && (
            <div>
              <label className="mb-2 block text-sm font-black text-[#062a57]">
                Choose your story format
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                {mediaOptions.map((item) => {
                  const Icon = item.icon;
                  const selected = mediaMode === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => selectMediaMode(item.value)}
                      className={`rounded-[1.5rem] p-4 text-left ring-1 transition ${
                        selected
                          ? "bg-blue-50 ring-blue-200"
                          : "bg-white ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                            selected
                              ? "bg-[#0b63ce] text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="font-black text-[#062a57]">
                          {item.label}
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-slate-500">
                        {item.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {sharePath === "quick" && mediaMode === "text" && (
              <div>
                <label className="mb-2 block text-sm font-black text-[#062a57]">
                  What are you sharing?
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  {storyTypes.map((item) => {
                    const Icon = item.icon;
                    const selected = storyType === item.value;

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setStoryType(item.value)}
                        className={`rounded-[1.5rem] p-4 text-left ring-1 transition ${
                          selected
                            ? "bg-blue-50 ring-blue-200"
                            : "bg-white ring-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            selected ? "text-[#0b63ce]" : "text-slate-500"
                          }`}
                        />
                        <div className="mt-2 font-black text-[#062a57]">
                          {item.label}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {item.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {shouldShowMessageInput &&
              mediaMode !== "video" &&
              renderMessageInput({
                label: "Your message",
                placeholder:
                  "Share what God did, what you’re praying for, or what encouraged you...",
              })}

            {mediaMode === "photo" && (
              <div>
                <label className="mb-2 block text-sm font-black text-[#062a57]">
                  Photo
                </label>

                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-4">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.25rem] bg-white px-4 py-6 text-center ring-1 ring-slate-200 hover:bg-slate-50">
                    <ImagePlus className="h-8 w-8 text-[#0b63ce]" />

                    <div className="mt-3 text-sm font-black text-[#062a57]">
                      Upload a photo
                    </div>

                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      JPEG, PNG, and WebP images are supported.
                    </div>

                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        handlePhotoSelect(event.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>

                  {photoFile && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-[#082f63]">
                      <div className="flex min-w-0 items-center gap-2">
                        <ImagePlus className="h-4 w-4 shrink-0" />
                        <span className="truncate">{photoFile.name}</span>
                      </div>

                      <button
                        type="button"
                        onClick={removePhoto}
                        className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-red-600 ring-1 ring-red-100"
                      >
                        Remove Photo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {photoPreviewUrl && (
              <div className="w-full max-w-full overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
                      Preview
                    </div>
                    <div className="mt-1 text-lg font-black text-[#062a57]">
                      Photo Story
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Choose how your message should appear with this photo.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={removePhoto}
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100"
                  >
                    Remove Photo
                  </button>
                </div>

                <div className="mb-4">
                  <div className="mb-2 text-sm font-black text-[#062a57]">
                    Display style
                  </div>
                  <SegmentedOptionGroup
                    options={photoDisplayOptions}
                    value={photoDisplayStyle}
                    onChange={(value) =>
                      setPhotoDisplayStyle(value as PhotoDisplayStyle)
                    }
                  />
                </div>

                <div className="max-w-full overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
                  <div className="p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-black text-[#0b63ce]">
                        {getPostingName().charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <div
                            className="min-w-0 max-w-full break-words font-black text-slate-900"
                            style={{
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {getPostingName()}
                          </div>

                          <span className="text-sm text-slate-400">•</span>

                          <span className="max-w-full break-words rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0b63ce]">
                            Photo Story
                          </span>
                        </div>

                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-500">
                          <Globe2 className="h-4 w-4 shrink-0" />
                          <span
                            className="min-w-0 max-w-full break-words"
                            style={{
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {getPostingLocation() || "Location not shared"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className={getPhotoFeedPreviewFrameClass(
                      photoDisplayStyle
                    )}
                  >
                    <div className="relative overflow-hidden rounded-[1.5rem]">
                      <img
                        src={photoPreviewUrl}
                        alt="Selected story photo preview"
                        className={getPhotoPreviewImageClass(photoDisplayStyle)}
                      />

                      <StoryMediaStamp stamp={videoTemplate} />

                      {previewText && captionStyle !== "classic-caption" && (
                        <StoryOverlayText
                          alignment={captionAlign}
                          background={captionBackground}
                          color={captionColor}
                          font={captionFont}
                          overlayContext="editor"
                          overlayX={getCaptionPositionPercent(captionPosition).x}
                          overlayY={getCaptionPositionPercent(captionPosition).y}
                          size={captionSize}
                          style={captionStyle}
                          text={previewText}
                        />
                      )}
                    </div>
                  </div>

                  {previewText && captionStyle === "classic-caption" && (
                    <div className="p-5 pt-4">
                      <p
                        className="max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-2xl bg-slate-50 px-4 py-3 text-[17px] leading-7 text-slate-800 ring-1 ring-slate-200"
                        style={{
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {previewText}
                      </p>
                    </div>
                  )}
                </div>

                <CaptionStyleControls
                  background={captionBackground}
                  dark={false}
                  font={captionFont}
                  onBackgroundChange={changeCaptionBackground}
                  onFontChange={changeCaptionFont}
                  onTemplateChange={applyCaptionTemplate}
                  color={captionColor}
                  onColorChange={changeCaptionColor}
                  position={captionPosition}
                  onPositionChange={selectCaptionPosition}
                  size={captionSize}
                  onSizeChange={changeCaptionSize}
                  align={captionAlign}
                  onAlignChange={changeCaptionAlign}
                  template={captionTemplate}
                />

                <div className="rounded-[1.5rem] bg-white p-4 ring-1 ring-slate-200">
                  <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
                    Optional media stamp
                  </div>
                  <VideoTemplatePicker
                    value={videoTemplate}
                    onChange={setVideoTemplate}
                  />
                </div>
              </div>
            )}

            {mediaMode === "video" && (
              <div className={videoPreviewUrl ? "hidden sm:block" : undefined}>
                <label className="mb-2 block text-sm font-black text-[#062a57]">
                  Video
                </label>

                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-4">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.25rem] bg-white px-4 py-6 text-center ring-1 ring-slate-200 hover:bg-slate-50">
                    <Upload className="h-8 w-8 text-[#0b63ce]" />

                    <div className="mt-3 text-sm font-black text-[#062a57]">
                      Upload a video
                    </div>

                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      iPhone videos, MOV, MP4, and normal phone videos are okay.
                    </div>

                    <input
                      type="file"
                      accept="video/*"
                      onChange={(event) =>
                        handleVideoSelect(event.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                  </label>

                  {videoFile && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-[#082f63]">
                      <div className="flex min-w-0 items-center gap-2">
                        <ImagePlus className="h-4 w-4 shrink-0" />
                        <span className="truncate">{videoFile.name}</span>
                      </div>

                      <button
                        type="button"
                        onClick={removeVideo}
                        className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-red-600 ring-1 ring-red-100"
                      >
                        Remove Video
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {videoPreviewUrl && (
              <div className="sm:hidden w-full max-w-full min-w-0 overflow-hidden rounded-[1.75rem] bg-slate-950 p-3 text-white shadow-sm ring-1 ring-slate-800">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-200">
                      HTBF Mobile Creator Studio
                    </div>
                    <div className="mt-1 text-base font-black">Video Story</div>
                  </div>

                  <button
                    type="button"
                    onClick={removeVideo}
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-red-600 ring-1 ring-white/10"
                  >
                    Remove
                  </button>
                </div>

                <div className="relative w-full max-w-full overflow-hidden rounded-[1.5rem] bg-black ring-1 ring-white/10">
                  <video
                    src={videoPreviewUrl}
                    autoPlay
                    muted
                    loop
                    controls
                    playsInline
                    preload="metadata"
                    className="block max-h-[58vh] w-full bg-slate-900 object-contain"
                  />

                  <StoryMediaStamp stamp={videoTemplate} />

                  {previewText ? (
                    <MobileDraggableCaptionOverlay
                      alignment={captionAlign}
                      background={captionBackground}
                      color={captionColor}
                      font={captionFont}
                      onPointerDown={startMobileCaptionDrag}
                      onPointerMove={dragMobileCaption}
                      onPointerUp={stopMobileCaptionDrag}
                      positionPercent={mobileCaptionPositionPercent}
                      size={captionSize}
                      style={captionStyle}
                      text={previewText}
                    />
                  ) : (
                    <div className="pointer-events-none absolute inset-x-4 bottom-20 z-10 rounded-2xl bg-black/55 px-4 py-3 text-center text-sm font-bold text-white/85 backdrop-blur">
                      Tap Message to add text
                    </div>
                  )}
                </div>

                <div className="sticky bottom-3 z-20 mt-3 w-full max-w-full overflow-hidden rounded-[1.5rem] bg-white/95 p-2 text-slate-900 shadow-xl ring-1 ring-white/30 backdrop-blur">
                  <div className="flex w-full max-w-full gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {mobileVideoToolOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMobileVideoTool(option.value)}
                        className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-black transition ${
                          mobileVideoTool === option.value
                            ? "bg-[#0b63ce] text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-blue-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2 w-full max-w-full min-w-0 overflow-hidden">
                    {mobileVideoTool === "message" && (
                      <div>
                        <label className="mb-1.5 block text-xs font-black text-[#062a57]">
                          Video message
                        </label>
                        <textarea
                          value={overlayText}
                          onChange={(event) =>
                            setOverlayText(event.target.value)
                          }
                          rows={3}
                          placeholder="Share what God did..."
                          className="w-full max-w-full resize-none overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                          style={{
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        />
                      </div>
                    )}

                    {mobileVideoTool === "template" && (
                      <VideoTemplatePicker
                        value={videoTemplate}
                        onChange={setVideoTemplate}
                      />
                    )}

                    {mobileVideoTool === "style" && (
                      <div className="flex w-full max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {captionFontOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => changeCaptionFont(option.value)}
                            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                              captionFont === option.value
                                ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                                : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-blue-50"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {mobileVideoTool === "bubble" && (
                      <div className="flex w-full max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {captionBackgroundOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              changeCaptionBackground(option.value)
                            }
                            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                              captionBackground === option.value
                                ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                                : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-blue-50"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {mobileVideoTool === "color" && (
                      <div className="flex w-full max-w-full items-center gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {captionColorOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => changeCaptionColor(option.value)}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 transition ${
                              captionColor === option.value
                                ? "ring-[#0b63ce]"
                                : "ring-transparent"
                            }`}
                            aria-label={option.label}
                            title={option.label}
                          >
                            <span
                              className={`h-7 w-7 rounded-full ring-1 ring-black/10 ${option.swatchClass}`}
                            />
                          </button>
                        ))}

                        <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-slate-50 px-3 text-xs font-black text-slate-700 ring-1 ring-slate-200">
                          Custom
                          <span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[conic-gradient(from_0deg,#ef4444,#f59e0b,#facc15,#22c55e,#06b6d4,#2563eb,#7c3aed,#ec4899,#ef4444)] ring-1 ring-black/10">
                            <input
                              type="color"
                              value={getCaptionColorPickerValue(captionColor)}
                              onChange={(event) =>
                                changeCaptionColor(
                                  event.target.value as CaptionColor
                                )
                              }
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                              aria-label="Choose custom text color"
                            />
                          </span>
                        </label>
                      </div>
                    )}

                    {mobileVideoTool === "size" && (
                      <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="mb-2 flex items-center justify-between text-xs font-black text-[#062a57]">
                          <span>Text size</span>
                          <span>
                            {
                              captionSizeOptions.find(
                                (option) => option.value === captionSize
                              )?.label
                            }
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={captionSizeOptions.length - 1}
                          step={1}
                          value={captionSizeSliderIndex}
                          onChange={(event) =>
                            changeCaptionSize(
                              captionSizeOptions[Number(event.target.value)]
                                ?.value ?? "medium"
                            )
                          }
                          className="w-full accent-[#0b63ce]"
                          aria-label="Text size"
                        />
                        <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-500">
                          {captionSizeOptions.map((option) => (
                            <span key={option.value}>{option.label}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {mobileVideoTool === "position" && (
                      <div>
                        <div className="grid w-full max-w-full grid-cols-3 gap-1 rounded-full bg-slate-50 p-1 ring-1 ring-slate-200">
                          {captionPositionOptions.map((option) => (
                            <ToolbarChip
                              key={option.value}
                              active={captionPosition === option.value}
                              dark={false}
                              label={option.label}
                              onClick={() =>
                                selectMobileCaptionShortcut(option.value)
                              }
                            />
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500">
                          Drag the text directly on the video for custom
                          placement.
                        </p>
                      </div>
                    )}

                    {mobileVideoTool === "music" && (
                      <MusicComingSoonPanel dark={false} />
                    )}

                    {mobileVideoTool === "preview" && (
                      <div className="rounded-2xl bg-blue-50 p-3 text-sm leading-6 text-[#082f63] ring-1 ring-blue-100">
                        <div className="text-xs font-black uppercase tracking-[0.14em]">
                          Preview mode
                        </div>
                        <p className="mt-1 font-semibold">
                          The video canvas above shows how your message will
                          look in the post preview area.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {videoPreviewUrl && (
              <div className="mt-3 sm:hidden">
                {renderVideoCaptionContextInput()}
              </div>
            )}

            {videoPreviewUrl && (
              <div className="mt-3 space-y-3 sm:hidden">
                {renderStatusMessage()}
                {renderSubmitControls()}
              </div>
            )}

            {videoPreviewUrl && (
              <div className="hidden w-full max-w-full overflow-hidden rounded-[2rem] bg-slate-950 p-5 text-white shadow-sm ring-1 ring-slate-800 sm:block">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">
                      HTBF Creator Studio
                    </div>
                    <div className="mt-1 text-2xl font-black">Video Story</div>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                      Place a short message on the video, add context below it,
                      and preview everything while you edit.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={removeVideo}
                    className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-black text-red-600 ring-1 ring-white/10 hover:bg-red-50"
                  >
                    Remove Video
                  </button>
                </div>

                <div className="flex w-full max-w-full min-w-0 flex-col gap-5 overflow-hidden">
                  <div className="min-w-0 max-w-full">
                    <div className="rounded-[1.75rem] bg-slate-950 p-3 text-white shadow-lg ring-1 ring-white/10">
                      <div className="mb-3 flex items-center justify-between gap-3 px-1">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-200">
                            Live canvas
                          </div>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            Drag the text on the video to position it.
                          </p>
                        </div>

                        <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-blue-100">
                          {captionPositionOptions.find(
                            (option) => option.value === captionPosition
                          )?.label ?? "Bottom"}
                        </div>
                      </div>

                      <div className="mx-auto w-full max-w-full overflow-hidden rounded-[1.5rem] bg-black ring-1 ring-white/10">
                        <div className="relative h-[min(78dvh,820px)] min-h-[620px] w-full overflow-hidden rounded-[1.5rem] bg-black">
                          <video
                            src={videoPreviewUrl}
                            controls
                            playsInline
                            className="h-full w-full bg-black object-cover object-center"
                          />

                          <StoryMediaStamp stamp={videoTemplate} />

                          {previewText ? (
                            <MobileDraggableCaptionOverlay
                              alignment={captionAlign}
                              background={captionBackground}
                              color={captionColor}
                              font={captionFont}
                              onPointerDown={startMobileCaptionDrag}
                              onPointerMove={dragMobileCaption}
                              onPointerUp={stopMobileCaptionDrag}
                              overlayContext="video-feed"
                              positionPercent={mobileCaptionPositionPercent}
                              size={captionSize}
                              style={captionStyle}
                              text={previewText}
                            />
                          ) : (
                            <div className="pointer-events-none absolute inset-x-8 bottom-8 z-10 rounded-2xl bg-black/55 px-4 py-3 text-center text-sm font-bold text-white/85 backdrop-blur">
                              Add short words for the video.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-[1.75rem] bg-white p-4 text-slate-900 ring-1 ring-white/10">
                    <div className="rounded-[1.5rem] bg-blue-50 p-3 ring-1 ring-blue-100">
                      <label className="mb-2 block text-sm font-black text-[#062a57]">
                        Text on video
                      </label>
                      <textarea
                        value={overlayText}
                        onChange={(event) => setOverlayText(event.target.value)}
                        onFocus={() => {
                          setDesktopEmojiTarget("overlay");
                          setDesktopVideoTool("message");
                        }}
                        rows={3}
                        placeholder="Add short words that appear on the video..."
                        className="w-full max-w-full resize-none overflow-hidden rounded-[1.25rem] border border-blue-100 bg-white px-4 py-3 text-base leading-7 text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        style={{
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      />
                    </div>

                    <div className="min-w-0 max-w-full overflow-hidden rounded-[1.5rem] bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-xs font-black uppercase tracking-[0.16em] text-[#0b63ce]">
                          Creator tools
                        </div>
                        <div className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#0b63ce] ring-1 ring-blue-100">
                          {selectedVideoTemplateLabel}
                        </div>
                      </div>

                      <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 ring-1 ring-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {desktopVideoToolOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setDesktopVideoTool(option.value)}
                            className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-black transition ${
                              desktopVideoTool === option.value
                                ? "bg-[#0b63ce] text-white"
                                : "text-slate-600 hover:bg-blue-50 hover:text-[#0b63ce]"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-[1.25rem] bg-white p-3 ring-1 ring-slate-200">
                        {desktopVideoTool === "message" && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold leading-6 text-slate-600">
                            <span>
                              Type short words above, then drag the text on the
                              video to place it.
                            </span>
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#0b63ce]">
                              Video text
                            </span>
                          </div>
                        )}

                        {desktopVideoTool === "template" && (
                          <VideoTemplatePicker
                            value={videoTemplate}
                            onChange={setVideoTemplate}
                          />
                        )}

                        {desktopVideoTool === "style" && (
                          <div className="flex max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {captionFontOptions.map((option) => {
                              const selected = captionFont === option.value;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => changeCaptionFont(option.value)}
                                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                                    selected
                                      ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                                      : "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-blue-50 hover:text-[#0b63ce]"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {desktopVideoTool === "bubble" && (
                          <div className="flex max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {captionBackgroundOptions.map((option) => {
                              const selected =
                                captionBackground === option.value;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() =>
                                    changeCaptionBackground(option.value)
                                  }
                                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                                    selected
                                      ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                                      : "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-blue-50 hover:text-[#0b63ce]"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {desktopVideoTool === "color" && (
                          <div className="flex max-w-full items-center gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {captionColorOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => changeCaptionColor(option.value)}
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 transition ${
                                  captionColor === option.value
                                    ? "ring-[#0b63ce]"
                                    : "ring-transparent"
                                }`}
                                aria-label={option.label}
                                title={option.label}
                              >
                                <span
                                  className={`h-7 w-7 rounded-full ring-1 ring-black/10 ${option.swatchClass}`}
                                />
                              </button>
                            ))}

                            <label
                              className={`flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 text-xs font-black ring-1 ${
                                selectedCaptionColorOption
                                  ? "bg-slate-50 text-slate-700 ring-slate-200"
                                  : "bg-[#0b63ce] text-white ring-[#0b63ce]"
                              }`}
                            >
                              Custom
                              <input
                                type="color"
                                value={getCaptionColorPickerValue(captionColor)}
                                onChange={(event) =>
                                  changeCaptionColor(
                                    event.target.value as CaptionColor
                                  )
                                }
                                className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                                aria-label="Choose custom text color"
                              />
                            </label>
                          </div>
                        )}

                        {desktopVideoTool === "size" && (
                          <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                            <div className="mb-2 flex items-center justify-between text-xs font-black text-[#062a57]">
                              <span>Text size</span>
                              <span>
                                {
                                  captionSizeOptions.find(
                                    (option) => option.value === captionSize
                                  )?.label
                                }
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={captionSizeOptions.length - 1}
                              step={1}
                              value={captionSizeSliderIndex}
                              onChange={(event) =>
                                changeCaptionSize(
                                  captionSizeOptions[
                                    Number(event.target.value)
                                  ]?.value ?? "medium"
                                )
                              }
                              className="w-full accent-[#0b63ce]"
                              aria-label="Text size"
                            />
                            <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-500">
                              {captionSizeOptions.map((option) => (
                                <span key={option.value}>{option.label}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {desktopVideoTool === "align" && (
                          <div className="grid max-w-full grid-cols-3 gap-1 rounded-full bg-slate-50 p-1 ring-1 ring-slate-200">
                            {captionAlignOptions.map((option) => (
                              <ToolbarChip
                                key={option.value}
                                active={captionAlign === option.value}
                                dark={false}
                                label={option.label}
                                onClick={() => changeCaptionAlign(option.value)}
                              />
                            ))}
                          </div>
                        )}

                        {desktopVideoTool === "position" && (
                          <div>
                            <div className="grid max-w-full grid-cols-3 gap-1 rounded-full bg-slate-50 p-1 ring-1 ring-slate-200">
                              {captionPositionOptions.map((option) => (
                                <ToolbarChip
                                  key={option.value}
                                  active={captionPosition === option.value}
                                  dark={false}
                                  label={option.label}
                                  onClick={() =>
                                    selectCaptionPosition(option.value)
                                  }
                                />
                              ))}
                            </div>
                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                              Drag text on video to fine-tune.
                            </p>
                          </div>
                        )}

                        {desktopVideoTool === "music" && (
                          <MusicComingSoonPanel dark={false} />
                        )}

                        {desktopVideoTool === "emoji" && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-50 p-1 ring-1 ring-slate-200">
                              <ToolbarChip
                                active={desktopEmojiTarget === "overlay"}
                                dark={false}
                                label="Add to video text"
                                onClick={() => setDesktopEmojiTarget("overlay")}
                              />
                              <ToolbarChip
                                active={desktopEmojiTarget === "caption"}
                                dark={false}
                                label="Add to caption/context"
                                onClick={() => setDesktopEmojiTarget("caption")}
                              />
                            </div>

                            <div className="flex max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {emojiOptions.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => addEmoji(emoji)}
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xl ring-1 ring-slate-200 transition hover:bg-blue-50"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {renderVideoCaptionContextInput()}

                    {renderSafetyNotice()}
                    {renderStatusMessage()}
                    {renderSubmitControls()}
                  </div>
                </div>
              </div>
            )}

            {!hasSelectedVideo && (
              <>
                {renderSafetyNotice()}
                {renderStatusMessage()}
                {renderSubmitControls()}
              </>
            )}
          </form>
            </>
          )}
        </section>
      </div>

    </main>
  );
}

function CaptionStyleControls({
  align,
  background,
  color,
  dark,
  font,
  onAlignChange,
  onBackgroundChange,
  onColorChange,
  onFontChange,
  onPositionChange,
  onSizeChange,
  onTemplateChange,
  position,
  size,
  template,
}: {
  align: CaptionAlign;
  background: CaptionBackground;
  color: CaptionColor;
  dark: boolean;
  font: CaptionFont;
  onAlignChange: (value: CaptionAlign) => void;
  onBackgroundChange: (value: CaptionBackground) => void;
  onColorChange: (value: CaptionColor) => void;
  onFontChange: (value: CaptionFont) => void;
  onPositionChange: (value: CaptionPosition) => void;
  onSizeChange: (value: CaptionSize) => void;
  onTemplateChange: (value: CaptionTemplate) => void;
  position: CaptionPosition;
  size: CaptionSize;
  template: CaptionTemplate | null;
}) {
  const [activePanel, setActivePanel] = useState<TextEditorPanel>("template");
  const selectedTemplateLabel =
    captionTemplateOptions.find((option) => option.value === template)?.label ??
    "Custom";
  const selectedColorOption = captionColorOptions.find(
    (option) => option.value === color
  );
  const colorPickerValue = getCaptionColorPickerValue(color);

  return (
    <div
      className={`mx-auto mt-4 w-full max-w-md min-w-0 overflow-hidden rounded-[1.5rem] p-3 ring-1 ${
        dark ? "bg-white/10 ring-white/10" : "bg-blue-50 ring-blue-100"
      }`}
    >
      <div className="mb-2 flex min-w-0 max-w-full items-center justify-between gap-3">
        <div
          className={`min-w-0 text-xs font-black uppercase tracking-[0.14em] ${
            dark ? "text-white" : "text-[#062a57]"
          }`}
        >
          Text tools
        </div>

        <div
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${
            dark ? "bg-white/10 text-blue-100" : "bg-white text-[#0b63ce]"
          }`}
        >
          {selectedTemplateLabel}
        </div>
      </div>

      <div
        className={`flex max-w-full gap-1 overflow-x-auto rounded-full p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          dark ? "bg-black/25" : "bg-white"
        }`}
      >
        <ToolbarButton
          active={activePanel === "template"}
          dark={dark}
          label="Preset"
          onClick={() => setActivePanel("template")}
          title="HTBF templates"
        />
        <ToolbarButton
          active={activePanel === "style"}
          dark={dark}
          label="Aa"
          onClick={() => setActivePanel("style")}
          title="Font and style"
        />
        <ToolbarButton
          active={activePanel === "bubble"}
          dark={dark}
          label="Bubble"
          onClick={() => setActivePanel("bubble")}
          title="Bubble and background"
        />
        <ToolbarButton
          active={activePanel === "color"}
          dark={dark}
          onClick={() => setActivePanel("color")}
          title="Text color"
        >
          <span
            className={`h-4 w-4 rounded-full ring-1 ring-black/10 ${
              selectedColorOption?.swatchClass ?? ""
            }`}
            style={
              selectedColorOption
                ? undefined
                : { backgroundColor: colorPickerValue }
            }
          />
        </ToolbarButton>
        <ToolbarButton
          active={activePanel === "align"}
          dark={dark}
          label={align === "left" ? "≡" : align === "right" ? "≣" : "☰"}
          onClick={() => setActivePanel("align")}
          title="Text alignment"
        />
        <ToolbarButton
          active={activePanel === "size"}
          dark={dark}
          label={size === "extra-large" ? "XL" : "Tt"}
          onClick={() => setActivePanel("size")}
          title="Text size"
        />
        <ToolbarButton
          active={activePanel === "position"}
          dark={dark}
          label="↕"
          onClick={() => setActivePanel("position")}
          title="Text position"
        />
      </div>

      <div className="mt-3 w-full max-w-full min-w-0 overflow-hidden">
        {activePanel === "template" && (
          <div className="flex w-full max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {captionTemplateOptions.map((option) => {
              const selected = template === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onTemplateChange(option.value)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                    selected
                      ? dark
                        ? "bg-white text-[#082f63] ring-white"
                        : "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : dark
                        ? "bg-white/10 text-slate-200 ring-white/10 hover:bg-white/15"
                        : "bg-white text-slate-600 ring-blue-100 hover:bg-blue-100"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {activePanel === "style" && (
          <div className="flex w-full max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {captionFontOptions.map((option) => {
              const selected = font === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onFontChange(option.value)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                    selected
                      ? dark
                        ? "bg-white text-[#082f63] ring-white"
                        : "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : dark
                        ? "bg-white/10 text-slate-200 ring-white/10 hover:bg-white/15"
                        : "bg-white text-slate-600 ring-blue-100 hover:bg-blue-100"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {activePanel === "bubble" && (
          <div className="flex w-full max-w-full gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {captionBackgroundOptions.map((option) => {
              const selected = background === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onBackgroundChange(option.value)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-black ring-1 transition ${
                    selected
                      ? dark
                        ? "bg-white text-[#082f63] ring-white"
                        : "bg-[#0b63ce] text-white ring-[#0b63ce]"
                      : dark
                        ? "bg-white/10 text-slate-200 ring-white/10 hover:bg-white/15"
                        : "bg-white text-slate-600 ring-blue-100 hover:bg-blue-100"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {activePanel === "color" && (
          <div className="flex w-full max-w-full items-center gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {captionColorOptions.map((option) => {
              const selected = color === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onColorChange(option.value)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 transition ${
                    selected
                      ? dark
                        ? "ring-white"
                        : "ring-[#0b63ce]"
                      : "ring-transparent"
                  }`}
                  aria-label={option.label}
                  title={option.label}
                >
                  <span
                    className={`h-6 w-6 rounded-full ring-1 ring-black/10 ${option.swatchClass}`}
                  />
                </button>
              );
            })}

            <label
              className={`flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full px-2.5 text-xs font-black ring-1 transition ${
                selectedColorOption
                  ? dark
                    ? "bg-white/10 text-slate-200 ring-white/10 hover:bg-white/15"
                    : "bg-white text-slate-600 ring-blue-100 hover:bg-blue-100"
                  : dark
                    ? "bg-white text-[#082f63] ring-white"
                    : "bg-[#0b63ce] text-white ring-[#0b63ce]"
              }`}
            >
              Custom
              <input
                type="color"
                value={colorPickerValue}
                onChange={(event) =>
                  onColorChange(event.target.value as CaptionColor)
                }
                className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                aria-label="Choose custom text color"
              />
            </label>
          </div>
        )}

        {activePanel === "align" && (
          <div
            className={`grid w-full max-w-full grid-cols-3 gap-1 rounded-full p-1 ${
              dark ? "bg-black/20" : "bg-white/70"
            }`}
          >
            {captionAlignOptions.map((option) => (
              <ToolbarChip
                key={option.value}
                active={align === option.value}
                dark={dark}
                label={option.label}
                onClick={() => onAlignChange(option.value)}
              />
            ))}
          </div>
        )}

        {activePanel === "size" && (
          <div
            className={`grid w-full max-w-full grid-cols-4 gap-1 rounded-full p-1 ${
              dark ? "bg-black/20" : "bg-white/70"
            }`}
          >
            {captionSizeOptions.map((option) => (
              <ToolbarChip
                key={option.value}
                active={size === option.value}
                dark={dark}
                label={option.label}
                onClick={() => onSizeChange(option.value)}
              />
            ))}
          </div>
        )}

        {activePanel === "position" && (
          <div
            className={`grid w-full max-w-full grid-cols-3 gap-1 rounded-full p-1 ${
              dark ? "bg-black/20" : "bg-white/70"
            }`}
          >
            {captionPositionOptions.map((option) => (
              <ToolbarChip
                key={option.value}
                active={position === option.value}
                dark={dark}
                label={option.label}
                onClick={() => onPositionChange(option.value)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VideoTemplatePicker({
  onChange,
  value,
}: {
  onChange: (value: VideoTemplate) => void;
  value: VideoTemplate;
}) {
  return (
    <div className="grid max-h-72 w-full max-w-full gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
      {videoTemplateOptions.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-w-0 rounded-[1.25rem] p-3 text-left ring-1 transition ${
              selected
                ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                : "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-blue-50 hover:text-[#0b63ce]"
            }`}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-black">
                {option.label}
              </span>
              <span
                className={`h-4 w-4 shrink-0 rounded-full ${getVideoTemplateSwatchClass(
                  option.value
                )}`}
              />
            </div>
            <p
              className={`mt-1 overflow-hidden text-[11px] font-semibold leading-5 ${
                selected ? "text-blue-50" : "text-slate-500"
              }`}
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {option.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function MusicComingSoonPanel({ dark }: { dark: boolean }) {
  const approvedTracks = musicCatalog.filter(
    (track) => track.license_status === "approved"
  );

  return (
    <div
      className={`w-full max-w-full overflow-hidden rounded-[1.25rem] p-3 ring-1 ${
        dark
          ? "bg-white/10 text-white ring-white/10"
          : "bg-blue-50 text-slate-900 ring-blue-100"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            dark ? "bg-white/10 text-blue-100" : "bg-white text-[#0b63ce]"
          }`}
        >
          <Music2 className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div
            className={`text-[11px] font-black uppercase tracking-[0.16em] ${
              dark ? "text-blue-100" : "text-[#0b63ce]"
            }`}
          >
            Music · Coming soon
          </div>

          <p
            className={`mt-1 text-sm font-semibold leading-6 ${
              dark ? "text-slate-200" : "text-slate-600"
            }`}
          >
            HTBF music is coming soon. We&apos;re preparing a licensed music
            catalog for artists and ministry partners who want their songs used
            in testimonies and praise posts.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {approvedTracks.length === 0 ? (
          <div
            className={`rounded-2xl px-3 py-3 text-sm font-black ${
              dark
                ? "bg-black/20 text-slate-300"
                : "bg-white text-slate-500 ring-1 ring-blue-100"
            }`}
          >
            No approved tracks yet.
          </div>
        ) : (
          approvedTracks.map((track) => (
            <div
              key={track.id}
              className={`flex min-w-0 flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between ${
                dark
                  ? "bg-black/20 ring-1 ring-white/10"
                  : "bg-white ring-1 ring-blue-100"
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-black">{track.title}</div>
                <div
                  className={`truncate text-xs font-semibold ${
                    dark ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {track.artist}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={!track.preview_url}
                  className={`rounded-full px-3 py-2 text-xs font-black ${
                    dark
                      ? "bg-white/10 text-white disabled:text-white/40"
                      : "bg-slate-100 text-slate-700 disabled:text-slate-400"
                  }`}
                >
                  Preview
                </button>

                <button
                  type="button"
                  disabled
                  className="rounded-full bg-[#0b63ce]/50 px-3 py-2 text-xs font-black text-white opacity-60"
                >
                  Select
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p
        className={`mt-3 text-xs font-semibold leading-5 ${
          dark ? "text-slate-400" : "text-slate-500"
        }`}
      >
        Random song uploads and external copyrighted music are not supported.
      </p>
    </div>
  );
}

function ToolbarButton({
  active,
  children,
  dark,
  label,
  onClick,
  title,
}: {
  active: boolean;
  children?: ReactNode;
  dark: boolean;
  label?: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center justify-center rounded-full px-3 text-sm font-black transition ${
        active
          ? "bg-[#0b63ce] text-white"
          : dark
            ? "text-slate-200 hover:bg-white/10"
            : "text-slate-600 hover:bg-blue-50"
      }`}
      aria-label={title}
      title={title}
    >
      {children ?? label}
    </button>
  );
}

function ToolbarChip({
  active,
  dark,
  label,
  onClick,
}: {
  active: boolean;
  dark: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-full px-2.5 py-2 text-[11px] font-black transition ${
        active
          ? "bg-[#0b63ce] text-white"
          : dark
            ? "text-slate-200 hover:bg-white/10"
            : "text-slate-600 hover:bg-blue-50"
      }`}
    >
      {label}
    </button>
  );
}

function MobileDraggableCaptionOverlay({
  alignment,
  background,
  color,
  font,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  overlayContext = "editor",
  positionPercent,
  size,
  style,
  text,
}: {
  alignment: CaptionAlign;
  background: CaptionBackground;
  color: CaptionColor;
  font: CaptionFont;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  overlayContext?: OverlayContext;
  positionPercent: CaptionPositionPercent;
  size: CaptionSize;
  style: CaptionStyle;
  text: string;
}) {
  return (
    <StoryOverlayText
      alignment={alignment}
      background={background}
      color={color}
      draggable
      font={font}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      overlayContext={overlayContext}
      overlayX={positionPercent.x}
      overlayY={positionPercent.y}
      size={size}
      style={style}
      text={text}
    />
  );
}

function getVideoTemplateSwatchClass(template: VideoTemplate) {
  if (template === "none") return "bg-slate-200";
  if (template === "htbf-logo") return "bg-gradient-to-br from-white to-[#0b63ce]";
  if (template === "freedom-silhouette") return "bg-gradient-to-br from-slate-900 to-white";
  if (template === "shared-through-htbf") return "bg-gradient-to-br from-black to-[#0b63ce]";
  if (template === "freedom-story") return "bg-gradient-to-br from-white to-amber-200";
  if (template === "prayer-moment") return "bg-gradient-to-br from-[#020617] to-[#0b63ce]";
  if (template === "praise-report") return "bg-gradient-to-br from-amber-200 to-amber-700";
  if (template === "god-did-it") return "bg-gradient-to-br from-emerald-200 to-[#0b63ce]";
  return "bg-gradient-to-br from-slate-100 to-slate-950";
}

function getLegacyCaptionStyle(
  font: CaptionFont,
  background: CaptionBackground
): CaptionStyle {
  if (background === "dark-banner") return "bottom-banner";
  if (background === "glow-box") return "soft-gradient";
  if (background === "scripture-card") return "scripture-card";
  if (font === "bold") return "bold-center";
  if (font === "testimony") return "testimony-quote";
  if (font === "minimal") return "minimal-white";
  if (font === "grace-script") return "elegant-script";

  return "classic-caption";
}

function getCaptionColorPickerValue(color: CaptionColor): `#${string}` {
  if (color.startsWith("#")) return color as `#${string}`;

  return (
    captionColorOptions.find((option) => option.value === color)?.hex ??
    "#ffffff"
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function titleCaseStoryShapeValue(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function SegmentedOptionGroup<T extends string>({
  options,
  value,
  onChange,
  dark = false,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  dark?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 rounded-2xl p-2 sm:grid-cols-4 ${
        dark ? "bg-white/10 ring-1 ring-white/10" : "bg-slate-50"
      }`}
    >
      {options.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-2 text-xs font-black transition ${
              selected
                ? "bg-[#0b63ce] text-white shadow-sm"
                : dark
                  ? "bg-white/10 text-slate-200 hover:bg-white/15"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function getPhotoFeedPreviewFrameClass(style: PhotoDisplayStyle) {
  if (style === "framed") {
    return "mx-5 max-w-full overflow-hidden rounded-[1.5rem] bg-[#082f63] p-2 ring-1 ring-blue-100";
  }

  if (style === "original") {
    return "max-w-full overflow-hidden bg-slate-100 px-4 py-4";
  }

  if (style === "full-width") {
    return "max-w-full overflow-hidden bg-slate-100";
  }

  return "mx-5 max-w-full overflow-hidden rounded-[1.5rem] bg-slate-100 ring-1 ring-slate-200";
}

function getPhotoPreviewImageClass(style: PhotoDisplayStyle) {
  if (style === "original") {
    return "mx-auto block max-h-[560px] w-auto max-w-full object-contain";
  }

  if (style === "full-width") {
    return "block max-h-[560px] w-full max-w-full object-cover";
  }

  if (style === "framed") {
    return "block max-h-[560px] w-full max-w-full rounded-[1.5rem] object-cover";
  }

  return "block max-h-[560px] w-full max-w-full rounded-[2rem] object-cover";
}
