import { logAiSafetyEvent } from "./aiSafetyLog";

export const AI_FEATURES_DISABLED_ENV = "AI_FEATURES_DISABLED";

export function isAiFeaturesDisabled(): boolean {
  const raw = process.env[AI_FEATURES_DISABLED_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function aiFeaturesDisabledResponse(endpoint: string) {
  logAiSafetyEvent({
    eventType: "kill_switch_rejected",
    endpoint,
    reachedProvider: false,
  });

  return Response.json(
    {
      ok: false,
      error: "AI features are temporarily unavailable. Please try again later.",
      code: "ai_disabled",
    },
    { status: 503 }
  );
}

export function checkAiKillSwitch(endpoint: string):
  | { blocked: false }
  | { blocked: true; response: Response } {
  if (!isAiFeaturesDisabled()) {
    return { blocked: false };
  }

  return {
    blocked: true,
    response: aiFeaturesDisabledResponse(endpoint),
  };
}
