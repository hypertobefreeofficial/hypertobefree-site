/**
 * Server-side Supabase Storage adapter for account-deletion physical remove (Phase 4C.7B.1E.2C.3B.3E).
 * One exact object per call — DB authority must be established before invocation.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  StorageObjectExistsFn,
  StorageObjectRemoveFn,
} from "./accountDeletionStorageObjectExecutor";

export const ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET =
  "journey-private-media" as const;

export type AccountDeletionStorageDeleteTargetValidation =
  | { ok: true }
  | { ok: false; code: string };

const FORBIDDEN_BUCKET_CODES: Record<string, string> = {
  "profile-avatars": "bucket_profile_avatars_forbidden",
  "story-images": "bucket_story_images_forbidden",
  "story-videos": "bucket_story_videos_forbidden",
  "story-thumbnails": "bucket_story_thumbnails_forbidden",
};

export function validateAccountDeletionStorageObjectPath(
  objectPath: string
): AccountDeletionStorageDeleteTargetValidation {
  if (objectPath == null || objectPath === "") {
    return { ok: false, code: "object_path_empty" };
  }
  if (objectPath.includes("\0") || /[\u0000-\u001f\u007f]/.test(objectPath)) {
    return { ok: false, code: "object_path_control_character" };
  }
  if (objectPath !== objectPath.trim()) {
    return { ok: false, code: "object_path_not_trimmed" };
  }
  if (objectPath.startsWith("/")) {
    return { ok: false, code: "object_path_leading_slash" };
  }
  if (objectPath.endsWith("/")) {
    return { ok: false, code: "object_path_trailing_slash" };
  }
  if (
    objectPath === "." ||
    objectPath === ".." ||
    objectPath.includes("/../") ||
    objectPath.includes("/./") ||
    objectPath.startsWith("../") ||
    objectPath.split("/").some((segment) => segment === ".." || segment === ".")
  ) {
    return { ok: false, code: "object_path_traversal" };
  }
  if (/^https?:\/\//i.test(objectPath)) {
    return { ok: false, code: "object_path_url_not_allowed" };
  }
  if (
    objectPath.includes("journey-private-media/") ||
    objectPath.startsWith("storage/v1/")
  ) {
    return { ok: false, code: "object_path_bucket_prefix_not_allowed" };
  }
  return { ok: true };
}

export function validateAccountDeletionStorageBucket(
  bucket: string
): AccountDeletionStorageDeleteTargetValidation {
  if (!bucket || bucket.trim() === "") {
    return { ok: false, code: "bucket_empty" };
  }
  if (bucket !== ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET) {
    return {
      ok: false,
      code: FORBIDDEN_BUCKET_CODES[bucket] ?? "bucket_not_destructive_allowed",
    };
  }
  return { ok: true };
}

export function validateAccountDeletionStorageDeleteTarget(
  bucket: string,
  objectPath: string
): AccountDeletionStorageDeleteTargetValidation {
  const bucketCheck = validateAccountDeletionStorageBucket(bucket);
  if (!bucketCheck.ok) {
    return bucketCheck;
  }
  return validateAccountDeletionStorageObjectPath(objectPath);
}

export function createAccountDeletionServiceRoleSupabaseClient(
  env: NodeJS.ProcessEnv = process.env
): SupabaseClient {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("account_deletion_missing_supabase_service_role_config");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AccountDeletionSupabaseStorageAdapter = {
  removeObjects: StorageObjectRemoveFn;
  objectExists: StorageObjectExistsFn;
};

export function createAccountDeletionSupabaseStorageAdapter(
  client: SupabaseClient
): AccountDeletionSupabaseStorageAdapter {
  const removeObjects: StorageObjectRemoveFn = async (bucket, paths) => {
    const bucketCheck = validateAccountDeletionStorageBucket(bucket);
    if (bucketCheck.ok === false) {
      return { error: { message: bucketCheck.code } };
    }
    if (!Array.isArray(paths) || paths.length !== 1) {
      return { error: { message: "storage_remove_requires_exactly_one_path" } };
    }
    const objectPath = paths[0] ?? "";
    const pathCheck = validateAccountDeletionStorageObjectPath(objectPath);
    if (pathCheck.ok === false) {
      return { error: { message: pathCheck.code } };
    }

    const { error } = await client.storage
      .from(bucket)
      .remove([objectPath]);

    if (error) {
      return { error: { message: error.message ?? "storage_delete_failed" } };
    }
    return { error: null };
  };

  const objectExists: StorageObjectExistsFn = async (bucket, objectPath) => {
    const targetCheck = validateAccountDeletionStorageDeleteTarget(
      bucket,
      objectPath
    );
    if (targetCheck.ok === false) {
      return false;
    }

    const { data, error } = await client.storage.from(bucket).download(objectPath);
    if (data) {
      return true;
    }
    const message = (error?.message ?? "").toLowerCase();
    if (
      message.includes("not found") ||
      message.includes("object not found") ||
      message.includes("404")
    ) {
      return false;
    }
    return false;
  };

  return { removeObjects, objectExists };
}

export const ACCOUNT_DELETION_SUPABASE_STORAGE_ADAPTER_NOTE =
  "Physical deletion uses supabase.storage.from(authoritativeBucket).remove([exactPath]) only. "
  + "Bucket must be journey-private-media. Exactly one path per remove call. "
  + "No storage.objects SQL, no prefix/bulk delete, no client exposure of service role.";
