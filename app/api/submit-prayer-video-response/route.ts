import { handlePublicVideoResponseRequest } from "../../../lib/server/publicVideoResponseRequest";

/** @deprecated Prefer POST /api/responses/public-video with explicit source_type. */
export async function POST(request: Request) {
  return handlePublicVideoResponseRequest({
    request,
    legacyPrayerStoryIdField: true,
    unauthenticatedMessage: "Please sign in to send a public video prayer.",
  });
}
