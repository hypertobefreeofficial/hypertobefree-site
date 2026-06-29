import { createClient } from "@supabase/supabase-js";
import {
  FAITH_STREAM_VALUES,
  creationCenterStoryTemplates,
  sanitizeFaithStreams,
  type CreationCenterTemplateId,
  type CreatorStudioDesign,
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

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
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

function fallbackCreatorStudioDesigns(
  body: Record<string, unknown>
): CreatorStudioResponse {
  const prompt = readString(body.prompt).trim();
  const cleanPrompt = prompt || "God is moving in my story.";
  const requestedChips = readStringArray(body.inspirationChips).slice(0, 3);
  const sourceMode = readCreatorStudioSourceMode(body.sourceMode);
  const requestedTemplateId = readCreatorStudioTemplateId(
    body.selectedTemplateId,
    "scripture-woods"
  );
  const topic = requestedChips[0] || "Testimony";
  const baseTemplates = creatorStudioTemplateIds.slice(0, 6);
  const templates =
    sourceMode === "upload-video" || sourceMode === "upload-photo"
      ? (["none", ...baseTemplates] as CreationCenterTemplateId[])
      : sourceMode === "start-template"
        ? ([requestedTemplateId, ...baseTemplates] as CreationCenterTemplateId[])
        : baseTemplates.length > 0
          ? baseTemplates
          : (["scripture-woods"] as CreationCenterTemplateId[]);
  const layoutTypes = Array.from(creatorStudioLayoutTypes);

  return {
    designs: templates.slice(0, 6).map((templateId, index) => ({
      id: `creator-design-${index + 1}`,
      sourceMode,
      title:
        index === 0
          ? "God Is Moving"
          : index === 1
            ? "A Story of Hope"
            : index === 2
              ? "What God Has Done"
              : index === 3
                ? "Faith for Today"
                : index === 4
                  ? "Freedom in Progress"
                  : "A Moment of Grace",
      overlayText:
        cleanPrompt.length > 150
          ? `${cleanPrompt.slice(0, 150).trim()}...`
          : cleanPrompt,
      caption: cleanPrompt,
      category: topic,
      topic,
      templateId,
      styleMood:
        index % 3 === 0
          ? "Hopeful and polished"
          : index % 3 === 1
            ? "Warm and reflective"
            : "Bold and faith-filled",
      layoutType: layoutTypes[index % layoutTypes.length],
      scriptureSuggestion: "",
      suggestedPostFormat:
        sourceMode === "upload-video"
          ? "Video post with overlay text"
          : sourceMode === "upload-photo"
            ? "Photo post with caption"
            : "Template design post",
    })),
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
      const layoutType = readCreatorStudioLayoutType(
        item.layoutType ?? item.layout_type ?? fallbackDesign.layoutType
      );
      const templateId = readCreatorStudioTemplateId(
        item.templateId ?? item.template ?? item.background,
        fallbackDesign.templateId
      );

      return {
        id:
          readString(item.id).trim() ||
          `creator-design-${index + 1}`,
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
      };
    })
    .filter((design): design is CreatorStudioDesign => Boolean(design))
    .slice(0, 6);

  return { designs: designs.length > 0 ? designs : fallback.designs };
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = readBearerToken(request);

  if (!supabaseUrl || !supabaseAnonKey || !accessToken) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser(accessToken);

  if (!user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
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
    const fallback = fallbackCreatorStudioDesigns(body);

    if (!apiKey) {
      return Response.json(fallback);
    }

    const prompt = readString(body.prompt);
    const inspirationChips = readStringArray(body.inspirationChips);
    const sourceMode = readCreatorStudioSourceMode(body.sourceMode);
    const selectedTemplateId = readString(body.selectedTemplateId);

    const input = [
      "You create polished HTBF Creator Studio design options. Return JSON only.",
      "The user can upload a video, upload a photo, build with AI, or start from an HTBF template.",
      "Create 4 to 6 completed design options using only the allowed template ids and layout types.",
      "Do not quote full Bible verse text. References are okay only if naturally helpful.",
      "Each design must include sourceMode, title, overlayText, caption, category, topic, templateId, styleMood, layoutType, scriptureSuggestion, and suggestedPostFormat.",
      "For upload-video and upload-photo, templateId may be none because the user media is the primary visual.",
      `Source mode: ${sourceMode}`,
      `Selected template id, if any: ${selectedTemplateId || "none"}`,
      `Allowed template ids: ${creatorStudioTemplateIdOptions.join(", ")}`,
      `Allowed layout types: ${creatorStudioLayoutTypes.join(", ")}`,
      `Inspiration chips: ${inspirationChips.join(", ") || "None"}`,
      `User prompt: ${prompt}`,
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
                    minItems: 4,
                    maxItems: 6,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: [
                        "id",
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
                      ],
                      properties: {
                        id: { type: "string" },
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

      return Response.json(
        cleanCreatorStudioResponse(JSON.parse(content), fallback)
      );
    } catch (error) {
      console.error("Creator Studio shaping failed:", error);
      return Response.json(fallback);
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
