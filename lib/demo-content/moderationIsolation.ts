import type { DemoContentFieldSnapshot } from "./types";
import {
  applyGenuinePublicDemoFilter,
  type DemoContentSchemaCapabilities,
} from "./eligibility";
import type { DemoContentSchemaTable } from "./schemaReadiness";
import { filterGenuinePublicDemoRows } from "./eligibility";

type ModerationTable = Extract<
  DemoContentSchemaTable,
  "stories" | "prayer_video_responses" | "content_reports"
>;

type EqCapableQuery = {
  eq: (column: string, value: boolean) => unknown;
};

/** Default genuine admin moderation queries exclude demo records. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyGenuinePublicModerationFilter(
  query: any,
  table: ModerationTable,
  capabilities: DemoContentSchemaCapabilities
): any {
  return applyGenuinePublicDemoFilter(query, table, capabilities);
}

export function filterGenuinePublicModerationRows<
  T extends DemoContentFieldSnapshot & Record<string, unknown>,
>(rows: T[]): T[] {
  return filterGenuinePublicDemoRows(rows);
}

/** Genuine admin queues must not surface demo rows unless an explicit future demo loader opts in. */
export function isGenuinePublicModerationRecord(
  record: DemoContentFieldSnapshot | null | undefined
): boolean {
  return record?.is_demo !== true;
}
