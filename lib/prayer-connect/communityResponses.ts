import { supabase } from "../supabaseClient";
import { resolveStoryMediaUrl, STORY_VIDEO_BUCKET } from "./media";
import {
  loadPrayerAuthorProfiles,
  resolveAuthorPresentation,
  type PrayerAuthorProfile,
} from "./authorProfiles";
import { isMockPrayerMode } from "./mockMode";
import { getMockCommunityResponses } from "./mockPrayerData";

export type WrittenPrayerResponse = {
  id: string;
  body: string;
  authorUserId: string;
  author: PrayerAuthorProfile;
  createdAt: string;
  status: string;
};

export type VideoPrayerResponse = {
  id: string;
  videoUrl: string | null;
  signedVideoUrl: string | null;
  authorUserId: string;
  author: PrayerAuthorProfile;
  createdAt: string;
  status: string;
};

export type CommunityPrayerResponses = {
  written: WrittenPrayerResponse[];
  video: VideoPrayerResponse[];
  totalCount: number;
  /** Viewer-private awareness of their own non-public responses on this story. */
  viewer?: {
    removedCount: number;
    pendingCount: number;
  };
};

const COMMUNITY_LOAD_ERROR =
  "We couldn't load the community prayers right now.";

async function loadApprovedVideoResponses(storyId: string) {
  const withRemovedFilter = await supabase
    .from("prayer_video_responses")
    .select("id, user_id, video_url, created_at, status")
    .eq("story_id", storyId)
    .eq("status", "approved")
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!withRemovedFilter.error) {
    return withRemovedFilter;
  }

  if (/removed_at/i.test(withRemovedFilter.error.message)) {
    return supabase
      .from("prayer_video_responses")
      .select("id, user_id, video_url, created_at, status")
      .eq("story_id", storyId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(20);
  }

  return withRemovedFilter;
}

async function loadBidirectionalBlockedUserIds(
  viewerUserId: string
): Promise<Set<string>> {
  const blocked = new Set<string>();

  const [iBlockedResult, blockedMeResult] = await Promise.all([
    supabase
      .from("blocked_users")
      .select("blocked_user_id")
      .eq("blocker_user_id", viewerUserId),
    supabase
      .from("blocked_users")
      .select("blocker_user_id")
      .eq("blocked_user_id", viewerUserId),
  ]);

  if (!iBlockedResult.error) {
    ((iBlockedResult.data as { blocked_user_id: string | null }[]) ?? []).forEach(
      (row) => {
        if (row.blocked_user_id) blocked.add(row.blocked_user_id);
      }
    );
  }

  if (!blockedMeResult.error) {
    ((blockedMeResult.data as { blocker_user_id: string | null }[]) ?? []).forEach(
      (row) => {
        if (row.blocker_user_id) blocked.add(row.blocker_user_id);
      }
    );
  }

  return blocked;
}

export async function loadCommunityPrayerResponses(
  storyId: string,
  viewerUserId?: string | null
): Promise<
  | { ok: true; responses: CommunityPrayerResponses }
  | { ok: false; userMessage: string; technicalError?: string }
> {
  if (isMockPrayerMode() || storyId.startsWith("mock-")) {
    const mock = getMockCommunityResponses(storyId);
    if (mock) {
      return { ok: true, responses: mock };
    }
    return {
      ok: true,
      responses: { written: [], video: [], totalCount: 0 },
    };
  }

  try {
    const [writtenResult, videoResult] = await Promise.all([
      supabase
        .from("prayer_written_responses")
        .select("id, body, author_user_id, created_at, status")
        .eq("story_id", storyId)
        .eq("status", "visible")
        .order("created_at", { ascending: false })
        .limit(20),
      loadApprovedVideoResponses(storyId),
    ]);

    if (writtenResult.error) {
      console.error(
        "prayer_written_responses load failed:",
        writtenResult.error
      );
      return {
        ok: false,
        userMessage: COMMUNITY_LOAD_ERROR,
        technicalError: writtenResult.error.message,
      };
    }

    const writtenRows =
      (writtenResult.data as {
        id: string;
        body: string;
        author_user_id: string;
        created_at: string;
        status: string;
      }[]) ?? [];

    const videoRows = videoResult.error
      ? []
      : ((videoResult.data as {
          id: string;
          user_id: string;
          video_url: string | null;
          created_at: string;
          status: string;
        }[]) ?? []);

    if (videoResult.error) {
      console.error("prayer_video_responses load failed:", videoResult.error);
    }

    let filteredWrittenRows = writtenRows;
    let filteredVideoRows = videoRows;
    if (viewerUserId) {
      const blockedAuthors = await loadBidirectionalBlockedUserIds(viewerUserId);
      if (blockedAuthors.size > 0) {
        filteredWrittenRows = writtenRows.filter(
          (row) => !blockedAuthors.has(row.author_user_id)
        );
        filteredVideoRows = videoRows.filter(
          (row) => !blockedAuthors.has(row.user_id)
        );
      }
    }

    const authorIds = [
      ...filteredWrittenRows.map((row) => row.author_user_id),
      ...filteredVideoRows.map((row) => row.user_id),
    ];
    const profiles = await loadPrayerAuthorProfiles(authorIds);

    const written: WrittenPrayerResponse[] = filteredWrittenRows.map((row) => ({
      id: row.id,
      body: row.body,
      authorUserId: row.author_user_id,
      author: resolveAuthorPresentation(row.author_user_id, profiles),
      createdAt: row.created_at,
      status: row.status,
    }));

    const video: VideoPrayerResponse[] = await Promise.all(
      filteredVideoRows.map(async (row) => {
        const signedVideoUrl = await resolveStoryMediaUrl(
          row.video_url,
          STORY_VIDEO_BUCKET
        );
        return {
          id: row.id,
          videoUrl: row.video_url,
          signedVideoUrl,
          authorUserId: row.user_id,
          author: resolveAuthorPresentation(row.user_id, profiles),
          createdAt: row.created_at,
          status: row.status,
        };
      })
    );

    // Viewer-private: does the current user have their own non-public response
    // on this prayer? (Used to show a neutral "no longer visible" note.)
    let viewer: CommunityPrayerResponses["viewer"];
    if (viewerUserId) {
      // Note: selects only pre-existing columns so this works whether or not the
      // soft-removal migration has been applied.
      const { data: mineData, error: mineError } = await supabase
        .from("prayer_video_responses")
        .select("id, status")
        .eq("story_id", storyId)
        .eq("user_id", viewerUserId);
      if (!mineError) {
        const mine =
          (mineData as { id: string; status: string | null }[]) ?? [];
        viewer = {
          removedCount: mine.filter((row) => row.status === "removed").length,
          pendingCount: mine.filter(
            (row) => row.status !== "approved" && row.status !== "removed"
          ).length,
        };
      }
    }

    return {
      ok: true,
      responses: {
        written,
        video,
        totalCount: written.length + video.length,
        viewer,
      },
    };
  } catch (error) {
    console.error("Community prayer response load failed:", error);
    return {
      ok: false,
      userMessage: COMMUNITY_LOAD_ERROR,
      technicalError:
        error instanceof Error ? error.message : "Unknown community load error",
    };
  }
}

export type RemoveVideoResponseResult =
  | { ok: true; responseId: string; status: "removed" }
  | { ok: false; error: string; code: string };

/**
 * Server-verified removal of a public video prayer response. The server route
 * confirms the caller is the prayer owner, the response author, or an admin —
 * the button being visible is never trusted on its own.
 */
export async function removePrayerVideoResponse(options: {
  responseId: string;
  accessToken: string;
  reason?: string;
}): Promise<RemoveVideoResponseResult> {
  let response: Response;
  try {
    response = await fetch("/api/remove-prayer-video-response", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify({
        response_id: options.responseId,
        reason: options.reason,
      }),
    });
  } catch {
    return {
      ok: false,
      error: "We couldn't reach the server. Check your connection and retry.",
      code: "network_error",
    };
  }

  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; code?: string; responseId?: string }
    | null;

  if (!data) {
    return {
      ok: false,
      error: "The server returned an unexpected response. Please try again.",
      code: "bad_response",
    };
  }

  if (!response.ok || data.ok === false || !data.responseId) {
    return {
      ok: false,
      error: data.error || "Could not remove the response.",
      code: data.code || "remove_failed",
    };
  }

  return { ok: true, responseId: data.responseId, status: "removed" };
}

export async function deleteWrittenPrayerResponse(
  responseId: string,
  userId: string
) {
  const { error } = await supabase
    .from("prayer_written_responses")
    .delete()
    .eq("id", responseId)
    .eq("author_user_id", userId);

  if (error) throw new Error(error.message);
}

export type SubmitVideoPrayerResult =
  | { ok: true; responseId: string; status: "approved" | "submitted" }
  | { ok: false; error: string; code: string };

export async function submitPublicVideoPrayerResponse(options: {
  prayerStoryId: string;
  responseVideoUrl: string;
  accessToken: string;
}): Promise<SubmitVideoPrayerResult> {
  let response: Response;
  try {
    response = await fetch("/api/submit-prayer-video-response", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify({
        prayer_story_id: options.prayerStoryId,
        response_video_url: options.responseVideoUrl,
      }),
    });
  } catch {
    return {
      ok: false,
      error:
        "We couldn't reach the server. Check your connection and try again.",
      code: "network_error",
    };
  }

  // Guard against non-JSON (e.g. an HTML error page) so the client never
  // silently fails while parsing.
  const data = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        code?: string;
        responseId?: string;
        status?: "approved" | "submitted";
      }
    | null;

  if (!data) {
    return {
      ok: false,
      error: "The server returned an unexpected response. Please try again.",
      code: "bad_response",
    };
  }

  if (!response.ok || data.ok === false || !data.responseId) {
    return {
      ok: false,
      error: data.error || "Could not submit your public video prayer.",
      code: data.code || "submit_failed",
    };
  }

  return {
    ok: true,
    responseId: data.responseId,
    status: data.status === "approved" ? "approved" : "submitted",
  };
}
