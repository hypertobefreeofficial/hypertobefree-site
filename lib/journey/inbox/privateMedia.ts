import { supabase } from "../../supabaseClient";

export const JOURNEY_PRIVATE_MEDIA_BUCKET = "journey-private-media";
export const JOURNEY_PRIVATE_MEDIA_PREFIX = `${JOURNEY_PRIVATE_MEDIA_BUCKET}/`;

export function isPrivateInboxMediaReference(value: string | null | undefined) {
  if (!value) return false;
  return value.trim().startsWith(JOURNEY_PRIVATE_MEDIA_PREFIX);
}

export function buildPrivateInboxMediaReference(
  ownerUserId: string,
  threadId: string,
  extension: string
) {
  const objectId = crypto.randomUUID();
  const normalizedExtension = extension.replace(/^\./, "").toLowerCase() || "mp4";
  const objectPath = `${ownerUserId}/${threadId}/${objectId}.${normalizedExtension}`;
  return `${JOURNEY_PRIVATE_MEDIA_PREFIX}${objectPath}`;
}

export function getPrivateInboxMediaObjectPath(reference: string) {
  const trimmed = reference.trim();
  if (!isPrivateInboxMediaReference(trimmed)) return null;
  return trimmed.slice(JOURNEY_PRIVATE_MEDIA_PREFIX.length);
}

export async function uploadPrivateInboxVideo(options: {
  ownerUserId: string;
  threadId: string;
  file: File;
}) {
  const extension =
    options.file.name.split(".").pop()?.toLowerCase() || "mp4";
  const reference = buildPrivateInboxMediaReference(
    options.ownerUserId,
    options.threadId,
    extension
  );
  const objectPath = getPrivateInboxMediaObjectPath(reference);
  if (!objectPath) {
    throw new Error("Could not prepare private video upload.");
  }

  const { error } = await supabase.storage
    .from(JOURNEY_PRIVATE_MEDIA_BUCKET)
    .upload(objectPath, options.file, {
      cacheControl: "private, max-age=0, no-store",
      upsert: false,
      contentType: options.file.type || "video/mp4",
    });

  if (error) {
    throw new Error(error.message);
  }

  return reference;
}
