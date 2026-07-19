import { supabase } from "../supabaseClient";
import {
  applyGenuinePublicDemoFilter,
  filterGenuinePublicDemoRows,
  getDemoContentSchemaCapabilities,
} from "./eligibility";
import { filterInboxMessagesForGenuineStories } from "./notificationIsolation";
import type { DemoContentFieldSnapshot } from "./types";

export type StoryVideoReplyRow = {
  id: string;
  story_id: string | null;
  user_id: string | null;
  recipient_user_id: string | null;
  parent_reply_id: string | null;
  message: string | null;
  created_at: string | null;
  deleted_by_sender: boolean | null;
  deleted_by_recipient: boolean | null;
  read_at: string | null;
  is_demo?: boolean | null;
};

/** Hide deleted rows and demo replies from genuine inboxes. */
export function filterVisibleStoryVideoRepliesForUser(
  rows: StoryVideoReplyRow[],
  currentUserId: string
): StoryVideoReplyRow[] {
  return filterGenuinePublicDemoRows(rows).filter((item) => {
    const hiddenFromSender =
      item.user_id === currentUserId && item.deleted_by_sender === true;
    const hiddenFromRecipient =
      item.recipient_user_id === currentUserId &&
      item.deleted_by_recipient === true;
    return !hiddenFromSender && !hiddenFromRecipient;
  });
}

export async function loadGenuineStoryVideoRepliesForUser(userId: string) {
  const demoCapabilities = await getDemoContentSchemaCapabilities();
  let query = supabase
    .from("story_video_replies")
    .select(
      "id, story_id, user_id, recipient_user_id, parent_reply_id, message, created_at, deleted_by_sender, deleted_by_recipient, read_at, is_demo"
    )
    .or(`user_id.eq.${userId},recipient_user_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  query = applyGenuinePublicDemoFilter(
    query,
    "story_video_replies",
    demoCapabilities
  );

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return filterVisibleStoryVideoRepliesForUser(
    (data as StoryVideoReplyRow[]) ?? [],
    userId
  );
}

export function filterGenuineSavedContentJoinRows<
  T extends {
    is_demo?: boolean | null;
    stories?:
      | (DemoContentFieldSnapshot & Record<string, unknown>)
      | (DemoContentFieldSnapshot & Record<string, unknown>)[]
      | null;
  },
>(rows: T[]): T[] {
  return filterGenuinePublicDemoRows(rows).filter((row) => {
    const story = Array.isArray(row.stories) ? row.stories[0] : row.stories;
    return story?.is_demo !== true;
  });
}

export async function resolveDemoStoryIds(storyIds: string[]): Promise<Set<string>> {
  if (storyIds.length === 0) {
    return new Set();
  }

  const demoCapabilities = await getDemoContentSchemaCapabilities();
  if (!demoCapabilities.genuinePublicIsolationActive) {
    return new Set();
  }

  const { data, error } = await supabase
    .from("stories")
    .select("id")
    .in("id", storyIds)
    .eq("is_demo", true);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(((data as { id: string }[]) ?? []).map((row) => row.id));
}

export async function filterGenuineInboxMessages<
  T extends { story_id?: string | null; prayer_request_id?: string | null },
>(messages: T[]): Promise<T[]> {
  const storyIds = Array.from(
    new Set(
      messages
        .flatMap((message) => [message.story_id, message.prayer_request_id])
        .filter(
          (storyId): storyId is string =>
            typeof storyId === "string" && storyId.trim().length > 0
        )
    )
  );

  const demoStoryIds = await resolveDemoStoryIds(storyIds);
  return filterInboxMessagesForGenuineStories(messages, demoStoryIds);
}
