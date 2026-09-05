import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Write-freeze architecture split:
 * - Phase 0A: browser/user-JWT mutations are blocked by RESTRICTIVE RLS when frozen.
 * - Phase 0B: service-role API routes derive the actor from auth and fail closed here
 *   before privileged INSERT/UPDATE/DELETE or storage mutations.
 */

export const ACCOUNT_DELETION_IN_PROGRESS_CODE =
  "account_deletion_in_progress" as const;

export type AccountDeletionActorWriteBlockReason =
  | "deletion_in_progress"
  | "invalid_actor"
  | "lookup_failed";

export type AccountDeletionActorWriteBlockResult =
  | { blocked: false }
  | {
      blocked: true;
      reason: AccountDeletionActorWriteBlockReason;
      code: typeof ACCOUNT_DELETION_IN_PROGRESS_CODE;
    };

export type AccountDeletionActorWriteGuardDeps = {
  hasDeletionInProgressMatch: (
    actorUserId: string
  ) => Promise<{ ok: true; matched: boolean } | { ok: false }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidActorUserId(
  actorUserId: string | null | undefined
): actorUserId is string {
  return typeof actorUserId === "string" && UUID_PATTERN.test(actorUserId);
}

export function accountDeletionActorWriteBlockedResult(
  reason: AccountDeletionActorWriteBlockReason
): Extract<AccountDeletionActorWriteBlockResult, { blocked: true }> {
  return {
    blocked: true,
    reason,
    code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
  };
}

export async function checkAccountDeletionActorWriteBlock(
  actorUserId: string | null | undefined,
  deps: AccountDeletionActorWriteGuardDeps
): Promise<AccountDeletionActorWriteBlockResult> {
  if (!isValidActorUserId(actorUserId)) {
    return accountDeletionActorWriteBlockedResult("invalid_actor");
  }

  const lookup = await deps.hasDeletionInProgressMatch(actorUserId);
  if (lookup.ok === false) {
    return accountDeletionActorWriteBlockedResult("lookup_failed");
  }

  if (lookup.matched) {
    return accountDeletionActorWriteBlockedResult("deletion_in_progress");
  }

  return { blocked: false };
}

export async function assertAccountDeletionActorCanWrite(
  actorUserId: string | null | undefined,
  deps: AccountDeletionActorWriteGuardDeps
): Promise<AccountDeletionActorWriteBlockResult> {
  return checkAccountDeletionActorWriteBlock(actorUserId, deps);
}

export function createAccountDeletionActorWriteGuardDeps(
  adminClient: SupabaseClient
): AccountDeletionActorWriteGuardDeps {
  return {
    async hasDeletionInProgressMatch(actorUserId) {
      const { data, error } = await adminClient
        .from("account_deletion_requests")
        .select("id")
        .eq("status", "deletion_in_progress")
        .or(
          `user_id.eq.${actorUserId},and(user_id.is.null,target_user_id_snapshot.eq.${actorUserId})`
        )
        .limit(1);

      if (error) {
        return { ok: false };
      }

      return { ok: true, matched: (data?.length ?? 0) > 0 };
    },
  };
}

export function accountDeletionInProgressErrorMessage(): string {
  return "Account deletion is in progress. Changes are temporarily unavailable.";
}

export function accountDeletionInProgressJsonBody() {
  return {
    ok: false as const,
    error: accountDeletionInProgressErrorMessage(),
    code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
  };
}

export function accountDeletionInProgressResponse(): Response {
  return Response.json(accountDeletionInProgressJsonBody(), { status: 403 });
}
