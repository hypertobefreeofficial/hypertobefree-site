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
};

const COMMUNITY_LOAD_ERROR =
  "We couldn't load the community prayers right now.";

export async function loadCommunityPrayerResponses(storyId: string): Promise<
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
      supabase
        .from("prayer_video_responses")
        .select("id, user_id, video_url, created_at, status")
        .eq("story_id", storyId)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(20),
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

    const authorIds = [
      ...writtenRows.map((row) => row.author_user_id),
      ...videoRows.map((row) => row.user_id),
    ];
    const profiles = await loadPrayerAuthorProfiles(authorIds);

    const written: WrittenPrayerResponse[] = writtenRows.map((row) => ({
      id: row.id,
      body: row.body,
      authorUserId: row.author_user_id,
      author: resolveAuthorPresentation(row.author_user_id, profiles),
      createdAt: row.created_at,
      status: row.status,
    }));

    const video: VideoPrayerResponse[] = await Promise.all(
      videoRows.map(async (row) => {
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

    return {
      ok: true,
      responses: {
        written,
        video,
        totalCount: written.length + video.length,
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

export async function submitPublicVideoPrayerResponse(options: {
  prayerStoryId: string;
  responseVideoUrl: string;
  accessToken: string;
}) {
  const response = await fetch("/api/submit-prayer-video-response", {
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

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    response_id?: string;
    status?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || "Could not submit your public video prayer.");
  }

  return data;
}
