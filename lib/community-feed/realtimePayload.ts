import type { RealtimeChangeEventType } from "./realtimeFeedSync";

export function parseStoryRealtimePayload(payload: {
  eventType?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}) {
  const eventType = (payload.eventType || "UPDATE") as RealtimeChangeEventType;
  return {
    eventType,
    record: (payload.new ?? null) as Record<string, unknown> | null,
    oldRecord: (payload.old ?? null) as Record<string, unknown> | null,
  };
}

export function parseResponseRealtimePayload(payload: {
  eventType?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}) {
  const eventType = (payload.eventType || "UPDATE") as RealtimeChangeEventType;
  return {
    eventType,
    record: (payload.new ?? null) as Record<string, unknown> | null,
    oldRecord: (payload.old ?? null) as Record<string, unknown> | null,
  };
}

export function parseReactionRealtimePayload(payload: {
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}) {
  const record = (payload.new ?? payload.old ?? null) as Record<string, unknown> | null;
  const storyId = typeof record?.story_id === "string" ? record.story_id : null;
  return storyId;
}
