/**
 * Dedicated profile-avatar physical Storage adapter (3B.4B.2A).
 * Its public operations accept only a canonical object path; bucket authority
 * is fixed here and cannot be selected by callers.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
  type AccountDeletionStorageObjectExistence,
} from "./accountDeletionStorageObjectExistence";
import {
  createAccountDeletionServiceRoleSupabaseClient,
  normalizeAccountDeletionStorageHttpStatus,
  type AccountDeletionStorageProviderErrorLike,
} from "./accountDeletionStorageProviderSafety";

export const ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_BUCKET =
  "profile-avatars" as const;
export const ACCOUNT_DELETION_PROFILE_MEDIA_LIST_LIMIT = 10 as const;

const PROFILE_AVATAR_OBJECT_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/avatar\.(?:png|webp|jpg|jpeg)$/;

export type AccountDeletionProfileMediaStorageErrorCode =
  | "storage_delete_invalid_path"
  | "storage_delete_unauthorized"
  | "storage_delete_forbidden"
  | "storage_delete_conflict"
  | "storage_delete_rate_limited"
  | "storage_delete_provider_failed"
  | "storage_delete_network_failed";

export type AccountDeletionProfileMediaStorageAdapter = {
  objectExists(
    objectPath: string
  ): Promise<AccountDeletionStorageObjectExistence>;
  removeObject(
    objectPath: string
  ): Promise<
    | { ok: true }
    | {
        ok: false;
        code: AccountDeletionProfileMediaStorageErrorCode;
        terminal: boolean;
      }
  >;
};

export function validateAccountDeletionProfileAvatarObjectPath(
  objectPath: string
): boolean {
  return (
    typeof objectPath === "string" &&
    PROFILE_AVATAR_OBJECT_PATH_PATTERN.test(objectPath)
  );
}

export function classifyAccountDeletionProfileMediaRemoveError(
  error: AccountDeletionStorageProviderErrorLike
): {
  code: AccountDeletionProfileMediaStorageErrorCode;
  terminal: boolean;
} {
  const status = normalizeAccountDeletionStorageHttpStatus(
    error.statusCode ?? error.status
  );
  switch (status) {
    case 401:
      return { code: "storage_delete_unauthorized", terminal: true };
    case 403:
      return { code: "storage_delete_forbidden", terminal: true };
    case 409:
      return { code: "storage_delete_conflict", terminal: false };
    case 429:
      return { code: "storage_delete_rate_limited", terminal: false };
    case 400:
      return { code: "storage_delete_provider_failed", terminal: true };
    default:
      return { code: "storage_delete_provider_failed", terminal: false };
  }
}

export function createAccountDeletionProfileMediaStorageAdapter(
  client: SupabaseClient = createAccountDeletionServiceRoleSupabaseClient()
): AccountDeletionProfileMediaStorageAdapter {
  return {
    async objectExists(objectPath) {
      if (!validateAccountDeletionProfileAvatarObjectPath(objectPath)) {
        return {
          status: "uncertain",
          code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
        };
      }
      const [ownerDirectory, filename] = objectPath.split("/");
      if (!ownerDirectory || !filename) {
        return {
          status: "uncertain",
          code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
        };
      }
      try {
        const { data, error } = await client.storage
          .from(ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_BUCKET)
          .list(ownerDirectory, {
            search: filename,
            limit: ACCOUNT_DELETION_PROFILE_MEDIA_LIST_LIMIT,
          });
        if (error !== null || !Array.isArray(data)) {
          return {
            status: "uncertain",
            code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
          };
        }
        if (
          !Array.from(data).every(
            (object) =>
              object != null &&
              typeof object === "object" &&
              !Array.isArray(object) &&
              typeof object.name === "string"
          )
        ) {
          return {
            status: "uncertain",
            code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
          };
        }
        if (
          data.some((object) => object.name === filename)
        ) {
          return { status: "exists" };
        }
        // A full fuzzy-search page could hide the exact match on a later page.
        // Fail closed instead of treating a truncated result as definitive.
        if (data.length >= ACCOUNT_DELETION_PROFILE_MEDIA_LIST_LIMIT) {
          return {
            status: "uncertain",
            code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
          };
        }
        return { status: "absent" };
      } catch {
        return {
          status: "uncertain",
          code: ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE,
        };
      }
    },

    async removeObject(objectPath) {
      if (!validateAccountDeletionProfileAvatarObjectPath(objectPath)) {
        return {
          ok: false,
          code: "storage_delete_invalid_path",
          terminal: true,
        };
      }
      try {
        const { error } = await client.storage
          .from(ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_BUCKET)
          .remove([objectPath]);
        if (error) {
          return {
            ok: false,
            ...classifyAccountDeletionProfileMediaRemoveError(error),
          };
        }
        return { ok: true };
      } catch {
        return {
          ok: false,
          code: "storage_delete_network_failed",
          terminal: false,
        };
      }
    },
  };
}

export const ACCOUNT_DELETION_PROFILE_MEDIA_STORAGE_ADAPTER_NOTE =
  "Server-only adapter hardcodes profile-avatars and accepts one canonical "
  + "<uuid>/avatar.(png|webp|jpg|jpeg) object path. Existence uses a bounded "
  + "owner-directory list with an exact filename match. It exposes no bucket or mode argument.";
