/**
 * Auth-stage physical deletion kill switch (Phase 4C.7B.1E.2C.3B.4D.2).
 * Not orchestrator-wired in this phase.
 */

import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";

export const ACCOUNT_DELETION_AUTH_EXECUTION_ENV_FLAG =
  "HTBF_ACCOUNT_DELETION_AUTH_EXECUTION_ENABLED" as const;

export function isAccountDeletionAuthExecutionEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[ACCOUNT_DELETION_AUTH_EXECUTION_ENV_FLAG] === "true";
}

/** Physical Auth admin deleteUser requires global + auth execution flags. */
export function isAccountDeletionPhysicalAuthExecutionEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    isAccountDeletionExecutionEnabled(env) &&
    isAccountDeletionAuthExecutionEnabled(env)
  );
}

export const ACCOUNT_DELETION_AUTH_EXECUTOR_NOTE =
  "executeAccountDeletionAuthDelete performs claim → getUserById → optional deleteUser "
  + "(hard delete) → getUserById verification → complete_account_deletion_auth_execution. "
  + "Requires HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED and "
  + "HTBF_ACCOUNT_DELETION_AUTH_EXECUTION_ENABLED. Unwired from orchestrator in 3B.4D.2.";
