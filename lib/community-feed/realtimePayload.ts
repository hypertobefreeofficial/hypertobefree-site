import type { RealtimeChangeEventType } from "./realtimeFeedSync";
import {
  isExplicitDemoFlag,
  shouldIgnoreGenuinePublicRealtimeIngress,
  shouldIgnoreGenuinePublicRealtimeRecord,
} from "../demo-content/eligibility";

export function parseStoryRealtimePayload(payload: {
  eventType?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}) {
  const eventType = (payload.eventType || "UPDATE") as RealtimeChangeEventType;
  const record = (payload.new ?? null) as Record<string, unknown> | null;
  const oldRecord = (payload.old ?? null) as Record<string, unknown> | null;
  return {
    eventType,
    record,
    oldRecord,
    isDemo: isExplicitDemoFlag(record?.is_demo ?? oldRecord?.is_demo),
  };
}

export function parseResponseRealtimePayload(payload: {
  eventType?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}) {
  const eventType = (payload.eventType || "UPDATE") as RealtimeChangeEventType;
  const record = (payload.new ?? null) as Record<string, unknown> | null;
  const oldRecord = (payload.old ?? null) as Record<string, unknown> | null;
  return {
    eventType,
    record,
    oldRecord,
    isDemo: isExplicitDemoFlag(record?.is_demo ?? oldRecord?.is_demo),
  };
}

export function parseReactionRealtimePayload(payload: {
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}) {
  const record = (payload.new ?? payload.old ?? null) as Record<string, unknown> | null;
  const storyId = typeof record?.story_id === "string" ? record.story_id : null;
  return {
    storyId,
    isDemo: isExplicitDemoFlag(record?.is_demo),
    record,
  };
}

export function shouldIgnoreGenuinePublicRealtimePayload(
  record: Record<string, unknown> | null | undefined,
  demoIsolationActive: boolean,
  options?: { eventType?: string | null }
) {
  return shouldIgnoreGenuinePublicRealtimeIngress(
    record,
    { genuinePublicIsolationActive: demoIsolationActive },
    options
  );
}

export function shouldIgnoreGenuinePublicRealtimeSyncRecord(
  record: Record<string, unknown> | null | undefined,
  demoIsolationActive: boolean
) {
  return shouldIgnoreGenuinePublicRealtimeRecord(record, {
    genuinePublicIsolationActive: demoIsolationActive,
  });
}
