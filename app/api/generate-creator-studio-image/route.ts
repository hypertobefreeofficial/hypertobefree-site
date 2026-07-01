import { createClient } from "@supabase/supabase-js";
import { type CreatorStudioImageAction } from "../../../lib/creationCenter";

const STORY_IMAGE_BUCKET = "story-images";
const allowedActions: CreatorStudioImageAction[] = [
  "AI Background",
  "New Background",
  "Generate Visual Design",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
}

function readAction(value: unknown): CreatorStudioImageAction | null {
  if (typeof value !== "string") return null;

  return allowedActions.includes(value as CreatorStudioImageAction)
    ? (value as CreatorStudioImageAction)
    : null;
}

function buildImagePrompt({
  action,
  prompt,
  design,
}: {
  action: CreatorStudioImageAction;
  prompt: string;
  design: Record<string, unknown>;
}) {
  const title = readString(design.title);
  const category = readString(design.category);
  const topic = readString(design.topic);
  const mood = readString(design.styleMood);
  const layoutType = readString(design.layoutType);
  const visualTheme = readString(design.visualTheme);
  const backgroundTreatment = readString(design.backgroundTreatment);
  const colorPalette = readStringArray(design.colorPalette);

  return [
    "Create a premium vertical HTBF faith-centered background/design asset for a mobile post.",
    "Do not include readable text, letters, captions, Bible verse text, logos, watermarks, UI, buttons, or app chrome.",
    "Leave natural open space for the app to overlay title/caption text later.",
    "Use a modern, sophisticated, faith-centered visual language with deep HTBF navy, luminous blue, soft white, and tasteful gold accents when appropriate.",
    "Avoid cheesy religious clip art. Favor cinematic light, peaceful nature, abstract sacred atmosphere, elegant texture, and polished editorial composition.",
    `Requested visual action: ${action}`,
    `User story prompt: ${prompt || "A beautiful HTBF faith-centered testimony design."}`,
    title ? `Working title: ${title}` : "",
    category ? `Category: ${category}` : "",
    topic ? `Topic: ${topic}` : "",
    mood ? `Mood: ${mood}` : "",
    layoutType ? `Layout direction: ${layoutType}` : "",
    visualTheme ? `Visual theme: ${visualTheme}` : "",
    backgroundTreatment
      ? `Background treatment: ${backgroundTreatment}`
      : "",
    colorPalette.length > 0
      ? `Preferred palette: ${colorPalette.join(", ")}`
      : "",
    "Portrait composition, 9:16, polished background asset only.",
  ]
    .filter(Boolean)
    .join("\n");
}

function getOpenAiImageBase64(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return "";

  const firstImage = payload.data[0];
  if (!isRecord(firstImage)) return "";

  return readString(firstImage.b64_json);
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: "Creator Studio storage is unavailable." },
      { status: 503 }
    );
  }

  if (!openAiApiKey) {
    return Response.json(
      { error: "Creator Studio image generation is not configured." },
      { status: 503 }
    );
  }

  const accessToken = readBearerToken(request);

  if (!accessToken) {
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

  const action = readAction(body.action);
  const prompt = readString(body.prompt);
  const design = isRecord(body.design) ? body.design : {};

  if (!action) {
    return Response.json(
      { error: "Choose AI Background, New Background, or Generate Visual Design." },
      { status: 400 }
    );
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const imagePrompt = buildImagePrompt({ action, prompt, design });
  const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
      prompt: imagePrompt,
      size: "1024x1536",
      quality: "low",
      output_format: "png",
    }),
    cache: "no-store",
  });

  if (!imageResponse.ok) {
    const errorBody = await imageResponse.text();
    console.error("Creator Studio image generation failed:", errorBody);

    return Response.json(
      { error: "Could not generate a visual design right now." },
      { status: 502 }
    );
  }

  const imagePayload: unknown = await imageResponse.json();
  const imageBase64 = getOpenAiImageBase64(imagePayload);

  if (!imageBase64) {
    return Response.json(
      { error: "OpenAI did not return an image." },
      { status: 502 }
    );
  }

  const imageBytes = Buffer.from(imageBase64, "base64");
  const storageClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const imagePath = `${user.id}/creator-studio/${Date.now()}-${crypto.randomUUID()}.png`;
  const { error: uploadError } = await storageClient.storage
    .from(STORY_IMAGE_BUCKET)
    .upload(imagePath, imageBytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: "image/png",
    });

  if (uploadError) {
    console.error("Creator Studio generated image upload failed:", uploadError);

    return Response.json(
      { error: "Could not save the generated visual design." },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = storageClient.storage
    .from(STORY_IMAGE_BUCKET)
    .getPublicUrl(imagePath);

  return Response.json({
    imageUrl: publicUrlData.publicUrl,
    imagePath,
    bucket: STORY_IMAGE_BUCKET,
    prompt: imagePrompt,
  });
}
