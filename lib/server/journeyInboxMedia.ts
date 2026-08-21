import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPrivateInboxMediaObjectPath,
  isLegacyInboxVideoUrl,
  isPrivateInboxMediaReference,
  JOURNEY_PRIVATE_MEDIA_BUCKET,
} from "../journey/inbox/privateMedia";

export const INBOX_MEDIA_SIGNED_URL_TTL_SECONDS = 15 * 60;

export type JourneyInboxMediaRow = {
  id: string;
  video_url: string | null;
  user_id: string | null;
  sender_user_id: string | null;
  hidden_at: string | null;
};

export type ResolveJourneyInboxMediaSuccess = {
  ok: true;
  signedUrl: string;
  expiresAt: string;
  legacy: boolean;
};

export type ResolveJourneyInboxMediaFailure = {
  ok: false;
  status: 403 | 404;
  code: string;
  error: string;
};

export type ResolveJourneyInboxMediaResult =
  | ResolveJourneyInboxMediaSuccess
  | ResolveJourneyInboxMediaFailure;

function failure(
  status: 403 | 404,
  code: string,
  error: string
): ResolveJourneyInboxMediaFailure {
  return { ok: false, status, code, error };
}

export async function resolveJourneyInboxMediaAccess(options: {
  adminClient: SupabaseClient;
  userId: string;
  messageId: string;
}): Promise<ResolveJourneyInboxMediaResult> {
  const { adminClient, userId, messageId } = options;

  const { data, error } = await adminClient
    .from("inbox_messages")
    .select("id, video_url, user_id, sender_user_id, hidden_at")
    .eq("id", messageId)
    .maybeSingle();

  if (error) {
    console.error("Could not load inbox message for media access:", error.message);
    return failure(404, "message_not_found", "Message not found.");
  }

  const message = data as JourneyInboxMediaRow | null;
  if (!message) {
    return failure(404, "message_not_found", "Message not found.");
  }

  if (message.user_id !== userId) {
    return failure(404, "message_not_found", "Message not found.");
  }

  if (!message.video_url?.trim()) {
    return failure(404, "media_not_found", "Message media not found.");
  }

  if (message.hidden_at) {
    return failure(403, "message_hidden", "This message is no longer available.");
  }

  const videoReference = message.video_url.trim();

  if (isLegacyInboxVideoUrl(videoReference)) {
    return {
      ok: true,
      signedUrl: videoReference,
      expiresAt: new Date(Date.now() + INBOX_MEDIA_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      legacy: true,
    };
  }

  if (!isPrivateInboxMediaReference(videoReference)) {
    return failure(404, "unsupported_media_reference", "Message media not found.");
  }

  const objectPath = getPrivateInboxMediaObjectPath(videoReference);
  if (!objectPath) {
    return failure(404, "invalid_media_reference", "Message media not found.");
  }

  const expiresAt = new Date(
    Date.now() + INBOX_MEDIA_SIGNED_URL_TTL_SECONDS * 1000
  ).toISOString();

  const { data: signedData, error: signError } = await adminClient.storage
    .from(JOURNEY_PRIVATE_MEDIA_BUCKET)
    .createSignedUrl(objectPath, INBOX_MEDIA_SIGNED_URL_TTL_SECONDS);

  if (signError || !signedData?.signedUrl) {
    console.error("Could not sign private inbox media:", signError?.message);
    return failure(404, "media_unavailable", "Message media is unavailable.");
  }

  return {
    ok: true,
    signedUrl: signedData.signedUrl,
    expiresAt,
    legacy: false,
  };
}

export function readJourneyInboxMediaMessageId(request: Request) {
  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId")?.trim() ?? "";
  return messageId;
}

export function rejectArbitraryStoragePathRequest(request: Request) {
  const url = new URL(request.url);
  for (const key of ["path", "storagePath", "videoUrl", "video_url", "bucket"]) {
    if (url.searchParams.has(key)) {
      return true;
    }
  }
  return false;
}
