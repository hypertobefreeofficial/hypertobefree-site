/**
 * One-tick Storage stage runner (Phase 4C.7B.1E.2C.3B.3F.1). Server-only; not wired to routes/cron.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAccountDeletionStorageObjectExecutorDeps,
  executeAccountDeletionStorageObject,
  type AccountDeletionStorageObjectExecutorResult,
} from "./accountDeletionStorageObjectExecutor";
import { isAccountDeletionPhysicalStorageExecutionEnabled } from "./accountDeletionStorageExecutionPolicy";
import {
  ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE,
  parseStorageProgressCounts,
  storageProgressHasActionableDeleteWork,
  storageProgressHasHardBlockers,
  storageProgressHasInProgressWork,
  type AccountDeletionStorageProgressCounts,
  type AccountDeletionStorageStageTickCode,
} from "./accountDeletionStorageStageRunnerPolicy";

export type AccountDeletionStorageStageTickInput = {
  requestId: string;
  attemptId: string;
};

export type AccountDeletionStorageStageTickResult = {
  ok: boolean;
  code: AccountDeletionStorageStageTickCode;
  stage?: string;
  counts?: AccountDeletionStorageProgressCounts;
  processedResultIds?: string[];
};

export type AccountDeletionStorageStageRunnerDeps = {
  serviceRoleClient: SupabaseClient;
  verifyRunnerReadiness: () => Promise<boolean>;
  isPhysicalStorageExecutionEnabled?: () => boolean;
  executeStorageObject?: (
    input: AccountDeletionStorageStageTickInput & { resultId: string }
  ) => Promise<AccountDeletionStorageObjectExecutorResult>;
  batchSize?: number;
};

type RpcPayload = Record<string, unknown>;

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function asPayload(data: unknown): RpcPayload {
  return (data ?? {}) as RpcPayload;
}

async function rpc(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<RpcPayload> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    return { ok: false, code: "rpc_error" };
  }
  return asPayload(data);
}

async function loadAttemptContext(
  client: SupabaseClient,
  requestId: string,
  attemptId: string
): Promise<
  | {
      ok: true;
      stage: string;
      requestStatus: string;
      attemptStatus: string;
      manifestStatus: string | null;
    }
  | { ok: false; code: string }
> {
  const { data: attempt, error: attemptError } = await client
    .from("account_deletion_execution_attempts")
    .select(
      "id, deletion_request_id, status, stage, storage_manifest_status, target_user_id"
    )
    .eq("id", attemptId)
    .maybeSingle();

  if (attemptError || !attempt) {
    return { ok: false, code: "attempt_not_found" };
  }

  if (attempt.deletion_request_id !== requestId) {
    return { ok: false, code: "attempt_mismatch" };
  }

  const { data: request, error: requestError } = await client
    .from("account_deletion_requests")
    .select("id, status, user_id")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) {
    return { ok: false, code: "request_not_found" };
  }

  if (request.user_id !== attempt.target_user_id) {
    return { ok: false, code: "target_mismatch" };
  }

  return {
    ok: true,
    stage: String(attempt.stage ?? ""),
    requestStatus: String(request.status ?? ""),
    attemptStatus: String(attempt.status ?? ""),
    manifestStatus:
      attempt.storage_manifest_status == null
        ? null
        : String(attempt.storage_manifest_status),
  };
}

async function readProgressSnapshot(
  client: SupabaseClient,
  requestId: string,
  attemptId: string
): Promise<AccountDeletionStorageProgressCounts | null> {
  const payload = await rpc(
    client,
    "account_deletion_storage_execution_progress_snapshot",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    }
  );
  if (payload.ok !== true) {
    return null;
  }
  return parseStorageProgressCounts(
    asPayload(payload.counts) as Record<string, unknown>
  );
}

async function selectActionableDeletePrivateResults(
  client: SupabaseClient,
  attemptId: string,
  limit: number
): Promise<string[]> {
  const { data, error } = await client
    .from("account_deletion_storage_execution_results")
    .select("id, object_path")
    .eq("execution_attempt_id", attemptId)
    .eq("disposition_snapshot", "DELETE_PRIVATE")
    .in("execution_state", ["pending", "failed_retryable"])
    .order("object_path", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((row) => String(row.id));
}

export async function runAccountDeletionStorageStageTick(options: {
  requestId: string;
  attemptId: string;
  deps: AccountDeletionStorageStageRunnerDeps;
}): Promise<AccountDeletionStorageStageTickResult> {
  const { requestId, attemptId, deps } = options;
  const client = deps.serviceRoleClient;
  const batchSize =
    deps.batchSize ?? ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE;
  const physicalEnabled = (
    deps.isPhysicalStorageExecutionEnabled ??
    isAccountDeletionPhysicalStorageExecutionEnabled
  )();
  const executeObject =
    deps.executeStorageObject ??
    ((input) =>
      executeAccountDeletionStorageObject(
        input,
        createAccountDeletionStorageObjectExecutorDeps(client)
      ));

  if (!isValidUuid(requestId) || !isValidUuid(attemptId)) {
    return { ok: false, code: "precondition_failed" };
  }

  if (!(await deps.verifyRunnerReadiness())) {
    return { ok: false, code: "precondition_failed" };
  }

  const context = await loadAttemptContext(client, requestId, attemptId);
  if (context.ok === false) {
    return { ok: false, code: "precondition_failed" };
  }

  if (
    context.requestStatus !== "deletion_in_progress" ||
    context.attemptStatus !== "active" ||
    context.manifestStatus !== "finalized"
  ) {
    return { ok: false, code: "precondition_failed" };
  }

  const allowedStages = new Set([
    "database_completed",
    "storage",
    "storage_completed",
  ]);
  if (!allowedStages.has(context.stage)) {
    return { ok: false, code: "precondition_failed" };
  }

  if (context.stage === "storage_completed") {
    return { ok: true, code: "already_completed", stage: context.stage };
  }

  await rpc(client, "account_deletion_storage_execution_refresh_hold_eligibility", {
    p_request_id: requestId,
    p_attempt_id: attemptId,
  });

  if (context.stage === "database_completed") {
    const init = await rpc(
      client,
      "initialize_account_deletion_storage_execution_results",
      {
        p_request_id: requestId,
        p_attempt_id: attemptId,
      }
    );
    if (init.ok !== true && init.code !== "initialized") {
      return { ok: false, code: "precondition_failed" };
    }

    const advanced = await rpc(
      client,
      "advance_account_deletion_attempt_to_storage",
      {
        p_request_id: requestId,
        p_attempt_id: attemptId,
      }
    );
    if (
      advanced.ok !== true &&
      advanced.code !== "already_storage" &&
      advanced.code !== "advanced"
    ) {
      return { ok: false, code: "precondition_failed" };
    }
  }

  let counts = await readProgressSnapshot(client, requestId, attemptId);
  if (!counts) {
    return { ok: false, code: "precondition_failed" };
  }

  if (storageProgressHasHardBlockers(counts)) {
    return { ok: false, code: "blocked", counts };
  }

  if (
    !physicalEnabled &&
    storageProgressHasActionableDeleteWork(counts)
  ) {
    return { ok: false, code: "disabled", counts };
  }

  const processedResultIds: string[] = [];

  if (physicalEnabled) {
    const resultIds = await selectActionableDeletePrivateResults(
      client,
      attemptId,
      batchSize
    );
    for (const resultId of resultIds) {
      await executeObject({ requestId, attemptId, resultId });
      processedResultIds.push(resultId);
    }
  }

  counts = (await readProgressSnapshot(client, requestId, attemptId)) ?? counts;

  if (storageProgressHasHardBlockers(counts)) {
    return {
      ok: false,
      code: "blocked",
      counts,
      processedResultIds,
    };
  }

  if (storageProgressHasInProgressWork(counts)) {
    return {
      ok: true,
      code: "in_progress",
      counts,
      processedResultIds,
    };
  }

  if (
    !physicalEnabled &&
    storageProgressHasActionableDeleteWork(counts)
  ) {
    return { ok: false, code: "disabled", counts, processedResultIds };
  }

  const complete = await rpc(
    client,
    "advance_account_deletion_attempt_to_storage_completed",
    {
      p_request_id: requestId,
      p_attempt_id: attemptId,
    }
  );

  if (complete.ok === true) {
    return {
      ok: true,
      code: "storage_completed",
      stage: String(complete.stage ?? "storage_completed"),
      counts,
      processedResultIds,
    };
  }

  if (storageProgressHasInProgressWork(counts)) {
    return {
      ok: true,
      code: "in_progress",
      counts,
      processedResultIds,
    };
  }

  return { ok: false, code: "blocked", counts, processedResultIds };
}

export {
  ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE,
  ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_NOTE,
} from "./accountDeletionStorageStageRunnerPolicy";
