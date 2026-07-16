import { supabase } from "../supabaseClient";

export type CommunityFeedSchemaCapabilities = {
  stories: {
    hasRemovedAt: boolean;
    hasThumbnailUrl: boolean;
  };
  prayerVideoResponses: {
    hasRemovedAt: boolean;
    hasThumbnailUrl: boolean;
  };
};

let cachedCapabilities: CommunityFeedSchemaCapabilities | null = null;
let capabilitiesPromise: Promise<CommunityFeedSchemaCapabilities> | null =
  null;

function isMissingColumnError(message: string, column: string) {
  return (
    new RegExp(column, "i").test(message) &&
    /column|schema|does not exist|could not find/i.test(message)
  );
}

/**
 * Probes whether a column is readable on a table.
 * Returns false on missing-column errors or any probe failure (fail closed).
 */
async function probeReadableColumn(
  table: "stories" | "prayer_video_responses",
  column: string
): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1);

  if (!error) return true;

  if (isMissingColumnError(error.message, column)) {
    return false;
  }

  console.error(
    `[community-feed] Could not verify ${table}.${column}; treating as unavailable:`,
    error.message
  );
  return false;
}

/**
 * Cached schema capability probe for Community Feed moderation fields.
 * `removed_at` must be present or affected content is omitted (fail closed).
 */
export async function getCommunityFeedSchemaCapabilities(): Promise<CommunityFeedSchemaCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;
  if (capabilitiesPromise) return capabilitiesPromise;

  capabilitiesPromise = (async () => {
    const [
      storiesRemovedAt,
      storiesThumbnailUrl,
      responsesRemovedAt,
      responsesThumbnailUrl,
    ] = await Promise.all([
      probeReadableColumn("stories", "removed_at"),
      probeReadableColumn("stories", "thumbnail_url"),
      probeReadableColumn("prayer_video_responses", "removed_at"),
      probeReadableColumn("prayer_video_responses", "thumbnail_url"),
    ]);

    if (!storiesRemovedAt) {
      console.error(
        "[community-feed] stories.removed_at is unavailable. Approved stories will be omitted from the Community Feed until the migration is applied."
      );
    }

    if (!responsesRemovedAt) {
      console.error(
        "[community-feed] prayer_video_responses.removed_at is unavailable. Public video responses will be omitted from the Community Feed until the migration is applied."
      );
    }

    cachedCapabilities = {
      stories: {
        hasRemovedAt: storiesRemovedAt,
        hasThumbnailUrl: storiesThumbnailUrl,
      },
      prayerVideoResponses: {
        hasRemovedAt: responsesRemovedAt,
        hasThumbnailUrl: responsesThumbnailUrl,
      },
    };

    return cachedCapabilities;
  })();

  try {
    return await capabilitiesPromise;
  } finally {
    capabilitiesPromise = null;
  }
}

/** Test helper — reset cached probe between tests. */
export function resetCommunityFeedSchemaCapabilitiesCache() {
  cachedCapabilities = null;
  capabilitiesPromise = null;
}
