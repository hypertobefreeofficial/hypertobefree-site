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
  isTargetUserDeletionInProgress: (
    targetUserId: string
  ) => Promise<{ ok: true; matched: boolean } | { ok: false }>;
};

/**
 * Defense-in-depth for service-role routes. Safety-critical shared freeze is enforced
 * in PostgreSQL via BEFORE INSERT/UPDATE/DELETE triggers (2C.2A) — not RLS alone.
 */
export const ACCOUNT_DELETION_SERVICE_ROLE_UNCOVERED_MUTATION_ROUTES = [] as const;

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

async function queryDeletionInProgressMatch(
  adminClient: SupabaseClient,
  targetUserId: string
): Promise<{ ok: true; matched: boolean } | { ok: false }> {
  const { data, error } = await adminClient
    .from("account_deletion_requests")
    .select("id")
    .eq("status", "deletion_in_progress")
    .or(
      `user_id.eq.${targetUserId},and(user_id.is.null,target_user_id_snapshot.eq.${targetUserId})`
    )
    .limit(1);

  if (error) {
    return { ok: false };
  }

  return { ok: true, matched: (data?.length ?? 0) > 0 };
}

export async function isTargetUserDeletionInProgress(
  targetUserId: string | null | undefined,
  deps: AccountDeletionActorWriteGuardDeps
): Promise<{ ok: true; matched: boolean } | { ok: false }> {
  if (!isValidActorUserId(targetUserId)) {
    return { ok: true, matched: false };
  }

  if (typeof deps.isTargetUserDeletionInProgress !== "function") {
    return { ok: false };
  }

  return deps.isTargetUserDeletionInProgress(targetUserId);
}

export function createAccountDeletionActorWriteGuardDeps(
  adminClient: SupabaseClient
): AccountDeletionActorWriteGuardDeps {
  return {
    async hasDeletionInProgressMatch(actorUserId) {
      return queryDeletionInProgressMatch(adminClient, actorUserId);
    },
    async isTargetUserDeletionInProgress(targetUserId) {
      return queryDeletionInProgressMatch(adminClient, targetUserId);
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

/**
 * Blocks service-role mutations affecting resources owned by a target in deletion_in_progress.
 * Used when the acting user is not the frozen owner (e.g. public response to frozen owner's story).
 */
export async function assertTargetUserResourceNotFrozen(
  targetUserId: string | null | undefined,
  deps: AccountDeletionActorWriteGuardDeps
): Promise<AccountDeletionActorWriteBlockResult> {
  if (!isValidActorUserId(targetUserId)) {
    return { blocked: false };
  }

  const lookup = await isTargetUserDeletionInProgress(targetUserId, deps);
  if (lookup.ok === false) {
    return accountDeletionActorWriteBlockedResult("lookup_failed");
  }

  if (lookup.matched) {
    return accountDeletionActorWriteBlockedResult("deletion_in_progress");
  }

  return { blocked: false };
}

/** Service-role routes inspected for story-owner deletion_in_progress stability (Phase 2C.3A). */
export const ACCOUNT_DELETION_STORY_SERVICE_ROLE_MUTATION_ROUTES = [
  "lib/server/publicVideoResponseRequest.ts → handlePublicVideoResponseRequest (prayer_video_responses insert; stories read-only)",
  "lib/server/submitPublicVideoResponse.ts → submitPublicVideoResponse (source story owner guard)",
  "app/api/remove-prayer-video-response/route.ts → actor guard when non-admin author",
  "app/api/moderate-prayer-video-response/route.ts → admin-only prayer_video_responses (no direct stories mutation)",
  "lib/server/journeyInboxReply.ts → inbox insert only (stories read-only)",
] as const;

/** No dedicated service-role profile mutation API routes — profile writes are user-JWT + RLS. */
export const ACCOUNT_DELETION_PROFILE_SERVICE_ROLE_MUTATION_ROUTES = [] as const;
