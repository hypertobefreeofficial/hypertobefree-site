import { createHash } from "node:crypto";
import type { AccountDeletionStoragePlan } from "./accountDeletionStoragePlan";
import type { ProfileAvatarReferenceVerifier } from "./accountDeletionProfileAvatarVerifier";
import {
  adaptSupabaseStorageRemoveResponse,
  type AccountDeletionStorageRemovePathOutcome,
  type SupabaseStorageRemoveResponse,
} from "./accountDeletionStorageRemoveAdapter";
import {
  isApprovedAccountDeletionDeleteBucket,
  type AccountDeletionStorageClassification,
} from "./accountDeletionStoragePolicy";

export const ACCOUNT_DELETION_STORAGE_DELETE_BATCH_SIZE = 50;

export const ACCOUNT_DELETION_STORAGE_AUDIT_ACTION =
  "account_deletion_storage_cleanup" as const;

export type AccountDeletionStorageRemovalResultCode =
  | "deleted_confirmed"
  | "operation_succeeded_not_confirmed"
  | "failed"
  | "blocked"
  | "preserved"
  | "avatar_reference_not_cleared";

/** @deprecated Use deleted_confirmed / operation_succeeded_not_confirmed instead. */
export type LegacyRemovalResultCode = "deleted" | "already_absent";

export type AccountDeletionStorageRemovalFailure = {
  bucket: string;
  pathFingerprint: string;
  code:
    | "remove_failed"
    | "invalid_entry"
    | "not_deletable"
    | "avatar_reference_not_cleared"
    | "avatar_verification_unavailable";
};

export type AccountDeletionStorageExecutionResult = {
  success: boolean;
  result: "success" | "partial_failure" | "blocked" | "refused";
  deletedConfirmedCount: number;
  operationSucceededNotConfirmedCount: number;
  preservedCount: number;
  failedCount: number;
  blockedCount: number;
  avatarBlockedCount: number;
  failures: AccountDeletionStorageRemovalFailure[];
  audit: AccountDeletionStorageAuditMetadata;
};

export type AccountDeletionStorageAuditMetadata = {
  action: typeof ACCOUNT_DELETION_STORAGE_AUDIT_ACTION;
  actor_user_id: string | null;
  target_user_id: string;
  request_id: string | null;
  result: "success" | "partial_failure" | "blocked" | "refused";
  counts: {
    planned: number;
    deleted_confirmed: number;
    operation_succeeded_not_confirmed: number;
    preserved: number;
    failed: number;
    blocked: number;
    avatar_blocked: number;
  };
};

export type AccountDeletionStorageExecutorDeps = {
  removeObjects: (
    bucket: string,
    paths: string[]
  ) => Promise<
    | ReturnType<typeof adaptSupabaseStorageRemoveResponse>
    | SupabaseStorageRemoveResponse
  >;
  verifyProfileAvatarReferencesCleared?: ProfileAvatarReferenceVerifier;
};

export function fingerprintStoragePath(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
}

function sanitizeRemovalErrorMessage(message: string): string {
  return message.replace(/Bearer\s+\S+/gi, "[redacted]").slice(0, 160);
}

function normalizeRemoveResult(
  bucket: string,
  paths: string[],
  removal:
    | ReturnType<typeof adaptSupabaseStorageRemoveResponse>
    | SupabaseStorageRemoveResponse
) {
  if ("outcomes" in removal) {
    return removal;
  }

  return adaptSupabaseStorageRemoveResponse(paths, removal);
}

export function validateStoragePlanForExecution(
  plan: AccountDeletionStoragePlan
):
  | { ok: true }
  | {
      ok: false;
      code:
        | "blocked_plan"
        | "invalid_delete_entry"
        | "journey_inventory_incomplete";
      reason: string;
    } {
  if (plan.blocked.length > 0) {
    return {
      ok: false,
      code: "blocked_plan",
      reason: "Storage plan contains unresolved blocked objects.",
    };
  }

  if (plan.journeyInventoryBlocked) {
    return {
      ok: false,
      code: "journey_inventory_incomplete",
      reason:
        "Journey inbox media reference inventory is incomplete. Journey private deletion is blocked.",
    };
  }

  for (const entry of plan.delete) {
    if (entry.classification !== "DELETE_PRIVATE") {
      return {
        ok: false,
        code: "invalid_delete_entry",
        reason: `Delete entry ${entry.bucket}/${entry.path} is not DELETE_PRIVATE.`,
      };
    }

    if (!isApprovedAccountDeletionDeleteBucket(entry.bucket)) {
      return {
        ok: false,
        code: "invalid_delete_entry",
        reason: `Bucket ${entry.bucket} is not approved for private deletion.`,
      };
    }
  }

  return { ok: true };
}

function chunkPaths(paths: string[], batchSize: number): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < paths.length; index += batchSize) {
    batches.push(paths.slice(index, index + batchSize));
  }
  return batches;
}

export function buildStorageCleanupAuditMetadata(input: {
  plan: AccountDeletionStoragePlan;
  actorUserId: string | null;
  result: AccountDeletionStorageExecutionResult["result"];
  deletedConfirmedCount: number;
  operationSucceededNotConfirmedCount: number;
  preservedCount: number;
  failedCount: number;
  blockedCount: number;
  avatarBlockedCount: number;
}): AccountDeletionStorageAuditMetadata {
  return {
    action: ACCOUNT_DELETION_STORAGE_AUDIT_ACTION,
    actor_user_id: input.actorUserId,
    target_user_id: input.plan.targetUserId,
    request_id: input.plan.requestId,
    result: input.result,
    counts: {
      planned: input.plan.delete.length,
      deleted_confirmed: input.deletedConfirmedCount,
      operation_succeeded_not_confirmed:
        input.operationSucceededNotConfirmedCount,
      preserved: input.preservedCount,
      failed: input.failedCount,
      blocked: input.blockedCount,
      avatar_blocked: input.avatarBlockedCount,
    },
  };
}

async function verifyAvatarEntriesForDeletion(input: {
  plan: AccountDeletionStoragePlan;
  deps: AccountDeletionStorageExecutorDeps;
}): Promise<
  | { ok: true; pathsToDelete: string[] }
  | {
      ok: false;
      result: AccountDeletionStorageExecutionResult;
    }
> {
  const avatarEntries = input.plan.delete.filter(
    (entry) => entry.bucket === "profile-avatars"
  );

  if (avatarEntries.length === 0) {
    return { ok: true, pathsToDelete: [] };
  }

  if (!input.deps.verifyProfileAvatarReferencesCleared) {
    return {
      ok: false,
      result: buildRefusedResult(input.plan, {
        actorUserId: null,
        reason: "avatar_verification_unavailable",
        avatarBlockedCount: avatarEntries.length,
        failures: avatarEntries.map((entry) => ({
          bucket: entry.bucket,
          pathFingerprint: fingerprintStoragePath(entry.path),
          code: "avatar_verification_unavailable" as const,
        })),
      }),
    };
  }

  for (const entry of avatarEntries) {
    const verification = await input.deps.verifyProfileAvatarReferencesCleared({
      targetUserId: input.plan.targetUserId,
      bucket: entry.bucket,
      path: entry.path,
    });

    if (verification.ok === false) {
      return {
        ok: false,
        result: buildRefusedResult(input.plan, {
          actorUserId: null,
          reason: "avatar_verification_unavailable",
          avatarBlockedCount: avatarEntries.length,
          failures: avatarEntries.map((entry) => ({
            bucket: entry.bucket,
            pathFingerprint: fingerprintStoragePath(entry.path),
            code: "avatar_verification_unavailable" as const,
          })),
        }),
      };
    }

    if (verification.verified === false) {
      return {
        ok: false,
        result: buildRefusedResult(input.plan, {
          actorUserId: null,
          reason: "avatar_reference_not_cleared",
          avatarBlockedCount: avatarEntries.length,
          failures: avatarEntries.map((entry) => ({
            bucket: entry.bucket,
            pathFingerprint: fingerprintStoragePath(entry.path),
            code: "avatar_reference_not_cleared" as const,
          })),
        }),
      };
    }
  }

  return { ok: true, pathsToDelete: avatarEntries.map((entry) => entry.path) };
}

function buildRefusedResult(
  plan: AccountDeletionStoragePlan,
  input: {
    actorUserId: string | null;
    reason: string;
    avatarBlockedCount: number;
    failures: AccountDeletionStorageRemovalFailure[];
  }
): AccountDeletionStorageExecutionResult {
  const preservedCount =
    plan.preservePublic.length + plan.preserveShared.length;

  return {
    success: false,
    result: "refused",
    deletedConfirmedCount: 0,
    operationSucceededNotConfirmedCount: 0,
    preservedCount,
    failedCount: 0,
    blockedCount: plan.blocked.length,
    avatarBlockedCount: input.avatarBlockedCount,
    failures: input.failures,
    audit: buildStorageCleanupAuditMetadata({
      plan,
      actorUserId: input.actorUserId,
      result: "refused",
      deletedConfirmedCount: 0,
      operationSucceededNotConfirmedCount: 0,
      preservedCount,
      failedCount: 0,
      blockedCount: plan.blocked.length,
      avatarBlockedCount: input.avatarBlockedCount,
    }),
  };
}

export async function executeAccountDeletionStoragePlan(options: {
  plan: AccountDeletionStoragePlan;
  deps: AccountDeletionStorageExecutorDeps;
  actorUserId?: string | null;
  batchSize?: number;
}): Promise<AccountDeletionStorageExecutionResult> {
  const { plan, deps } = options;
  const batchSize = options.batchSize ?? ACCOUNT_DELETION_STORAGE_DELETE_BATCH_SIZE;
  const preservedCount =
    plan.preservePublic.length + plan.preserveShared.length;
  const blockedCount = plan.blocked.length;

  const validation = validateStoragePlanForExecution(plan);
  if (validation.ok === false) {
    return {
      success: false,
      result:
        validation.code === "blocked_plan" ||
        validation.code === "journey_inventory_incomplete"
          ? "blocked"
          : "refused",
      deletedConfirmedCount: 0,
      operationSucceededNotConfirmedCount: 0,
      preservedCount,
      failedCount: 0,
      blockedCount,
      avatarBlockedCount: 0,
      failures: [],
      audit: buildStorageCleanupAuditMetadata({
        plan,
        actorUserId: options.actorUserId ?? null,
        result:
          validation.code === "blocked_plan" ||
          validation.code === "journey_inventory_incomplete"
            ? "blocked"
            : "refused",
        deletedConfirmedCount: 0,
        operationSucceededNotConfirmedCount: 0,
        preservedCount,
        failedCount: 0,
        blockedCount,
        avatarBlockedCount: 0,
      }),
    };
  }

  const avatarGate = await verifyAvatarEntriesForDeletion({ plan, deps });
  if (avatarGate.ok === false) {
    return {
      ...avatarGate.result,
      audit: buildStorageCleanupAuditMetadata({
        plan,
        actorUserId: options.actorUserId ?? null,
        result: "refused",
        deletedConfirmedCount: 0,
        operationSucceededNotConfirmedCount: 0,
        preservedCount,
        failedCount: 0,
        blockedCount,
        avatarBlockedCount: avatarGate.result.avatarBlockedCount,
      }),
    };
  }

  let deletedConfirmedCount = 0;
  let operationSucceededNotConfirmedCount = 0;
  let failedCount = 0;
  const failures: AccountDeletionStorageRemovalFailure[] = [];

  const deletePathsByBucket = new Map<string, string[]>();
  for (const entry of plan.delete) {
    const existing = deletePathsByBucket.get(entry.bucket) ?? [];
    if (!existing.includes(entry.path)) {
      existing.push(entry.path);
    }
    deletePathsByBucket.set(entry.bucket, existing);
  }

  for (const [bucket, paths] of deletePathsByBucket.entries()) {
    if (!isApprovedAccountDeletionDeleteBucket(bucket)) {
      for (const path of paths) {
        failedCount += 1;
        failures.push({
          bucket,
          pathFingerprint: fingerprintStoragePath(path),
          code: "not_deletable",
        });
      }
      continue;
    }

    for (const batch of chunkPaths(paths, batchSize)) {
      const rawRemoval = await deps.removeObjects(bucket, batch);
      const removal = normalizeRemoveResult(bucket, batch, rawRemoval);

      if (removal.error) {
        for (const path of batch) {
          failedCount += 1;
          failures.push({
            bucket,
            pathFingerprint: fingerprintStoragePath(path),
            code: "remove_failed",
          });
        }
        continue;
      }

      for (const outcome of removal.outcomes) {
        switch (outcome.outcome) {
          case "deleted_confirmed":
            deletedConfirmedCount += 1;
            break;
          case "operation_succeeded_not_confirmed":
            operationSucceededNotConfirmedCount += 1;
            break;
          case "failed":
            failedCount += 1;
            failures.push({
              bucket,
              pathFingerprint: fingerprintStoragePath(outcome.path),
              code: "remove_failed",
            });
            break;
          default:
            failedCount += 1;
            failures.push({
              bucket,
              pathFingerprint: fingerprintStoragePath(outcome.path),
              code: "remove_failed",
            });
        }
      }
    }
  }

  const success = failedCount === 0;
  const result: AccountDeletionStorageExecutionResult["result"] = success
    ? "success"
    : "partial_failure";

  return {
    success,
    result,
    deletedConfirmedCount,
    operationSucceededNotConfirmedCount,
    preservedCount,
    failedCount,
    blockedCount,
    avatarBlockedCount: 0,
    failures,
    audit: buildStorageCleanupAuditMetadata({
      plan,
      actorUserId: options.actorUserId ?? null,
      result,
      deletedConfirmedCount,
      operationSucceededNotConfirmedCount,
      preservedCount,
      failedCount,
      blockedCount,
      avatarBlockedCount: 0,
    }),
  };
}

export function classifyExecutionResultEntry(
  classification: AccountDeletionStorageClassification
): AccountDeletionStorageRemovalResultCode {
  switch (classification) {
    case "DELETE_PRIVATE":
      return "deleted_confirmed";
    case "PRESERVE_PUBLIC":
    case "PRESERVE_SHARED":
      return "preserved";
    case "BLOCK_UNRESOLVED":
      return "blocked";
    default:
      return "blocked";
  }
}

export function mapRemovalOutcomeToLegacyCount(outcome: AccountDeletionStorageRemovePathOutcome): {
  deleted?: number;
  alreadyAbsent?: number;
  failed?: number;
} {
  switch (outcome) {
    case "deleted_confirmed":
      return { deleted: 1 };
    case "operation_succeeded_not_confirmed":
      return { alreadyAbsent: 1 };
    case "failed":
      return { failed: 1 };
    default:
      return { failed: 1 };
  }
}

export function sanitizeStorageExecutorFailureForClient(
  result: AccountDeletionStorageExecutionResult
) {
  return {
    success: result.success,
    result: result.result,
    deletedConfirmedCount: result.deletedConfirmedCount,
    operationSucceededNotConfirmedCount:
      result.operationSucceededNotConfirmedCount,
    preservedCount: result.preservedCount,
    failedCount: result.failedCount,
    blockedCount: result.blockedCount,
    avatarBlockedCount: result.avatarBlockedCount,
    failures: result.failures.map((failure) => ({
      bucket: failure.bucket,
      pathFingerprint: failure.pathFingerprint,
      code: failure.code,
    })),
  };
}

export { sanitizeRemovalErrorMessage };
