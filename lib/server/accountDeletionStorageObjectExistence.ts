/**
 * Fail-closed Storage object existence probe result (Phase 4C.7B.1E.2C.3B.3F.0).
 */

export const ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE =
  "storage_existence_check_failed" as const;

export type AccountDeletionStorageObjectExistence =
  | { status: "exists" }
  | { status: "absent" }
  | {
      status: "uncertain";
      code: typeof ACCOUNT_DELETION_STORAGE_EXISTENCE_UNCERTAIN_CODE;
    };

export type StorageObjectExistsFn = (
  bucket: string,
  objectPath: string
) => Promise<AccountDeletionStorageObjectExistence>;
