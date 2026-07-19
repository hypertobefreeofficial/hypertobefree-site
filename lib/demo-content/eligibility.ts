import { supabase } from "../supabaseClient";
import type { DemoContentFieldSnapshot, DemoLoaderMode } from "./types";

export type DemoContentTable =
  | "stories"
  | "prayer_video_responses"
  | "story_reactions"
  | "prayer_written_responses"
  | "saved_content"
  | "prayer_follows"
  | "story_video_replies";

export type DemoContentSchemaCapabilities = {
  stories: { hasIsDemo: boolean };
  prayerVideoResponses: { hasIsDemo: boolean };
  storyReactions: { hasIsDemo: boolean };
  prayerWrittenResponses: { hasIsDemo: boolean };
  savedContent: { hasIsDemo: boolean };
  prayerFollows: { hasIsDemo: boolean };
  storyVideoReplies: { hasIsDemo: boolean };
  /** True when at least stories.is_demo is readable — primary isolation gate. */
  genuinePublicIsolationActive: boolean;
};

export class DemoContentSchemaProbeError extends Error {
  readonly table: DemoContentTable;
  readonly column: string;
  readonly cause: unknown;

  constructor(table: DemoContentTable, column: string, cause: unknown) {
    super(
      `[demo-content] Could not verify ${table}.${column}; demo isolation probe failed`
    );
    this.name = "DemoContentSchemaProbeError";
    this.table = table;
    this.column = column;
    this.cause = cause;
  }
}

type TableProbeState = "present" | "missing";

let cachedCapabilities: DemoContentSchemaCapabilities | null = null;
let capabilitiesPromise: Promise<DemoContentSchemaCapabilities> | null = null;
const tableProbeCache = new Map<DemoContentTable, TableProbeState>();

function isMissingColumnError(message: string, column: string) {
  return (
    new RegExp(column, "i").test(message) &&
    /column|schema|does not exist|could not find/i.test(message)
  );
}

async function probeReadableColumn(
  table: DemoContentTable,
  column: string
): Promise<boolean> {
  const cached = tableProbeCache.get(table);
  if (cached !== undefined) {
    return cached === "present";
  }

  const { error } = await supabase.from(table).select(column).limit(1);

  if (!error) {
    tableProbeCache.set(table, "present");
    return true;
  }

  if (isMissingColumnError(error.message, column)) {
    tableProbeCache.set(table, "missing");
    return false;
  }

  throw new DemoContentSchemaProbeError(table, column, error);
}

function tableHasIsDemo(
  table: DemoContentTable,
  capabilities: DemoContentSchemaCapabilities
) {
  switch (table) {
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
    default:
      return false;
  }
}

/** Cached probe for demo isolation columns. Probes each table at most once per process. */
export async function getDemoContentSchemaCapabilities(): Promise<DemoContentSchemaCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;
  if (capabilitiesPromise) return capabilitiesPromise;

  capabilitiesPromise = (async () => {
    const [
      storiesIsDemo,
      responsesIsDemo,
      reactionsIsDemo,
      writtenIsDemo,
      savedIsDemo,
      followsIsDemo,
      repliesIsDemo,
    ] = await Promise.all([
      probeReadableColumn("stories", "is_demo"),
      probeReadableColumn("prayer_video_responses", "is_demo"),
      probeReadableColumn("story_reactions", "is_demo"),
      probeReadableColumn("prayer_written_responses", "is_demo"),
      probeReadableColumn("saved_content", "is_demo"),
      probeReadableColumn("prayer_follows", "is_demo"),
      probeReadableColumn("story_video_replies", "is_demo"),
    ]);

    if (!storiesIsDemo) {
      console.warn(
        "[demo-content] stories.is_demo unavailable — genuine-public demo isolation inactive until demo schema is applied."
      );
    }

    cachedCapabilities = {
      stories: { hasIsDemo: storiesIsDemo },
      prayerVideoResponses: { hasIsDemo: responsesIsDemo },
      storyReactions: { hasIsDemo: reactionsIsDemo },
      prayerWrittenResponses: { hasIsDemo: writtenIsDemo },
      savedContent: { hasIsDemo: savedIsDemo },
      prayerFollows: { hasIsDemo: followsIsDemo },
      storyVideoReplies: { hasIsDemo: repliesIsDemo },
      genuinePublicIsolationActive: storiesIsDemo,
    };

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
  tableProbeCache.clear();
}

/** Test helper — inspect per-table probe cache state. */
export function getDemoContentTableProbeCacheForTests() {
  return tableProbeCache;
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

type EqCapableQuery<T> = {
  eq: (column: string, value: boolean) => T;
};

/** Apply database-level genuine-public demo exclusion when the column exists. */
export function applyGenuinePublicDemoFilter<T extends EqCapableQuery<T>>(
  query: T,
  table: DemoContentTable,
  capabilities: DemoContentSchemaCapabilities
): T {
  if (!tableHasIsDemo(table, capabilities)) {
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
  if (!tableHasIsDemo(table, capabilities) || select.includes("is_demo")) {
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
  // Partial UPDATE payloads may omit is_demo — allow genuine patch events through.
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
