import { supabase } from "../supabaseClient";
import { uploadPrayerVideo } from "./media";

const MAX_PRIVATE_VIDEO_SECONDS = 120;

export async function sendPrivatePrayerMessage(options: {
  storyId: string;
  senderUserId: string;
  recipientUserId: string;
  body: string;
  storyTitle: string;
}) {
  const clean = options.body.trim();
  if (!clean) throw new Error("Please write a message first.");

  const { data: existing } = await supabase
    .from("story_video_replies")
    .select("id")
    .eq("story_id", options.storyId)
    .eq("user_id", options.senderUserId)
    .eq("recipient_user_id", options.recipientUserId)
    .order("created_at", { ascending: false })
    .limit(1);

  const preview = `Prayer request: ${options.storyTitle}`;
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
}) {
  const duration = await readVideoDuration(options.videoFile);
  if (duration > MAX_PRIVATE_VIDEO_SECONDS) {
    throw new Error(
      `Private video prayers must be ${MAX_PRIVATE_VIDEO_SECONDS} seconds or shorter.`
    );
  }

  const videoUrl = await uploadPrayerVideo(options.senderUserId, options.videoFile);
  const threadId = crypto.randomUUID();
  const body =
    options.note?.trim() ||
    `A private video prayer for: ${options.storyTitle}`;

  const rows = [
    {
      user_id: options.recipientUserId,
      sender_user_id: options.senderUserId,
      thread_id: threadId,
      title: "Someone sent you a private video prayer",
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
      title: "You sent a private video prayer",
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
