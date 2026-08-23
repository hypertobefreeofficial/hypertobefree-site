import { logAiSafetyEvent } from "./aiSafetyLog";

export const AI_IMAGE_GENERATION_ENABLED_ENV = "AI_IMAGE_GENERATION_ENABLED";

export function isAiImageGenerationEnabled(): boolean {
  const raw = process.env[AI_IMAGE_GENERATION_ENABLED_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function aiImageGenerationDisabledResponse(endpoint: string) {
  logAiSafetyEvent({
    eventType: "image_generation_disabled",
    endpoint,
    reachedProvider: false,
  });

  return Response.json(
    {
      ok: false,
      error: "AI image generation is not available right now.",
      code: "image_generation_disabled",
    },
    { status: 503 }
  );
}

export function checkAiImageGenerationGate(endpoint: string):
  | { blocked: false }
  | { blocked: true; response: Response } {
  if (isAiImageGenerationEnabled()) {
    return { blocked: false };
  }

  return {
    blocked: true,
    response: aiImageGenerationDisabledResponse(endpoint),
  };
}
