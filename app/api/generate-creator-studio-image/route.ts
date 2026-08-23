import { createClient } from "@supabase/supabase-js";
import { checkAiKillSwitch } from "../../../lib/server/aiKillSwitch";
import { hashUserIdForLog, logAiSafetyEvent } from "../../../lib/server/aiSafetyLog";
import {
  CREATOR_STUDIO_IMAGE_OPENAI_TIMEOUT_MS,
  enforceCreatorStudioAiRateLimit,
  inputRejectedResponse,
} from "../../../lib/server/creatorStudioAiLimits";
import {
  validateCreatorStudioImageInput,
} from "../../../lib/server/creatorStudioImageInputValidation";

const STORY_IMAGE_BUCKET = "story-images";

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

function getOpenAiImageBase64(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return "";

  const firstImage = payload.data[0];
  if (!isRecord(firstImage)) return "";

  return readString(firstImage.b64_json);
}

export async function POST(request: Request) {
  const endpoint = "generate_creator_studio_image";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: "Creator Studio storage is unavailable." },
      { status: 503 }
    );
  }

  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
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

  const killSwitch = checkAiKillSwitch(endpoint);
  if (killSwitch.blocked) {
    return killSwitch.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return inputRejectedResponse({
      endpoint,
      userId: user.id,
      error: "Invalid request body.",
      code: "invalid_body",
    });
  }

  const validated = validateCreatorStudioImageInput(body);
  if (validated.ok === false) {
    return inputRejectedResponse({
      endpoint,
      userId: user.id,
      error: validated.error,
      code: validated.code,
      field: validated.field,
    });
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    return Response.json(
      { error: "Creator Studio image generation is not configured." },
      { status: 503 }
    );
  }

  const rateLimitBlocked = enforceCreatorStudioAiRateLimit({
    userId: user.id,
    endpoint,
  });
  if (rateLimitBlocked) {
    return rateLimitBlocked;
  }

  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CREATOR_STUDIO_IMAGE_OPENAI_TIMEOUT_MS
  );

  let imageResponse: Response;
  try {
    imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: validated.imagePrompt,
        size: "1024x1536",
        quality: "low",
        output_format: "png",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout =
      error instanceof Error && error.name === "AbortError";

    logAiSafetyEvent({
      eventType: isTimeout ? "provider_timeout" : "provider_failure",
      endpoint,
      userIdHash: hashUserIdForLog(user.id),
      provider: "openai",
      model,
      durationMs: Date.now() - startedAt,
      reachedProvider: isTimeout,
    });

    return Response.json(
      {
        error: isTimeout
          ? "Image generation timed out. Please try again."
          : "Could not generate a visual design right now.",
      },
      { status: isTimeout ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!imageResponse.ok) {
    logAiSafetyEvent({
      eventType: "provider_failure",
      endpoint,
      userIdHash: hashUserIdForLog(user.id),
      provider: "openai",
      model,
      status: imageResponse.status,
      durationMs: Date.now() - startedAt,
      reachedProvider: true,
    });

    return Response.json(
      { error: "Could not generate a visual design right now." },
      { status: 502 }
    );
  }

  const imagePayload: unknown = await imageResponse.json();
  const imageBase64 = getOpenAiImageBase64(imagePayload);

  if (!imageBase64) {
    logAiSafetyEvent({
      eventType: "provider_failure",
      endpoint,
      userIdHash: hashUserIdForLog(user.id),
      provider: "openai",
      model,
      status: 502,
      durationMs: Date.now() - startedAt,
      reachedProvider: true,
    });

    return Response.json(
      { error: "Could not generate a visual design right now." },
      { status: 502 }
    );
  }

  logAiSafetyEvent({
    eventType: "request_success",
    endpoint,
    userIdHash: hashUserIdForLog(user.id),
    provider: "openai",
    model,
    durationMs: Date.now() - startedAt,
    reachedProvider: true,
  });

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
    prompt: validated.imagePrompt,
  });
}
