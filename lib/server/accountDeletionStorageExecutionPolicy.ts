/**
 * Physical Storage deletion executor kill switches (Phase 4C.7B.1E.2C.3B.3D).
 */

import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";

export const ACCOUNT_DELETION_STORAGE_EXECUTION_ENV_FLAG =
  "HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED" as const;

export function isAccountDeletionStorageExecutionEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[ACCOUNT_DELETION_STORAGE_EXECUTION_ENV_FLAG] === "true";
}

/** Both global deletion execution and storage-specific flags must be exact "true". */
export function isAccountDeletionPhysicalStorageExecutionEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    isAccountDeletionExecutionEnabled(env) &&
    isAccountDeletionStorageExecutionEnabled(env)
  );
}

export const ACCOUNT_DELETION_STORAGE_EXECUTION_KILL_SWITCH_NOTE =
  "Physical Storage remove() requires HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED=true "
  + "AND HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED=true. Defaults OFF when unset.";
