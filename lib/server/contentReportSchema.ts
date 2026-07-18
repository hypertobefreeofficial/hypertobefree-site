import type { SupabaseClient } from "@supabase/supabase-js";

const PROBED_COLUMNS = [
  "id",
  "reporter_user_id",
  "reported_user_id",
  "reason",
  "details",
  "status",
  "story_id",
  "prayer_video_response_id",
  "content_type",
  "content_snapshot",
  "media_reference",
  "created_at",
] as const;

export type ContentReportColumn = (typeof PROBED_COLUMNS)[number];

let cachedColumns: Set<ContentReportColumn> | null = null;
let cacheExpiresAt = 0;
const CACHE_MS = 5 * 60 * 1000;

export async function getContentReportColumns(
  adminClient: SupabaseClient
): Promise<Set<ContentReportColumn>> {
  const now = Date.now();
  if (cachedColumns && now < cacheExpiresAt) {
    return cachedColumns;
  }

  const available = new Set<ContentReportColumn>();
  for (const column of PROBED_COLUMNS) {
    const { error } = await adminClient
      .from("content_reports")
      .select(column)
      .limit(0);
    if (!error) {
      available.add(column);
    }
  }

  cachedColumns = available;
  cacheExpiresAt = now + CACHE_MS;
  return available;
}

export function resetContentReportSchemaCacheForTests() {
  cachedColumns = null;
  cacheExpiresAt = 0;
}

export function buildContentReportDetails(options: {
  details: string;
  responseId: string | null;
  hasResponseLinkColumn: boolean;
}) {
  const trimmed = options.details.trim();
  if (!options.responseId || options.hasResponseLinkColumn) {
    return trimmed || null;
  }
  const prefix = `[response_id:${options.responseId}]`;
  return trimmed ? `${prefix} ${trimmed}` : prefix;
}

export function buildContentReportInsertPayload(options: {
  columns: Set<ContentReportColumn>;
  reporterUserId: string;
  reportedUserId: string;
  reason: string;
  details: string;
  responseId: string | null;
  resolvedStoryId: string | null;
  contentType: string;
  contentSnapshot: string | null;
  mediaReference: string | null;
}) {
  const hasResponseLinkColumn = options.columns.has("prayer_video_response_id");
  const payload: Record<string, unknown> = {};

  payload.reporter_user_id = options.reporterUserId;
  payload.reported_user_id = options.reportedUserId;
  payload.reason = options.reason;
  payload.details = buildContentReportDetails({
    details: options.details,
    responseId: options.responseId,
    hasResponseLinkColumn,
  });
  payload.status = "open";

  if (options.resolvedStoryId && options.columns.has("story_id")) {
    payload.story_id = options.resolvedStoryId;
  }
  if (options.responseId && hasResponseLinkColumn) {
    payload.prayer_video_response_id = options.responseId;
  }
  if (options.columns.has("content_type")) {
    payload.content_type = options.contentType;
  }
  if (options.columns.has("content_snapshot") && options.contentSnapshot) {
    payload.content_snapshot = options.contentSnapshot;
  }
  if (options.columns.has("media_reference") && options.mediaReference) {
    payload.media_reference = options.mediaReference;
  }

  return payload;
}
