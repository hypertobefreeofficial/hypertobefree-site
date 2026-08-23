export type AiSafetyEventType =
  | "rate_limit_rejected"
  | "input_rejected"
  | "kill_switch_rejected"
  | "image_generation_disabled"
  | "provider_timeout"
  | "provider_failure"
  | "request_success";

export type AiSafetyLogPayload = {
  eventType: AiSafetyEventType;
  endpoint: string;
  userIdHash?: string;
  limitWindowMs?: number;
  status?: number;
  provider?: string;
  model?: string;
  durationMs?: number;
  reachedProvider?: boolean;
  field?: string;
};

export function hashUserIdForLog(userId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `u_${(hash >>> 0).toString(36)}`;
}

export function logAiSafetyEvent(payload: AiSafetyLogPayload) {
  try {
    console.info("[ai-safety]", {
      eventType: payload.eventType,
      endpoint: payload.endpoint,
      ...(payload.userIdHash ? { userIdHash: payload.userIdHash } : {}),
      ...(payload.limitWindowMs !== undefined
        ? { limitWindowMs: payload.limitWindowMs }
        : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.provider ? { provider: payload.provider } : {}),
      ...(payload.model ? { model: payload.model } : {}),
      ...(payload.durationMs !== undefined ? { durationMs: payload.durationMs } : {}),
      ...(payload.reachedProvider !== undefined
        ? { reachedProvider: payload.reachedProvider }
        : {}),
      ...(payload.field ? { field: payload.field } : {}),
    });
  } catch {
    // Logging must never break AI route handling.
  }
}
