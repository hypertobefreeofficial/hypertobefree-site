import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPrivateInboxMediaObjectPath,
  isPrivateInboxMediaReference,
} from "../journey/inbox/privateMedia";
import { getPrayerThreadIdForInsert } from "../journey/inbox/utils";
import type { InboxMessage, ReplyMode } from "../journey/inbox/types";

export type JourneyInboxParentRow = {
  id: string;
  user_id: string | null;
  sender_user_id: string | null;
  thread_id: string | null;
  story_id: string | null;
  prayer_request_id: string | null;
  hidden_at: string | null;
};

export type JourneyInboxReplySuccess = {
  ok: true;
  senderMessage: InboxMessage;
  recipientMessage: InboxMessage;
};

export type JourneyInboxReplyFailure = {
  ok: false;
  status: 400 | 403 | 404;
  code: string;
  error: string;
};

export type JourneyInboxReplyResult =
  | JourneyInboxReplySuccess
  | JourneyInboxReplyFailure;

function failure(
  status: 400 | 403 | 404,
  code: string,
  error: string
): JourneyInboxReplyFailure {
  return { ok: false, status, code, error };
}

export function deriveReplyRecipientUserId(
  parent: JourneyInboxParentRow,
  senderUserId: string
): string | null {
  if (!parent.user_id || !parent.sender_user_id) return null;

  if (parent.user_id === senderUserId) {
    return parent.sender_user_id;
  }

  if (parent.sender_user_id === senderUserId) {
    return parent.user_id;
  }

  return null;
}

export function senderParticipatesInParentMessage(
  parent: JourneyInboxParentRow,
  senderUserId: string
) {
  return (
    parent.user_id === senderUserId || parent.sender_user_id === senderUserId
  );
}

export function parseValidatedPrivateMediaObjectPath(reference: string) {
  const trimmed = reference.trim();
  if (!isPrivateInboxMediaReference(trimmed)) {
    return null;
  }

  const objectPath = getPrivateInboxMediaObjectPath(trimmed);
  if (!objectPath) {
    return null;
  }

  if (/[\\?#]/.test(objectPath)) {
    return null;
  }

  const segments = objectPath.split("/");
  if (segments.length !== 3) {
    return null;
  }

  const [ownerUserId, threadId, fileName] = segments;
  if (
    !ownerUserId ||
    !threadId ||
    !fileName ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("..")
    )
  ) {
    return null;
  }

  if (!fileName.includes(".")) {
    return null;
  }

  return { ownerUserId, threadId, fileName };
}

export function validateReplyPrivateMediaReference(options: {
  videoUrl: string;
  senderUserId: string;
  threadId: string;
}) {
  const parsed = parseValidatedPrivateMediaObjectPath(options.videoUrl);
  if (!parsed) {
    return false;
  }

  if (parsed.ownerUserId !== options.senderUserId) {
    return false;
  }

  return parsed.threadId === options.threadId;
}

export async function assertUsersNotBlockedServer(
  adminClient: SupabaseClient,
  senderUserId: string,
  recipientUserId: string
) {
  const { data, error } = await adminClient
    .from("blocked_users")
    .select("blocker_user_id")
    .or(
      `and(blocker_user_id.eq.${senderUserId},blocked_user_id.eq.${recipientUserId}),and(blocker_user_id.eq.${recipientUserId},blocked_user_id.eq.${senderUserId})`
    )
    .limit(1);

  if (error) {
    console.error("Messaging block check failed:", error.message);
    throw new Error("Could not verify messaging permissions.");
  }

  if ((data ?? []).length > 0) {
    throw new Error("You cannot send messages to this person.");
  }
}

function buildReplyTitles(replyMode: ReplyMode) {
  if (replyMode === "video") {
    return {
      recipientTitle: "Someone replied with a prayer video",
      senderTitle: "You replied with a prayer video",
      defaultBody: "A believer replied with a prayer video.",
    };
  }

  return {
    recipientTitle: "Someone replied to your prayer video",
    senderTitle: "You replied with encouragement",
    defaultBody: "",
  };
}

export async function createJourneyThreadReply(options: {
  adminClient: SupabaseClient;
  senderUserId: string;
  parentMessageId: string;
  body: string;
  replyMode: ReplyMode;
  videoUrl?: string | null;
}): Promise<JourneyInboxReplyResult> {
  const parentMessageId = options.parentMessageId.trim();
  if (!parentMessageId) {
    return failure(400, "invalid_parent_message_id", "Message not found.");
  }

  const { data: parentData, error: parentError } = await options.adminClient
    .from("inbox_messages")
    .select(
      "id, user_id, sender_user_id, thread_id, story_id, prayer_request_id, hidden_at"
    )
    .eq("id", parentMessageId)
    .maybeSingle();

  if (parentError) {
    console.error("Could not load parent inbox message:", parentError.message);
    return failure(404, "message_not_found", "Message not found.");
  }

  const parent = parentData as JourneyInboxParentRow | null;
  if (!parent) {
    return failure(404, "message_not_found", "Message not found.");
  }

  if (parent.hidden_at) {
    return failure(404, "message_not_found", "Message not found.");
  }

  if (!senderParticipatesInParentMessage(parent, options.senderUserId)) {
    return failure(404, "message_not_found", "Message not found.");
  }

  const recipientUserId = deriveReplyRecipientUserId(parent, options.senderUserId);
  if (!recipientUserId || recipientUserId === options.senderUserId) {
    return failure(404, "message_not_found", "Message not found.");
  }

  try {
    await assertUsersNotBlockedServer(
      options.adminClient,
      options.senderUserId,
      recipientUserId
    );
  } catch (error) {
    return failure(
      403,
      "blocked",
      error instanceof Error && error.message
        ? error.message
        : "You cannot send a reply to this person."
    );
  }

  const titles = buildReplyTitles(options.replyMode);
  const trimmedBody = options.body.trim();
  const body =
    trimmedBody ||
    (options.replyMode === "video" ? titles.defaultBody : "");

  if (options.replyMode === "text" && !body) {
    return failure(400, "invalid_body", "Write a short reply first.");
  }

  const messageType =
    options.replyMode === "video" ? "prayer_video_reply" : "prayer_reply";
  const threadId = getPrayerThreadIdForInsert(parent as InboxMessage);
  const videoUrl =
    options.replyMode === "video" ? options.videoUrl?.trim() || null : null;

  if (options.replyMode === "video") {
    if (!videoUrl) {
      return failure(400, "invalid_video_reference", "Choose a video reply first.");
    }

    if (
      !validateReplyPrivateMediaReference({
        videoUrl,
        senderUserId: options.senderUserId,
        threadId,
      })
    ) {
      return failure(404, "unsupported_media_reference", "Message media not found.");
    }
  }

  const replyRows = [
    {
      user_id: recipientUserId,
      sender_user_id: options.senderUserId,
      parent_message_id: parentMessageId,
      thread_id: threadId,
      title: titles.recipientTitle,
      body,
      category: "prayer",
      message_type: messageType,
      story_id: parent.story_id,
      prayer_request_id: parent.prayer_request_id,
      action_url: "/journey/inbox",
      video_url: videoUrl,
      read: false,
    },
    {
      user_id: options.senderUserId,
      sender_user_id: options.senderUserId,
      parent_message_id: parentMessageId,
      thread_id: threadId,
      title: titles.senderTitle,
      body,
      category: "prayer",
      message_type: messageType,
      story_id: parent.story_id,
      prayer_request_id: parent.prayer_request_id,
      action_url: "/journey/inbox",
      video_url: videoUrl,
      read: true,
    },
  ];

  const { data: insertedRows, error: insertError } = await options.adminClient
    .from("inbox_messages")
    .insert(replyRows)
    .select(
      "id, title, body, read, created_at, category, sender_user_id, parent_message_id, thread_id, message_type, story_id, prayer_request_id, video_url, image_url, action_url, hidden_at, user_id"
    );

  if (insertError || !insertedRows || insertedRows.length < 2) {
    console.error("Could not insert Journey inbox reply:", insertError?.message);
    return failure(404, "reply_failed", "Could not send reply.");
  }

  const senderMessage = insertedRows.find(
    (row) =>
      row.user_id === options.senderUserId &&
      row.sender_user_id === options.senderUserId
  ) as InboxMessage | undefined;
  const recipientMessage = insertedRows.find(
    (row) => row.user_id === recipientUserId
  ) as InboxMessage | undefined;

  if (!senderMessage || !recipientMessage) {
    return failure(404, "reply_failed", "Could not send reply.");
  }

  return {
    ok: true,
    senderMessage,
    recipientMessage,
  };
}

export async function createInitialPrivateVideoPrayerReply(options: {
  adminClient: SupabaseClient;
  senderUserId: string;
  storyId: string;
  body: string;
  videoUrl: string;
  labels?: {
    recipientTitle?: string;
    senderTitle?: string;
  };
}): Promise<JourneyInboxReplyResult> {
  const storyId = options.storyId.trim();
  const videoUrl = options.videoUrl.trim();

  if (!storyId) {
    return failure(400, "invalid_story_id", "Message not found.");
  }

  const parsedVideo = parseValidatedPrivateMediaObjectPath(videoUrl);
  if (!parsedVideo) {
    return failure(404, "unsupported_media_reference", "Message media not found.");
  }

  const { ownerUserId, threadId } = parsedVideo;
  if (ownerUserId !== options.senderUserId) {
    return failure(404, "unsupported_media_reference", "Message media not found.");
  }

  const { data: storyData, error: storyError } = await options.adminClient
    .from("stories")
    .select("id, user_id")
    .eq("id", storyId)
    .maybeSingle();

  if (storyError || !storyData?.user_id) {
    return failure(404, "message_not_found", "Message not found.");
  }

  const recipientUserId = storyData.user_id;
  if (recipientUserId === options.senderUserId) {
    return failure(404, "message_not_found", "Message not found.");
  }

  try {
    await assertUsersNotBlockedServer(
      options.adminClient,
      options.senderUserId,
      recipientUserId
    );
  } catch (error) {
    return failure(
      403,
      "blocked",
      error instanceof Error && error.message
        ? error.message
        : "You cannot send messages to this person."
    );
  }

  const body = options.body.trim();
  if (!body) {
    return failure(400, "invalid_body", "Please write a message first.");
  }

  const replyRows = [
    {
      user_id: recipientUserId,
      sender_user_id: options.senderUserId,
      thread_id: threadId,
      title:
        options.labels?.recipientTitle ??
        "Someone sent you a private video prayer",
      body,
      category: "prayer",
      message_type: "prayer_video_reply",
      prayer_request_id: storyId,
      story_id: storyId,
      action_url: "/journey/inbox",
      video_url: videoUrl,
      read: false,
    },
    {
      user_id: options.senderUserId,
      sender_user_id: options.senderUserId,
      thread_id: threadId,
      title:
        options.labels?.senderTitle ?? "You sent a private video prayer",
      body,
      category: "prayer",
      message_type: "prayer_video_reply",
      prayer_request_id: storyId,
      story_id: storyId,
      action_url: "/journey/inbox",
      video_url: videoUrl,
      read: true,
    },
  ];

  const { data: insertedRows, error: insertError } = await options.adminClient
    .from("inbox_messages")
    .insert(replyRows)
    .select(
      "id, title, body, read, created_at, category, sender_user_id, parent_message_id, thread_id, message_type, story_id, prayer_request_id, video_url, image_url, action_url, hidden_at, user_id"
    );

  if (insertError || !insertedRows || insertedRows.length < 2) {
    console.error(
      "Could not insert initial private video prayer:",
      insertError?.message
    );
    return failure(404, "reply_failed", "Could not send reply.");
  }

  const senderMessage = insertedRows.find(
    (row) =>
      row.user_id === options.senderUserId &&
      row.sender_user_id === options.senderUserId
  ) as InboxMessage | undefined;
  const recipientMessage = insertedRows.find(
    (row) => row.user_id === recipientUserId
  ) as InboxMessage | undefined;

  if (!senderMessage || !recipientMessage) {
    return failure(404, "reply_failed", "Could not send reply.");
  }

  return {
    ok: true,
    senderMessage,
    recipientMessage,
  };
}
