import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAccountDeletionProfileMediaObjectExecutorDeps,
  executeAccountDeletionProfileMediaObject,
  type AccountDeletionProfileMediaObjectExecutorResult,
} from "./accountDeletionProfileMediaObjectExecutor";
import {
  isAccountDeletionPhysicalProfileMediaExecutionEnabled,
  parseAccountDeletionProfileMediaProgress,
  type AccountDeletionProfileMediaProgress,
} from "./accountDeletionProfileMediaPolicy";
import {
  ACCOUNT_DELETION_PROFILE_MEDIA_STAGE_RUNNER_BATCH_SIZE,
  clampProfileMediaRunnerBatchSize,
  disabledCodeFromExecutorResult,
  isValidAccountDeletionUuid,
  mapProfileMediaStatusFromProgress,
  parseAccountDeletionProfileMediaSelectorResult,
  parseAccountDeletionReadinessProbe,
  profileMediaExecutionDisabledCode,
  profileMediaProgressHasInflightWork,
  shouldContinueProfileMediaExecutorResult,
  tickOkForCode,
  toProfileMediaProgressSummary,
  type AccountDeletionProfileMediaStageTickCode,
  type AccountDeletionProfileMediaStageTickResult,
} from "./accountDeletionProfileMediaStageRunnerPolicy";

export type AccountDeletionProfileMediaStageTickInput = {
  requestId: string;
  attemptId: string;
};

export type AccountDeletionProfileMediaStageRunnerDeps = {
  serviceRoleClient: SupabaseClient;
  verifyRunnerReadiness: () => Promise<boolean>;
  isPhysicalProfileMediaExecutionEnabled?: () => boolean;
  executeProfileMediaObject?: (
    input: AccountDeletionProfileMediaStageTickInput & { resultId: string }
  ) => Promise<AccountDeletionProfileMediaObjectExecutorResult>;
  /** Test seam only; clamped to <= 5 in policy. */
  batchSize?: number;
};

export async function verifyAccountDeletionProfileMediaStageRunnerReadiness(
  client: SupabaseClient
): Promise<boolean> {
  const { data, error } = await client.rpc(
    "verify_account_deletion_profile_media_runner_ready"
  );
  if (error) {
    return false;
  }
  return parseAccountDeletionReadinessProbe(data);
}

export function createAccountDeletionProfileMediaStageRunnerDeps(
  serviceRoleClient: SupabaseClient,
  options?: { batchSize?: number }
): AccountDeletionProfileMediaStageRunnerDeps {
  return {
    serviceRoleClient,
    verifyRunnerReadiness: () =>
      verifyAccountDeletionProfileMediaStageRunnerReadiness(serviceRoleClient),
    batchSize: options?.batchSize,
  };
}

function fail(
  code: AccountDeletionProfileMediaStageTickCode,
  progress?: AccountDeletionProfileMediaProgress
): AccountDeletionProfileMediaStageTickResult {
  return {
    ok: tickOkForCode(code),
    code,
    ...(progress ? { progress: toProfileMediaProgressSummary(progress) } : {}),
  };
}

async function loadAttemptContext(
  client: SupabaseClient,
  requestId: string,
  attemptId: string
): Promise<{ ok: true } | { ok: false }> {
  const { data: attemptRow, error: attemptError } = await client
    .from("account_deletion_execution_attempts")
    .select(
      "id, deletion_request_id, target_user_id, status, stage, storage_manifest_status"
    )
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError || !attemptRow) {
    return { ok: false };
  }
  if (attemptRow.deletion_request_id !== requestId) {
    return { ok: false };
  }

  const { data: requestRow, error: requestError } = await client
    .from("account_deletion_requests")
    .select("id, status, user_id")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError || !requestRow) {
    return { ok: false };
  }
  if (requestRow.status !== "deletion_in_progress") {
    return { ok: false };
  }
  if (requestRow.user_id !== attemptRow.target_user_id) {
    return { ok: false };
  }
  if (attemptRow.status !== "active") {
    return { ok: false };
  }
  if (attemptRow.stage !== "profile") {
    return { ok: false };
  }
  if (attemptRow.storage_manifest_status !== "finalized") {
    return { ok: false };
  }

  return { ok: true };
}

async function readProfileMediaProgress(
  client: SupabaseClient,
  requestId: string,
  attemptId: string
): Promise<AccountDeletionProfileMediaProgress | null> {
  const { data, error } = await client.rpc(
    "account_deletion_profile_media_progress_snapshot",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    }
  );
  if (error) {
    return null;
  }
  return parseAccountDeletionProfileMediaProgress(data);
}

export async function runAccountDeletionProfileMediaTick(options: {
  requestId: string;
  attemptId: string;
  deps: AccountDeletionProfileMediaStageRunnerDeps;
}): Promise<AccountDeletionProfileMediaStageTickResult> {
  const { requestId, attemptId, deps } = options;
  const client = deps.serviceRoleClient;
  const batchSize = clampProfileMediaRunnerBatchSize(deps.batchSize);
  const physicalEnabled = (
    deps.isPhysicalProfileMediaExecutionEnabled ??
    isAccountDeletionPhysicalProfileMediaExecutionEnabled
  )();
  const executeProfileMediaObject =
    deps.executeProfileMediaObject ??
    ((input) =>
      executeAccountDeletionProfileMediaObject(
        input,
        createAccountDeletionProfileMediaObjectExecutorDeps(client)
      ));

  if (
    !isValidAccountDeletionUuid(requestId) ||
    !isValidAccountDeletionUuid(attemptId)
  ) {
    return { ok: false, code: "precondition_failed" };
  }

  if (!(await deps.verifyRunnerReadiness())) {
    return { ok: false, code: "precondition_failed" };
  }

  const context = await loadAttemptContext(client, requestId, attemptId);
  if (!context.ok) {
    return { ok: false, code: "precondition_failed" };
  }

  const initialProgress = await readProfileMediaProgress(
    client,
    requestId,
    attemptId
  );
  if (!initialProgress) {
    return { ok: false, code: "precondition_failed" };
  }

  const initialCode = mapProfileMediaStatusFromProgress(initialProgress);
  if (initialCode === "profile_media_completed") {
    return fail(initialCode, initialProgress);
  }
  if (
    initialCode === "profile_media_precondition_failed" ||
    initialCode === "profile_media_blocked"
  ) {
    return fail(initialCode, initialProgress);
  }

  if (
    initialProgress.actionableCount === 0 &&
    initialProgress.deleting > 0
  ) {
    return fail("profile_media_in_progress", initialProgress);
  }

  if (
    initialProgress.actionableCount === 0 &&
    profileMediaProgressHasInflightWork(initialProgress)
  ) {
    return fail("profile_media_in_progress", initialProgress);
  }

  if (initialProgress.actionableCount > 0) {
    if (!physicalEnabled) {
      const disabled =
        profileMediaExecutionDisabledCode() ?? "execution_disabled";
      return fail(disabled, initialProgress);
    }
  } else {
    return fail(initialCode, initialProgress);
  }

  const { data: selectorData, error: selectorError } = await client.rpc(
    "select_account_deletion_profile_media_actionable_result_ids",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
      p_limit: ACCOUNT_DELETION_PROFILE_MEDIA_STAGE_RUNNER_BATCH_SIZE,
    }
  );
  if (selectorError) {
    return { ok: false, code: "precondition_failed" };
  }
  if (
    typeof selectorData === "object" &&
    selectorData !== null &&
    (selectorData as { ok?: unknown }).ok === false
  ) {
    return { ok: false, code: "precondition_failed" };
  }

  const parsedSelector =
    parseAccountDeletionProfileMediaSelectorResult(selectorData);
  if (!parsedSelector.ok) {
    return { ok: false, code: "precondition_failed" };
  }

  const selectedIds = parsedSelector.resultIds.slice(0, batchSize);
  let processedCount = 0;
  let batchStopCode: AccountDeletionProfileMediaStageTickCode | null = null;

  for (const resultId of selectedIds) {
    let executorResult: AccountDeletionProfileMediaObjectExecutorResult;
    try {
      executorResult = await executeProfileMediaObject({
        requestId,
        attemptId,
        resultId,
      });
    } catch {
      batchStopCode = "profile_media_in_progress";
      break;
    }

    processedCount += 1;

    const disabledFromExecutor = disabledCodeFromExecutorResult(executorResult);
    if (disabledFromExecutor) {
      batchStopCode = disabledFromExecutor;
      break;
    }

    if (
      executorResult.ok === false &&
      (executorResult.code === "claim_failed" ||
        executorResult.code === "authorize_failed") &&
      typeof executorResult.detail === "string" &&
      executorResult.detail === "profile_media_reference_active"
    ) {
      batchStopCode = "profile_media_blocked";
      break;
    }

    if (!shouldContinueProfileMediaExecutorResult(executorResult)) {
      batchStopCode = "profile_media_in_progress";
      break;
    }
  }

  const finalProgress = await readProfileMediaProgress(
    client,
    requestId,
    attemptId
  );
  if (!finalProgress) {
    return { ok: false, code: "precondition_failed" };
  }

  const finalCode = mapProfileMediaStatusFromProgress(finalProgress);
  if (finalCode === "profile_media_completed") {
    return {
      ok: true,
      code: "profile_media_completed",
      progress: toProfileMediaProgressSummary(finalProgress),
      selectedCount: selectedIds.length,
      processedCount,
    };
  }

  if (batchStopCode && tickOkForCode(batchStopCode) === false) {
    return {
      ok: false,
      code: batchStopCode,
      progress: toProfileMediaProgressSummary(finalProgress),
      selectedCount: selectedIds.length,
      processedCount,
    };
  }

  return {
    ok: tickOkForCode(finalCode),
    code: finalCode,
    progress: toProfileMediaProgressSummary(finalProgress),
    selectedCount: selectedIds.length,
    processedCount,
  };
}
