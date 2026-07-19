import type { DemoContentFieldSnapshot, DemoLoaderMode } from "./types";
import {
  getDemoContentSchemaReadiness,
  resetDemoContentSchemaReadinessCache,
  getDemoContentTableProbeCacheForTests,
  type DemoContentSchemaTable,
} from "./schemaReadiness";

export {
  DemoContentSchemaProbeError,
  DemoContentSchemaDriftError,
  getDemoContentSchemaReadiness,
  assertDemoSchemaReadyForSeeding,
  resetDemoContentSchemaReadinessCache,
  getDemoContentTableProbeCacheForTests,
  REQUIRED_DEMO_SCHEMA_TABLES,
} from "./schemaReadiness";
export type {
  DemoContentSchemaState,
  DemoContentSchemaReadiness,
  DemoContentSchemaTable,
} from "./schemaReadiness";

/** Loader-facing table alias — subset used by public read paths. */
export type DemoContentTable = Extract<
  DemoContentSchemaTable,
  | "stories"
  | "prayer_video_responses"
  | "story_reactions"
  | "prayer_written_responses"
  | "saved_content"
  | "prayer_follows"
  | "story_video_replies"
  | "content_reports"
  | "profiles"
>;

export type DemoContentSchemaCapabilities = {
  state: import("./schemaReadiness").DemoContentSchemaState;
  profiles: { hasIsDemo: boolean };
  stories: { hasIsDemo: boolean };
  prayerVideoResponses: { hasIsDemo: boolean };
  storyReactions: { hasIsDemo: boolean };
  prayerWrittenResponses: { hasIsDemo: boolean };
  savedContent: { hasIsDemo: boolean };
  prayerFollows: { hasIsDemo: boolean };
  storyVideoReplies: { hasIsDemo: boolean };
  contentReports: { hasIsDemo: boolean };
  /** True only when schema state === ready. */
  genuinePublicIsolationActive: boolean;
};

let cachedCapabilities: DemoContentSchemaCapabilities | null = null;
let capabilitiesPromise: Promise<DemoContentSchemaCapabilities> | null = null;

function tableHasIsDemo(
  table: DemoContentTable,
  capabilities: DemoContentSchemaCapabilities
) {
  switch (table) {
    case "profiles":
      return capabilities.profiles.hasIsDemo;
    case "stories":
      return capabilities.stories.hasIsDemo;
    case "prayer_video_responses":
      return capabilities.prayerVideoResponses.hasIsDemo;
    case "story_reactions":
      return capabilities.storyReactions.hasIsDemo;
    case "prayer_written_responses":
      return capabilities.prayerWrittenResponses.hasIsDemo;
    case "saved_content":
      return capabilities.savedContent.hasIsDemo;
    case "prayer_follows":
      return capabilities.prayerFollows.hasIsDemo;
    case "story_video_replies":
      return capabilities.storyVideoReplies.hasIsDemo;
    case "content_reports":
      return capabilities.contentReports.hasIsDemo;
    default:
      return false;
  }
}

function readinessToCapabilities(
  readiness: Awaited<ReturnType<typeof getDemoContentSchemaReadiness>>
): DemoContentSchemaCapabilities {
  return {
    state: readiness.state,
    profiles: readiness.tables.profiles,
    stories: readiness.tables.stories,
    prayerVideoResponses: readiness.tables.prayer_video_responses,
    storyReactions: readiness.tables.story_reactions,
    prayerWrittenResponses: readiness.tables.prayer_written_responses,
    savedContent: readiness.tables.saved_content,
    prayerFollows: readiness.tables.prayer_follows,
    storyVideoReplies: readiness.tables.story_video_replies,
    contentReports: readiness.tables.content_reports,
    genuinePublicIsolationActive: readiness.genuinePublicIsolationActive,
  };
}

/** Cached readiness mapped for loader consumption. Throws on schema drift. */
export async function getDemoContentSchemaCapabilities(): Promise<DemoContentSchemaCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;
  if (capabilitiesPromise) return capabilitiesPromise;

  capabilitiesPromise = (async () => {
    const readiness = await getDemoContentSchemaReadiness();
    cachedCapabilities = readinessToCapabilities(readiness);
    return cachedCapabilities;
  })();

  try {
    return await capabilitiesPromise;
  } catch (error) {
    capabilitiesPromise = null;
    throw error;
  } finally {
    if (cachedCapabilities) {
      capabilitiesPromise = null;
    }
  }
}

/** Test helper — reset cached probe between tests. */
export function resetDemoContentSchemaCapabilitiesCache() {
  cachedCapabilities = null;
  capabilitiesPromise = null;
  resetDemoContentSchemaReadinessCache();
}

export function isExplicitDemoFlag(value: unknown): boolean {
  return value === true;
}

/** Genuine-public inclusion: only explicit demo=true is excluded. */
export function isGenuinePublicDemoRecord(value: unknown): boolean {
  return value !== true;
}

export function recordMatchesLoaderMode(
  record: DemoContentFieldSnapshot | null | undefined,
  mode: DemoLoaderMode
): boolean {
  if (mode === "controlled_demo") {
    return true;
  }
  return isGenuinePublicDemoRecord(record?.is_demo);
}

type EqCapableQuery = {
  eq: (column: string, value: boolean) => unknown;
};

/** Apply database-level genuine-public demo exclusion when schema is ready. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyGenuinePublicDemoFilter(
  query: any,
  table: DemoContentTable,
  capabilities: DemoContentSchemaCapabilities
): any {
  if (capabilities.state !== "ready" || !tableHasIsDemo(table, capabilities)) {
    return query;
  }
  return query.eq("is_demo", false);
}

export const DEMO_STORY_FIELD_SELECT =
  "is_demo, demo_seed_run_id, demo_scenario_id, content_origin, demo_display_label, is_ai_generated";

export const DEMO_RESPONSE_FIELD_SELECT =
  "is_demo, demo_seed_run_id, demo_scenario_id, content_origin, demo_display_label, is_ai_generated, demo_media_transcript";

export const DEMO_CHILD_FIELD_SELECT = "is_demo, demo_seed_run_id";

export function appendDemoFieldsToSelect(
  select: string,
  table: DemoContentTable,
  capabilities: DemoContentSchemaCapabilities,
  fields: string = DEMO_STORY_FIELD_SELECT
): string {
  if (
    capabilities.state !== "ready" ||
    !tableHasIsDemo(table, capabilities) ||
    select.includes("is_demo")
  ) {
    return select;
  }
  return `${select}, ${fields}`;
}

/** Ignore explicit demo rows in sync/revalidation paths. Partial realtime payloads without is_demo are allowed. */
export function shouldIgnoreGenuinePublicRealtimeRecord(
  record: DemoContentFieldSnapshot | Record<string, unknown> | null | undefined,
  _capabilities: Pick<DemoContentSchemaCapabilities, "genuinePublicIsolationActive">
): boolean {
  if (!record) return false;
  return isExplicitDemoFlag((record as DemoContentFieldSnapshot).is_demo);
}

/** Fail-safe Realtime ingress: reject explicit demo rows; fail closed on INSERT when schema active. */
export function shouldIgnoreGenuinePublicRealtimeIngress(
  record: DemoContentFieldSnapshot | Record<string, unknown> | null | undefined,
  capabilities: Pick<DemoContentSchemaCapabilities, "genuinePublicIsolationActive">,
  options?: { eventType?: string | null }
): boolean {
  if (!record) return false;

  const isDemo = (record as DemoContentFieldSnapshot).is_demo;

  if (isExplicitDemoFlag(isDemo)) {
    return true;
  }

  if (!capabilities.genuinePublicIsolationActive) {
    return false;
  }

  const eventType = (options?.eventType || "").toUpperCase();
  if (eventType === "UPDATE") {
    return false;
  }

  return isDemo !== false;
}

export function filterGenuinePublicDemoRows<
  T extends DemoContentFieldSnapshot & Record<string, unknown>,
>(rows: T[]): T[] {
  return rows.filter((row) => isGenuinePublicDemoRecord(row.is_demo));
}
