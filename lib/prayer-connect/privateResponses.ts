import { uploadPrivateInboxVideo } from "../journey/inbox/privateMedia";
import { assertUsersNotBlocked } from "../messaging/userBlocking";
import { supabase } from "../supabaseClient";
import type { ResponseContextLabels } from "../responses/responseContext";

const MAX_PRIVATE_VIDEO_SECONDS = 30;

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
  const duration = await readVideoDuration(options.videoFile);
  if (duration > MAX_PRIVATE_VIDEO_SECONDS) {
    throw new Error(
      `Private videos must be ${MAX_PRIVATE_VIDEO_SECONDS} seconds or shorter.`
    );
  }

  const threadId = crypto.randomUUID();
  const videoUrl = await uploadPrivateInboxVideo({
    ownerUserId: options.senderUserId,
    threadId,
    file: options.videoFile,
  });
  const body =
    options.note?.trim() ||
    `${options.labels?.privateVideoBodyFallback ?? "A private video prayer for"}: ${options.storyTitle}`;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Please sign in to continue.");
  }

  const response = await fetch("/api/journey/inbox/private-prayer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      storyId: options.storyId,
      body,
      videoUrl,
      recipientTitle: options.labels?.privateVideoTitleRecipient,
      senderTitle: options.labels?.privateVideoTitleSender,
    }),
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Could not send private video prayer.");
  }

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
