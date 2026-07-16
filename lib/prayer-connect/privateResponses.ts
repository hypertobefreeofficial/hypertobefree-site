import { supabase } from "../supabaseClient";
import { uploadPrayerVideo } from "./media";
import type { ResponseContextLabels } from "../responses/responseContext";

const MAX_PRIVATE_VIDEO_SECONDS = 30;

async function assertUsersNotBlocked(
  senderUserId: string,
  recipientUserId: string
) {
  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocker_user_id")
    .or(
      `and(blocker_user_id.eq.${senderUserId},blocked_user_id.eq.${recipientUserId}),and(blocker_user_id.eq.${recipientUserId},blocked_user_id.eq.${senderUserId})`
    )
    .limit(1);

  if (error) {
    console.error("Private prayer block check failed:", error.message);
    throw new Error("Could not verify messaging permissions. Please try again.");
  }

  if ((data ?? []).length > 0) {
    throw new Error("You cannot send messages to this person.");
  }
}

export async function sendPrivatePrayerMessage(options: {
  storyId: string;
  senderUserId: string;
  recipientUserId: string;
  body: string;
  storyTitle: string;
  messagePreviewPrefix?: string;
}) {
  const clean = options.body.trim();
  if (!clean) throw new Error("Please write a message first.");

  await assertUsersNotBlocked(options.senderUserId, options.recipientUserId);

  const { data: existing } = await supabase
    .from("story_video_replies")
    .select("id")
    .eq("story_id", options.storyId)
    .eq("user_id", options.senderUserId)
    .eq("recipient_user_id", options.recipientUserId)
    .order("created_at", { ascending: false })
    .limit(1);

  const previewPrefix = options.messagePreviewPrefix ?? "Prayer request";
  const preview = `${previewPrefix}: ${options.storyTitle}`;
  const message = `${preview}\n\n${clean}`;

  const { error } = await supabase.from("story_video_replies").insert({
    story_id: options.storyId,
    user_id: options.senderUserId,
    recipient_user_id: options.recipientUserId,
    message,
    parent_reply_id: existing?.[0]?.id ?? null,
  });

  if (error) throw new Error(error.message);

  return {
    destination: `/messages?story=${options.storyId}`,
    reusedThread: Boolean(existing?.length),
  };
}

export async function sendPrivateVideoPrayer(options: {
  storyId: string;
  senderUserId: string;
  recipientUserId: string;
  videoFile: File;
  note?: string;
  storyTitle: string;
  labels?: Pick<
    ResponseContextLabels,
    | "privateVideoTitleRecipient"
    | "privateVideoTitleSender"
    | "privateVideoBodyFallback"
  >;
}) {
  await assertUsersNotBlocked(options.senderUserId, options.recipientUserId);

  const duration = await readVideoDuration(options.videoFile);
  if (duration > MAX_PRIVATE_VIDEO_SECONDS) {
    throw new Error(
      `Private videos must be ${MAX_PRIVATE_VIDEO_SECONDS} seconds or shorter.`
    );
  }

  const videoUrl = await uploadPrayerVideo(options.senderUserId, options.videoFile);
  const threadId = crypto.randomUUID();
  const body =
    options.note?.trim() ||
    `${options.labels?.privateVideoBodyFallback ?? "A private video prayer for"}: ${options.storyTitle}`;

  const rows = [
    {
      user_id: options.recipientUserId,
      sender_user_id: options.senderUserId,
      thread_id: threadId,
      title:
        options.labels?.privateVideoTitleRecipient ??
        "Someone sent you a private video prayer",
      body,
      category: "prayer",
      message_type: "prayer_video_reply",
      prayer_request_id: options.storyId,
      story_id: options.storyId,
      action_url: "/journey/inbox",
      video_url: videoUrl,
      read: false,
    },
    {
      user_id: options.senderUserId,
      sender_user_id: options.senderUserId,
      thread_id: threadId,
      title:
        options.labels?.privateVideoTitleSender ??
        "You sent a private video prayer",
      body,
      category: "prayer",
      message_type: "prayer_video_reply",
      prayer_request_id: options.storyId,
      story_id: options.storyId,
      action_url: "/journey/inbox",
      video_url: videoUrl,
      read: true,
    },
  ];

  const { error } = await supabase.from("inbox_messages").insert(rows);
  if (error) throw new Error(error.message);

  return { destination: "/journey/inbox" };
}

function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration."));
    };
    video.src = url;
  });
}
