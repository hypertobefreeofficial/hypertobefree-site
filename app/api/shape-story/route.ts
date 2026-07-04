import { createClient } from "@supabase/supabase-js";
import {
  FAITH_STREAM_VALUES,
  creationCenterStoryTemplates,
  sanitizeFaithStreams,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
  type CreatorStudioPath,
  type FaithStream,
} from "../../../lib/creationCenter";

type StoryShapeResponse = {
  storyType: string;
  topics: string[];
  faithStreams: FaithStream[];
  titles: string[];
  caption: string;
  scriptureReferences: string[];
  template: string;
  layoutSuggestion: string;
};

type CreatorStudioResponse = {
  designs: CreatorStudioDesign[];
};

const creatorStudioTemplateIds = creationCenterStoryTemplates
  .filter((template) => template.id !== "none" && template.imagePath)
  .map((template) => template.id);
const creatorStudioTemplateIdOptions = ["none", ...creatorStudioTemplateIds];
const creatorStudioSourceModes = [
  "upload-video",
  "upload-photo",
  "build-ai",
  "start-template",
] as const;
const creatorStudioPathTypes = [
  "tell-story",
  "create-design",
  "scripture-post",
  "ai-surprise",
] as const;
const creatorStudioLayoutTypes = [
  "full-image-poster",
  "text-over-image-testimony",
  "split-layout",
  "quote-card",
  "prayer-request-card",
  "praise-report-card",
  "scripture-card",
  "photo-collage",
  "video-photo-mixed",
  "before-after-testimony",
  "timeline-story",
  "magazine-style",
  "journal-style",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readLimitedStringArray(value: unknown, limit: number) {
  return readStringArray(value)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function readFirstString(
  value: unknown,
  fallback: string
) {
  const cleanValue = readString(value).trim();

  return cleanValue || fallback;
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function readConfiguredEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function resolveShapeStoryAuthFailure(accessToken: string) {
  const supabaseUrl = readConfiguredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = readConfiguredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl) {
    console.error("[shape-story] Missing NEXT_PUBLIC_SUPABASE_URL");
    return Response.json(
      {
        error:
          "Server misconfiguration: NEXT_PUBLIC_SUPABASE_URL is not set.",
      },
      { status: 503 }
    );
  }

  if (!supabaseAnonKey) {
    console.error("[shape-story] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return Response.json(
      {
        error:
          "Server misconfiguration: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.",
      },
      { status: 503 }
    );
  }

  if (!accessToken) {
    console.error("[shape-story] Missing Authorization Bearer token");
    return Response.json(
      {
        error: "Unauthorized: missing session token. Please sign in again.",
      },
      { status: 401 }
    );
  }

  return null;
}

function fallbackShape(body: Record<string, unknown>): StoryShapeResponse {
  const storyType =
    readString(body.storyType) || readString(body.story_type) || "testimony";
  const topics = readStringArray(body.topics).slice(0, 4);
  const faithStreams = sanitizeFaithStreams(body.faithStreams);
  const currentText =
    readString(body.draftText) || readString(body.currentText);
  const titleBase =
    storyType === "prayer"
      ? "Praying for Breakthrough"
      : storyType === "worship"
        ? "A Worship Moment"
        : storyType === "teaching"
          ? "A Word to Remember"
          : "God Is Moving";

  return {
    storyType,
    topics,
    faithStreams,
    titles: [titleBase, "What God Placed on My Heart"],
    caption: currentText,
    scriptureReferences: [],
    template: `${storyType}_story`,
    layoutSuggestion: "",
  };
}

function normalizeTopicValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function readCreatorStudioTemplateId(
  value: unknown,
  fallback: CreationCenterTemplateId
): CreationCenterTemplateId {
  if (typeof value !== "string") return fallback;

  const normalized = normalizeTopicValue(value);
  const match = creationCenterStoryTemplates.find(
    (template) =>
      template.id === normalized ||
      normalizeTopicValue(template.label) === normalized ||
      normalized.includes(template.id)
  );

  if (!match || match.id === "none" || !match.imagePath) return fallback;

  return match.id;
}

function readCreatorStudioSourceMode(
  value: unknown
): CreatorStudioDesign["sourceMode"] {
  return typeof value === "string" &&
    creatorStudioSourceModes.includes(
      value as (typeof creatorStudioSourceModes)[number]
    )
    ? (value as CreatorStudioDesign["sourceMode"])
    : "build-ai";
}

function readCreatorStudioPath(value: unknown): CreatorStudioPath {
  return typeof value === "string" &&
    creatorStudioPathTypes.includes(
      value as (typeof creatorStudioPathTypes)[number]
    )
    ? (value as CreatorStudioPath)
    : "tell-story";
}

function readCreatorStudioLayoutType(
  value: unknown
): CreatorStudioDesign["layoutType"] {
  return typeof value === "string" &&
    creatorStudioLayoutTypes.includes(
      value as (typeof creatorStudioLayoutTypes)[number]
    )
    ? (value as CreatorStudioDesign["layoutType"])
    : "text-over-image-testimony";
}

function readCreatorStudioTextStyle(
  value: unknown,
  fallback?: CreatorStudioDesign["textStyle"]
): CreatorStudioDesign["textStyle"] {
  const textStyle = isRecord(value) ? value : {};
  const fontSize = readString(textStyle.fontSize);
  const weight = readString(textStyle.weight);
  const align = readString(textStyle.align);
  const position = readString(textStyle.position);
  const color = readString(textStyle.color).trim();

  return {
    fontSize:
      fontSize === "small" ||
      fontSize === "medium" ||
      fontSize === "large" ||
      fontSize === "hero"
        ? fontSize
        : fallback?.fontSize ?? "large",
    weight:
      weight === "regular" || weight === "bold"
        ? weight
        : fallback?.weight ?? "bold",
    italic:
      typeof textStyle.italic === "boolean"
        ? textStyle.italic
        : fallback?.italic ?? false,
    align:
      align === "left" || align === "center" || align === "right"
        ? align
        : fallback?.align ?? "left",
    color: isHexColor(color) ? color : fallback?.color || "#FFFFFF",
    position:
      position === "top" || position === "center" || position === "bottom"
        ? position
        : fallback?.position ?? "bottom",
  };
}

function fallbackCreatorStudioDesigns(
  body: Record<string, unknown>
): CreatorStudioResponse {
  const prompt = readString(body.prompt).trim();
  const cleanPrompt = prompt || "God is moving in my story.";
  const requestedChips = readStringArray(body.inspirationChips)
    .map((chip) => chip.trim())
    .filter(Boolean)
    .slice(0, 4);
  const sourceMode = readCreatorStudioSourceMode(body.sourceMode);
  const studioPath = readCreatorStudioPath(body.studioPath);
  const requestedTemplateId = readCreatorStudioTemplateId(
    body.selectedTemplateId,
    "scripture-woods"
  );
  const category = readFirstString(body.category, requestedChips[0] || "Testimony");
  const topic = readFirstString(body.topic, requestedChips[1] || category);
  const mood = readFirstString(body.mood, "Hopeful and polished");
  const requestedLayoutType = readCreatorStudioLayoutType(body.layoutType);
  const baseTemplates = creatorStudioTemplateIds.slice(0, 6);
  const templates =
    sourceMode === "upload-video" || sourceMode === "upload-photo"
      ? (["none", ...baseTemplates] as CreationCenterTemplateId[])
      : sourceMode === "start-template"
        ? ([requestedTemplateId, ...baseTemplates] as CreationCenterTemplateId[])
        : baseTemplates.length > 0
          ? baseTemplates
          : (["scripture-woods"] as CreationCenterTemplateId[]);
  const layoutTypes = [
    requestedLayoutType,
    ...Array.from(creatorStudioLayoutTypes).filter(
      (layoutType) => layoutType !== requestedLayoutType
    ),
  ];
  const titleIdeas = [
    `${category}: ${topic}`,
    `God Is Moving in ${topic}`,
    `A ${mood} Story`,
    `What God Is Doing`,
    `${topic} and Hope`,
    `A Moment of Grace`,
  ];
  const moods = [
    mood,
    `Warm ${mood.toLowerCase()}`,
    `Bold ${category.toLowerCase()}`,
    `Quiet ${topic.toLowerCase()}`,
    "Clean HTBF editorial",
    "Faith-filled and hopeful",
  ];
  const palettes = [
    ["#FFFFFF", "#D4AF37", "#0B1D3A"],
    ["#F8FAFC", "#60A5FA", "#062A57"],
    ["#FFF7ED", "#F97316", "#1E293B"],
    ["#ECFDF5", "#22C55E", "#0B1D3A"],
    ["#F8FAFC", "#94A3B8", "#111827"],
    ["#FEF3C7", "#D4AF37", "#0B1D3A"],
  ];
  const textStyles: CreatorStudioDesign["textStyle"][] = [
    { fontSize: "hero", weight: "bold", italic: false, align: "left", color: "#FFFFFF", position: "bottom" },
    { fontSize: "large", weight: "bold", italic: false, align: "center", color: "#FFFFFF", position: "center" },
    { fontSize: "medium", weight: "regular", italic: true, align: "left", color: "#F8FAFC", position: "bottom" },
    { fontSize: "large", weight: "bold", italic: false, align: "right", color: "#FEF3C7", position: "top" },
    { fontSize: "medium", weight: "bold", italic: false, align: "center", color: "#FFFFFF", position: "bottom" },
    { fontSize: "hero", weight: "bold", italic: false, align: "left", color: "#F8FAFC", position: "center" },
  ];
  const typographyStyles = [
    "Cinematic serif headline with clean supporting text",
    "Modern editorial sans with bold title hierarchy",
    "Prayer card typography with gentle spacing",
    "Documentary lower-third style",
    "Minimal devotional typography",
    "Bold testimony poster typography",
  ];
  const designTreatments = [
    "Dark cinematic gradient with gold accent",
    "Bright hopeful glow with clean blue overlays",
    "Soft prayerful card with quiet contrast",
    "Editorial split composition with strong headline",
    "Minimal white-space treatment with subtle texture",
    "Timeline-inspired story treatment with milestone rhythm",
  ];
  const conceptDirections = [
    {
      name: "Elegant magazine",
      layout: "magazine-style" as const,
      typographyPairing: "Elegant serif headline with clean sans body",
      fontHierarchy: "Large editorial headline, compact supporting caption",
      backgroundTreatment: "Subtle dark gradient over the main image",
      overlayStyle: "Editorial headline block with gold accent",
      decorativeElements: "Thin rule lines and small journal label",
      visualTheme: "Faith journal cover",
      filterRecommendation: "Warm cinematic contrast",
      cropRecommendation: "Center the subject with open sky or negative space",
    },
    {
      name: "Modern cinematic",
      layout: "full-image-poster" as const,
      typographyPairing: "Bold modern sans headline with tight spacing",
      fontHierarchy: "Hero title with short lower-third caption",
      backgroundTreatment: "Full-bleed media with deep blue shadow",
      overlayStyle: "Large lower-third text over image",
      decorativeElements: "Soft glow, subtle HTBF gold accent",
      visualTheme: "Cinematic testimony poster",
      filterRecommendation: "Deep contrast with warm highlights",
      cropRecommendation: "Use portrait crop and keep faces above center",
    },
    {
      name: "Minimal",
      layout: "quote-card" as const,
      typographyPairing: "Minimal sans with generous spacing",
      fontHierarchy: "Short centered statement with small reference line",
      backgroundTreatment: "Calm muted background with lots of breathing room",
      overlayStyle: "Centered quote-style text",
      decorativeElements: "Tiny accent dot and quiet border",
      visualTheme: "Peaceful devotional card",
      filterRecommendation: "Soft neutral wash",
      cropRecommendation: "Keep the image simple and uncluttered",
    },
    {
      name: "Bold worship",
      layout: "praise-report-card" as const,
      typographyPairing: "Bold worship headline with expressive accent",
      fontHierarchy: "Strong praise line, short caption, clear CTA",
      backgroundTreatment: "Bright blue/gold overlay with high energy",
      overlayStyle: "Stacked uppercase praise text",
      decorativeElements: "Gold rays, praise badge, soft light burst",
      visualTheme: "Worship celebration",
      filterRecommendation: "Bright hopeful glow",
      cropRecommendation: "Use the most expressive light or movement",
    },
    {
      name: "Story/social style",
      layout: "text-over-image-testimony" as const,
      typographyPairing: "Friendly bold sans with readable body",
      fontHierarchy: "Relatable short title plus conversational caption",
      backgroundTreatment: "Clean social-story gradient overlay",
      overlayStyle: "Rounded text bubble over media",
      decorativeElements: "Small topic chips and soft shadow",
      visualTheme: "Shareable testimony story",
      filterRecommendation: "Natural warm phone-story look",
      cropRecommendation: "Frame the main subject in the safe center area",
    },
    {
      name: "Journal/scrapbook",
      layout: "journal-style" as const,
      typographyPairing: "Handwritten-inspired title with clean body type",
      fontHierarchy: "Personal title, reflective paragraph, scripture reference",
      backgroundTreatment: "Soft paper panel over media",
      overlayStyle: "Journal card with layered caption",
      decorativeElements: "Paper texture, small tape corner, gold underline",
      visualTheme: "Personal faith journal",
      filterRecommendation: "Soft matte devotional tone",
      cropRecommendation: "Let the background support the written reflection",
    },
  ];

  return {
    designs: conceptDirections.map((direction, index) => {
      const templateId = templates[index % templates.length];
      const title = titleIdeas[index % titleIdeas.length];
      const overlayText =
        index % 2 === 0
          ? cleanPrompt.length > 130
            ? `${cleanPrompt.slice(0, 130).trim()}...`
            : cleanPrompt
          : title;

      return {
        id: `creator-design-${index + 1}`,
        studioPath,
        sourceMode,
        title,
        overlayText,
        caption:
          index % 3 === 0
            ? cleanPrompt
            : `${cleanPrompt}\n\n${topic} is part of what God is shaping here.`,
        category,
        topic,
        templateId,
        styleMood: `${direction.name} / ${moods[index % moods.length]}`,
        layoutType: direction.layout,
        scriptureSuggestion:
          index % 2 === 0 ? "" : "Consider adding a short scripture reference.",
        suggestedPostFormat:
          sourceMode === "upload-video"
            ? `${direction.layout} video post`
            : sourceMode === "upload-photo"
              ? `${direction.layout} photo post`
              : `${direction.layout} design post`,
        colorPalette: palettes[index % palettes.length],
        typographyStyle: typographyStyles[index % typographyStyles.length],
        designTreatment: designTreatments[index % designTreatments.length],
        callToAction: "Share what God has done.",
        typographyPairing: direction.typographyPairing,
        fontHierarchy: direction.fontHierarchy,
        backgroundTreatment: direction.backgroundTreatment,
        layoutComposition: direction.layout,
        overlayStyle: direction.overlayStyle,
        decorativeElements: direction.decorativeElements,
        visualTheme: direction.visualTheme,
        filterRecommendation: direction.filterRecommendation,
        cropRecommendation: direction.cropRecommendation,
        alternateTitles: [title, `God Is Moving in ${topic}`],
        alternateCaptions: [
          cleanPrompt,
          `${topic} is part of this testimony of God's faithfulness.`,
        ],
        hashtags: [normalizeTopicValue(category), normalizeTopicValue(topic)],
        conceptReason: `${direction.name} fits because it gives this story a distinct ${direction.visualTheme.toLowerCase()} direction.`,
        textStyle: textStyles[index % textStyles.length],
      };
    }),
  };
}

function cleanShape(value: unknown, fallback: StoryShapeResponse) {
  if (!isRecord(value)) return fallback;

  return {
    storyType: readString(value.storyType) || fallback.storyType,
    topics: readStringArray(value.topics).slice(0, 6),
    faithStreams: sanitizeFaithStreams(
      readStringArray(value.faithStreams).length > 0
        ? value.faithStreams
        : fallback.faithStreams
    ),
    titles: readStringArray(value.titles).slice(0, 4),
    caption: readString(value.caption),
    scriptureReferences: readStringArray(value.scriptureReferences).slice(0, 4),
    template: readString(value.template) || fallback.template,
    layoutSuggestion: readString(value.layoutSuggestion),
  };
}

function cleanCreatorStudioResponse(
  value: unknown,
  fallback: CreatorStudioResponse
): CreatorStudioResponse {
  if (!isRecord(value) || !Array.isArray(value.designs)) return fallback;

  const designs = value.designs
    .map((item, index): CreatorStudioDesign | null => {
      if (!isRecord(item)) return null;

      const fallbackDesign =
        fallback.designs[index % Math.max(fallback.designs.length, 1)];

      if (!fallbackDesign) return null;

      const title = readString(item.title).trim() || fallbackDesign.title;
      const overlayText =
        readString(item.overlayText).trim() ||
        readString(item.overlay_text).trim() ||
        fallbackDesign.overlayText;
      const caption = readString(item.caption).trim() || fallbackDesign.caption;
      const category =
        readString(item.category).trim() || fallbackDesign.category;
      const topic = readString(item.topic).trim() || category;
      const styleMood =
        readString(item.styleMood).trim() ||
        readString(item.style_mood).trim() ||
        fallbackDesign.styleMood;
      const sourceMode = readCreatorStudioSourceMode(
        item.sourceMode ?? item.source_mode ?? fallbackDesign.sourceMode
      );
      const studioPath = readCreatorStudioPath(
        item.studioPath ?? item.studio_path ?? fallbackDesign.studioPath
      );
      const layoutType = readCreatorStudioLayoutType(
        item.layoutType ?? item.layout_type ?? fallbackDesign.layoutType
      );
      const templateId = readCreatorStudioTemplateId(
        item.templateId ?? item.template ?? item.background,
        fallbackDesign.templateId
      );
      const colorPalette = readStringArray(item.colorPalette)
        .map((color) => color.trim())
        .filter(isHexColor)
        .slice(0, 5);
      const callToAction =
        readString(item.callToAction).trim() ||
        readString(item.call_to_action).trim();
      const typographyPairing =
        readString(item.typographyPairing).trim() ||
        readString(item.typography_pairing).trim();
      const fontHierarchy =
        readString(item.fontHierarchy).trim() ||
        readString(item.font_hierarchy).trim();
      const backgroundTreatment =
        readString(item.backgroundTreatment).trim() ||
        readString(item.background_treatment).trim();
      const layoutComposition =
        readString(item.layoutComposition).trim() ||
        readString(item.layout_composition).trim();
      const overlayStyle =
        readString(item.overlayStyle).trim() ||
        readString(item.overlay_style).trim();
      const decorativeElements =
        readString(item.decorativeElements).trim() ||
        readString(item.decorative_elements).trim();
      const visualTheme =
        readString(item.visualTheme).trim() ||
        readString(item.visual_theme).trim();
      const filterRecommendation =
        readString(item.filterRecommendation).trim() ||
        readString(item.filter_recommendation).trim();
      const cropRecommendation =
        readString(item.cropRecommendation).trim() ||
        readString(item.crop_recommendation).trim();

      return {
        id:
          readString(item.id).trim() ||
          `creator-design-${index + 1}`,
        studioPath,
        sourceMode,
        title,
        overlayText,
        caption,
        category,
        topic,
        templateId,
        styleMood,
        layoutType,
        scriptureSuggestion:
          readString(item.scriptureSuggestion).trim() ||
          readString(item.scripture_suggestion).trim() ||
          fallbackDesign.scriptureSuggestion,
        suggestedPostFormat:
          readString(item.suggestedPostFormat).trim() ||
          readString(item.suggested_post_format).trim() ||
          fallbackDesign.suggestedPostFormat,
        colorPalette:
          colorPalette.length > 0
            ? colorPalette
            : fallbackDesign.colorPalette,
        typographyStyle:
          readString(item.typographyStyle).trim() ||
          readString(item.typography_style).trim() ||
          fallbackDesign.typographyStyle,
        designTreatment:
          readString(item.designTreatment).trim() ||
          readString(item.design_treatment).trim() ||
          fallbackDesign.designTreatment,
        callToAction: callToAction || fallbackDesign.callToAction,
        typographyPairing:
          typographyPairing || fallbackDesign.typographyPairing,
        fontHierarchy: fontHierarchy || fallbackDesign.fontHierarchy,
        backgroundTreatment:
          backgroundTreatment || fallbackDesign.backgroundTreatment,
        layoutComposition:
          layoutComposition || fallbackDesign.layoutComposition,
        overlayStyle: overlayStyle || fallbackDesign.overlayStyle,
        decorativeElements:
          decorativeElements || fallbackDesign.decorativeElements,
        visualTheme: visualTheme || fallbackDesign.visualTheme,
        filterRecommendation:
          filterRecommendation || fallbackDesign.filterRecommendation,
        cropRecommendation:
          cropRecommendation || fallbackDesign.cropRecommendation,
        alternateTitles:
          readLimitedStringArray(item.alternateTitles, 4).length > 0
            ? readLimitedStringArray(item.alternateTitles, 4)
            : fallbackDesign.alternateTitles,
        alternateCaptions:
          readLimitedStringArray(item.alternateCaptions, 4).length > 0
            ? readLimitedStringArray(item.alternateCaptions, 4)
            : fallbackDesign.alternateCaptions,
        hashtags:
          readLimitedStringArray(item.hashtags, 8).length > 0
            ? readLimitedStringArray(item.hashtags, 8)
            : fallbackDesign.hashtags,
        conceptReason:
          readString(item.conceptReason).trim() ||
          readString(item.concept_reason).trim() ||
          fallbackDesign.conceptReason,
        textStyle: readCreatorStudioTextStyle(
          item.textStyle ?? item.text_style,
          fallbackDesign.textStyle
        ),
      };
    })
    .filter((design): design is CreatorStudioDesign => Boolean(design))
    .slice(0, 6);

  return { designs: designs.length > 0 ? designs : fallback.designs };
}

export async function POST(request: Request) {
  const accessToken = readBearerToken(request);
  const authFailure = resolveShapeStoryAuthFailure(accessToken);

  if (authFailure) {
    return authFailure;
  }

  const supabaseUrl = readConfiguredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = readConfiguredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser(accessToken);

  if (!user) {
    console.error("[shape-story] Supabase auth.getUser returned no user");
    return Response.json(
      {
        error: "Unauthorized: session expired or invalid. Please sign in again.",
      },
      { status: 401 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const requestMode =
    readString(body.mode) || readString(body.requestMode) || "";

  if (requestMode === "creator_studio") {
    console.log("[shape-story/creator_studio] POST received", {
      hasOpenAiKey: Boolean(apiKey),
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseAnonKey: Boolean(supabaseAnonKey),
      userId: user.id,
    });

    const fallback = fallbackCreatorStudioDesigns(body);

    if (!apiKey) {
      console.warn(
        "[shape-story/creator_studio] OPENAI_API_KEY missing; returning fallback designs"
      );
      return Response.json({
        ...fallback,
        fallbackReason: "Creator Studio is not connected to OpenAI yet.",
      });
    }

    const prompt = readString(body.prompt);
    const inspirationChips = readStringArray(body.inspirationChips);
    const sourceMode = readCreatorStudioSourceMode(body.sourceMode);
    const studioPath = readCreatorStudioPath(body.studioPath);
    const selectedTemplateId = readString(body.selectedTemplateId);
    const requestedCategory = readFirstString(body.category, "Testimony");
    const requestedTopic = readFirstString(body.topic, requestedCategory);
    const requestedMood = readFirstString(body.mood, "Hopeful and bright");
    const requestedLayoutType = readCreatorStudioLayoutType(body.layoutType);

    const input = [
      "You create polished HTBF Creator Studio design options. Return JSON only.",
      "The user can upload a video, upload a photo, build with AI, or start from an HTBF template.",
      "Create exactly 6 completed design concepts using only the allowed template ids and layout types.",
      "The user's selected Creator Studio path, category, topic, mood, layout, chips, and source mode must visibly shape the concepts.",
      "Make the concepts meaningfully different from each other: vary the title, overlay text, caption angle, layout type, mood, recommended background, color palette, typography style, design treatment, overlay style, crop recommendation, decorative elements, and scripture placement.",
      "Do not simply reuse the same background with different words. Treat each concept as a distinct creative direction such as Cinematic, Magazine, Prayer Card, Timeline, Minimal, Documentary, or Editorial.",
      "The six concepts should feel like these distinct directions: Elegant magazine, Modern cinematic, Minimal, Bold worship, Story/social style, and Journal/scrapbook.",
      "Do not repeat the same template for every option unless the user explicitly started from a template.",
      "If sourceMode is upload-video or upload-photo, treat the uploaded media as the main canvas and suggest styling, crop, palette, text, and overlay choices for that media.",
      "Do not quote full Bible verse text. References are okay only if naturally helpful.",
      "Each design must include studioPath, sourceMode, title, overlayText, caption, category, topic, templateId, styleMood, layoutType, scriptureSuggestion, suggestedPostFormat, colorPalette, typographyStyle, designTreatment, callToAction, typographyPairing, fontHierarchy, backgroundTreatment, layoutComposition, overlayStyle, decorativeElements, visualTheme, filterRecommendation, cropRecommendation, alternateTitles, alternateCaptions, hashtags, conceptReason, and textStyle.",
      "textStyle must include fontSize, weight, italic, align, color, and position. Use these to make each concept visually distinct.",
      "Use six-digit hex values for every colorPalette item and textStyle.color.",
      "For upload-video and upload-photo, templateId may be none because the user media is the primary visual.",
      `Creator Studio path: ${studioPath}`,
      `Source mode: ${sourceMode}`,
      `Selected template id, if any: ${selectedTemplateId || "none"}`,
      `Requested category: ${requestedCategory}`,
      `Requested topic: ${requestedTopic}`,
      `Requested mood/style: ${requestedMood}`,
      `Requested layout type: ${requestedLayoutType}`,
      `Allowed template ids: ${creatorStudioTemplateIdOptions.join(", ")}`,
      `Allowed layout types: ${creatorStudioLayoutTypes.join(", ")}`,
      `Inspiration chips: ${inspirationChips.join(", ") || "None"}`,
      `User prompt: ${prompt}`,
    ].join("\n\n");

    try {
      console.log("[shape-story/creator_studio] Calling OpenAI chat/completions");

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_STORY_SHAPING_MODEL ?? "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You return structured JSON for faith-centered design concepts. Keep language warm, clear, and concise.",
            },
            { role: "user", content: input },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "htbf_creator_studio_designs",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["designs"],
                properties: {
                  designs: {
                    type: "array",
                    minItems: 6,
                    maxItems: 6,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: [
                        "id",
                        "studioPath",
                        "sourceMode",
                        "title",
                        "overlayText",
                        "caption",
                        "category",
                        "topic",
                        "templateId",
                        "styleMood",
                        "layoutType",
                        "scriptureSuggestion",
                        "suggestedPostFormat",
                        "colorPalette",
                        "typographyStyle",
                        "designTreatment",
                        "callToAction",
                        "typographyPairing",
                        "fontHierarchy",
                        "backgroundTreatment",
                        "layoutComposition",
                        "overlayStyle",
                        "decorativeElements",
                        "visualTheme",
                        "filterRecommendation",
                        "cropRecommendation",
                        "alternateTitles",
                        "alternateCaptions",
                        "hashtags",
                        "conceptReason",
                        "textStyle",
                      ],
                      properties: {
                        id: { type: "string" },
                        studioPath: {
                          type: "string",
                          enum: creatorStudioPathTypes,
                        },
                        sourceMode: {
                          type: "string",
                          enum: creatorStudioSourceModes,
                        },
                        title: { type: "string" },
                        overlayText: { type: "string" },
                        caption: { type: "string" },
                        category: { type: "string" },
                        topic: { type: "string" },
                        templateId: {
                          type: "string",
                          enum: creatorStudioTemplateIdOptions,
                        },
                        styleMood: { type: "string" },
                        layoutType: {
                          type: "string",
                          enum: creatorStudioLayoutTypes,
                        },
                        scriptureSuggestion: { type: "string" },
                        suggestedPostFormat: { type: "string" },
                        colorPalette: {
                          type: "array",
                          minItems: 3,
                          maxItems: 5,
                          items: { type: "string" },
                        },
                        typographyStyle: { type: "string" },
                        designTreatment: { type: "string" },
                        callToAction: { type: "string" },
                        typographyPairing: { type: "string" },
                        fontHierarchy: { type: "string" },
                        backgroundTreatment: { type: "string" },
                        layoutComposition: { type: "string" },
                        overlayStyle: { type: "string" },
                        decorativeElements: { type: "string" },
                        visualTheme: { type: "string" },
                        filterRecommendation: { type: "string" },
                        cropRecommendation: { type: "string" },
                        alternateTitles: {
                          type: "array",
                          minItems: 2,
                          maxItems: 4,
                          items: { type: "string" },
                        },
                        alternateCaptions: {
                          type: "array",
                          minItems: 2,
                          maxItems: 4,
                          items: { type: "string" },
                        },
                        hashtags: {
                          type: "array",
                          minItems: 2,
                          maxItems: 8,
                          items: { type: "string" },
                        },
                        conceptReason: { type: "string" },
                        textStyle: {
                          type: "object",
                          additionalProperties: false,
                          required: [
                            "fontSize",
                            "weight",
                            "italic",
                            "align",
                            "color",
                            "position",
                          ],
                          properties: {
                            fontSize: {
                              type: "string",
                              enum: ["small", "medium", "large", "hero"],
                            },
                            weight: {
                              type: "string",
                              enum: ["regular", "bold"],
                            },
                            italic: { type: "boolean" },
                            align: {
                              type: "string",
                              enum: ["left", "center", "right"],
                            },
                            color: { type: "string" },
                            position: {
                              type: "string",
                              enum: ["top", "center", "bottom"],
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          temperature: 0.75,
        }),
        cache: "no-store",
      });

      console.log("[shape-story/creator_studio] OpenAI HTTP response", {
        ok: response.ok,
        status: response.status,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        console.error(
          "[shape-story/creator_studio] OpenAI error body:",
          errorBody.slice(0, 500)
        );
        return Response.json({
          ...fallback,
          fallbackReason: "Creator Studio could not reach OpenAI.",
        });
      }

      const payload: unknown = await response.json();
      const content =
        isRecord(payload) &&
        Array.isArray(payload.choices) &&
        isRecord(payload.choices[0]) &&
        isRecord(payload.choices[0].message)
          ? payload.choices[0].message.content
          : null;

      if (typeof content !== "string") {
        console.error(
          "[shape-story/creator_studio] OpenAI returned no string content:",
          payload
        );
        return Response.json({
          ...fallback,
          fallbackReason: "Creator Studio received an empty OpenAI response.",
        });
      }

      let parsedContent: unknown;

      try {
        parsedContent = JSON.parse(content);
      } catch (parseError) {
        console.error(
          "[shape-story/creator_studio] OpenAI content JSON.parse failed:",
          parseError
        );
        console.error(
          "[shape-story/creator_studio] Raw content preview:",
          content.slice(0, 400)
        );
        return Response.json({
          ...fallback,
          fallbackReason: "Creator Studio could not parse OpenAI JSON.",
        });
      }

      const cleaned = cleanCreatorStudioResponse(parsedContent, fallback);
      console.log("[shape-story/creator_studio] Returning designs", {
        count: cleaned.designs.length,
      });

      return Response.json(cleaned);
    } catch (error) {
      console.error("[shape-story/creator_studio] Unexpected failure:", error);
      return Response.json({
        ...fallback,
        fallbackReason: "Creator Studio could not generate with OpenAI.",
      });
    }
  }

  const fallback = fallbackShape(body);

  if (!apiKey) {
    return Response.json(fallback);
  }

  const promptAnswers = isRecord(body.promptAnswers)
    ? Object.entries(body.promptAnswers)
        .filter(([, answer]) => typeof answer === "string" && answer.trim())
        .map(([question, answer]) => `${question}: ${answer}`)
        .join("\n")
    : "";

  const storyType =
    readString(body.storyType) || readString(body.story_type) || "testimony";
  const contentFormat =
    readString(body.format) || readString(body.contentFormat);
  const draftText = readString(body.draftText) || readString(body.currentText);
  const requestedFaithStreams = sanitizeFaithStreams(body.faithStreams);

  const input = [
    "You help shape faith-centered HTBF posts. Return JSON only.",
    "Do not include full Bible verse text. Suggest references only.",
    "Suggestions must preserve the user's meaning and voice.",
    `Content format: ${contentFormat}`,
    `Story type: ${storyType}`,
    `Selected topics: ${readStringArray(body.topics).join(", ")}`,
    `Selected Faith Streams: ${requestedFaithStreams.join(", ")}`,
    `Allowed Faith Streams: ${FAITH_STREAM_VALUES.join(", ")}`,
    `Current text: ${draftText}`,
    `Guided answers:\n${promptAnswers || "None"}`,
    'Return title ideas, related Faith Streams, improved caption wording, scripture references, a visual template suggestion, and a concise story-flow suggestion. JSON shape: {"storyType":"","topics":[],"faithStreams":[],"titles":[],"caption":"","scriptureReferences":[],"template":"","layoutSuggestion":""}',
  ].join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_STORY_SHAPING_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You return concise structured JSON for faith-centered post suggestions. Never quote copyrighted Bible text; references only.",
          },
          { role: "user", content: input },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "htbf_story_shape",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "storyType",
                "topics",
                "faithStreams",
                "titles",
                "caption",
                "scriptureReferences",
                "template",
                "layoutSuggestion",
              ],
              properties: {
                storyType: { type: "string" },
                topics: {
                  type: "array",
                  maxItems: 6,
                  items: { type: "string" },
                },
                faithStreams: {
                  type: "array",
                  maxItems: 5,
                  items: {
                    type: "string",
                    enum: FAITH_STREAM_VALUES,
                  },
                },
                titles: {
                  type: "array",
                  maxItems: 4,
                  items: { type: "string" },
                },
                caption: { type: "string" },
                scriptureReferences: {
                  type: "array",
                  maxItems: 4,
                  items: { type: "string" },
                },
                template: { type: "string" },
                layoutSuggestion: { type: "string" },
              },
            },
          },
        },
        temperature: 0.5,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json(fallback);
    }

    const payload: unknown = await response.json();
    const content =
      isRecord(payload) &&
      Array.isArray(payload.choices) &&
      isRecord(payload.choices[0]) &&
      isRecord(payload.choices[0].message)
        ? payload.choices[0].message.content
        : null;

    if (typeof content !== "string") {
      return Response.json(fallback);
    }

    return Response.json(cleanShape(JSON.parse(content), fallback));
  } catch (error) {
    console.error("Story shaping failed:", error);
    return Response.json(fallback);
  }
}
