import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_DELETION_STATUS,
  isLegacyAdministrativeClosureStatus,
  normalizeLegacyDeletionStatus,
  resolveDeletionRequestTargetUserId,
} from "../accountCenter/accountDeletionLifecycle";
import {
  buildAccountDeletionDryRunManifest,
  type AccountDeletionDryRunDeps,
  type AccountDeletionDryRunResult,
  type AccountDeletionManifest,
} from "./accountDeletionManifest";
import {
  BLOCKED_ADMIN_ACCOUNT_CODE,
  BLOCKED_OWNER_ACCOUNT_CODE,
  type AccountDeletionExecutionErrorCode,
  type AccountDeletionExecutionStage,
  type AccountDeletionExecutionStageStatus,
  buildAccountDeletionExecutionAuditEvent,
  isAccountDeletionExecutionEnabled,
} from "./accountDeletionExecutionPolicy";

export type AccountDeletionExecutionRequestRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  status: string | null;
  target_user_id_snapshot: string | null;
  execution_started_at: string | null;
};

export type AccountDeletionExecutionProfileRow = {
  id: string;
  is_owner: boolean;
  is_admin: boolean;
};

export type AccountDeletionExecutionLockResult =
  | { ok: true; request: AccountDeletionExecutionRequestRow }
  | {
      ok: false;
      code: "execution_in_progress" | "request_not_approved" | "already_deleted";
      request: AccountDeletionExecutionRequestRow | null;
    };

export type AccountDeletionExecutionDeps = {
  isExecutionEnabled: () => boolean;
  verifyAdmin: (accessToken: string) => Promise<boolean>;
  verifyAdminAal2: (
    accessToken: string
  ) => Promise<
    | { ok: true }
    | { ok: false; code: "mfa_step_up_required" | "auth_error" }
  >;
  loadDeletionRequest: (
    requestId: string
  ) => Promise<AccountDeletionExecutionRequestRow | null>;
  loadProfile: (
    userId: string
  ) => Promise<AccountDeletionExecutionProfileRow | null>;
  buildManifest: (
    requestId: string
  ) => Promise<AccountDeletionDryRunResult>;
  tryAcquireExecutionLock: (
    requestId: string
  ) => Promise<AccountDeletionExecutionLockResult>;
  writeAuditEvent?: (event: ReturnType<typeof buildAccountDeletionExecutionAuditEvent>) => Promise<void>;
};

export type AccountDeletionExecutionStageRecord = {
  stage: AccountDeletionExecutionStage;
  status: AccountDeletionExecutionStageStatus;
};

export type AccountDeletionExecutionEligibility =
  | {
      ok: true;
      request: AccountDeletionExecutionRequestRow;
      targetUserId: string;
      normalizedStatus: string;
    }
  | {
      ok: false;
      code: AccountDeletionExecutionErrorCode;
      request?: AccountDeletionExecutionRequestRow | null;
    };

export type AccountDeletionExecutionPrepareResult =
  | {
      ok: true;
      requestId: string;
      targetUserId: string;
      requestStatus: string | null;
      stages: AccountDeletionExecutionStageRecord[];
      manifestSummary: {
        blocked: boolean;
        blockCode: string | null;
        warningCount: number;
      };
      auditPreview: ReturnType<typeof buildAccountDeletionExecutionAuditEvent>;
      destructiveStages: AccountDeletionExecutionStageRecord[];
    }
  | {
      ok: false;
      code: AccountDeletionExecutionErrorCode;
      stages: AccountDeletionExecutionStageRecord[];
      request?: AccountDeletionExecutionRequestRow | null;
    };

const DESTRUCTIVE_STAGES: AccountDeletionExecutionStage[] = [
  "acquire_lock",
  "cleanup_storage",
  "mutate_database",
  "revoke_sessions",
  "delete_auth_user",
  "finalize_deleted",
];

const EXECUTION_REQUEST_COLUMNS =
  "id, user_id, email, status, target_user_id_snapshot, execution_started_at";

function stageRecord(
  stage: AccountDeletionExecutionStage,
  status: AccountDeletionExecutionStageStatus
): AccountDeletionExecutionStageRecord {
  return { stage, status };
}

export function validateExecutionEligibility(
  request: AccountDeletionExecutionRequestRow | null
): AccountDeletionExecutionEligibility {
  if (!request) {
    return { ok: false, code: "request_not_found", request: null };
  }

  const normalized = normalizeLegacyDeletionStatus(request.status);

  if (!normalized) {
    return { ok: false, code: "request_not_approved", request };
  }

  if (normalized === ACCOUNT_DELETION_STATUS.DELETED) {
    return { ok: false, code: "already_deleted", request };
  }

  if (normalized === ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS) {
    return { ok: false, code: "execution_in_progress", request };
  }

  if (
    normalized === ACCOUNT_DELETION_STATUS.FAILED ||
    isLegacyAdministrativeClosureStatus(request.status) ||
    normalized === ACCOUNT_DELETION_STATUS.REJECTED ||
    normalized === ACCOUNT_DELETION_STATUS.CANCELLED ||
    normalized === ACCOUNT_DELETION_STATUS.SUBMITTED ||
    normalized === ACCOUNT_DELETION_STATUS.REVIEWING
  ) {
    return { ok: false, code: "request_not_approved", request };
  }

  if (normalized !== ACCOUNT_DELETION_STATUS.APPROVED) {
    return { ok: false, code: "request_not_approved", request };
  }

  const targetUserId = resolveDeletionRequestTargetUserId({
    user_id: request.user_id,
    target_user_id_snapshot: request.target_user_id_snapshot,
  });

  if (!targetUserId) {
    return { ok: false, code: "target_not_found", request };
  }

  return {
    ok: true,
    request,
    targetUserId,
    normalizedStatus: normalized,
  };
}

export function validatePrivilegedTarget(
  profile: AccountDeletionExecutionProfileRow | null
):
  | { ok: true }
  | { ok: false; code: "blocked_owner" | "blocked_admin" } {
  if (profile?.is_owner) {
    return { ok: false, code: "blocked_owner" };
  }

  if (profile?.is_admin) {
    return { ok: false, code: "blocked_admin" };
  }

  return { ok: true };
}

export function validateManifestForExecution(
  manifestResult: AccountDeletionDryRunResult
):
  | { ok: true; manifest: AccountDeletionManifest }
  | { ok: false; code: "manifest_failed" | "manifest_blocked" } {
  if (manifestResult.ok === false) {
    return { ok: false, code: "manifest_failed" };
  }

  if (manifestResult.manifest.blocked) {
    return { ok: false, code: "manifest_blocked" };
  }

  if (
    manifestResult.manifest.blockCode === BLOCKED_OWNER_ACCOUNT_CODE ||
    manifestResult.manifest.blockCode === BLOCKED_ADMIN_ACCOUNT_CODE
  ) {
    return { ok: false, code: "manifest_blocked" };
  }

  return { ok: true, manifest: manifestResult.manifest };
}

export async function prepareAccountDeletionExecution(options: {
  requestId: string;
  actorUserId: string;
  deps: AccountDeletionExecutionDeps;
}): Promise<AccountDeletionExecutionPrepareResult> {
  const stages: AccountDeletionExecutionStageRecord[] = [
    stageRecord("load_request", "pending"),
    stageRecord("verify_status", "pending"),
    stageRecord("verify_target", "pending"),
    stageRecord("verify_target_not_privileged", "pending"),
    stageRecord("build_manifest", "pending"),
    stageRecord("validate_manifest", "pending"),
    stageRecord("prepare_execution", "pending"),
  ];

  const request = await options.deps.loadDeletionRequest(options.requestId);
  stages[0] = stageRecord("load_request", "completed");

  const eligibility = validateExecutionEligibility(request);
  stages[1] = stageRecord(
    "verify_status",
    eligibility.ok ? "completed" : "skipped"
  );

  if (eligibility.ok === false) {
    return {
      ok: false,
      code: eligibility.code,
      stages,
      request: eligibility.request ?? request,
    };
  }

  stages[2] = stageRecord("verify_target", "completed");

  const profile = await options.deps.loadProfile(eligibility.targetUserId);
  const privileged = validatePrivilegedTarget(profile);
  stages[3] = stageRecord(
    "verify_target_not_privileged",
    privileged.ok ? "completed" : "skipped"
  );

  if (privileged.ok === false) {
    return {
      ok: false,
      code: privileged.code,
      stages,
      request: eligibility.request,
    };
  }

  const manifestResult = await options.deps.buildManifest(options.requestId);
  stages[4] = stageRecord(
    "build_manifest",
    manifestResult.ok ? "completed" : "skipped"
  );

  const manifestValidation = validateManifestForExecution(manifestResult);
  stages[5] = stageRecord(
    "validate_manifest",
    manifestValidation.ok ? "completed" : "skipped"
  );

  if (manifestValidation.ok === false) {
    return {
      ok: false,
      code: manifestValidation.code,
      stages,
      request: eligibility.request,
    };
  }

  stages[6] = stageRecord("prepare_execution", "completed");

  const auditPreview = buildAccountDeletionExecutionAuditEvent({
    actorUserId: options.actorUserId,
    targetUserId: eligibility.targetUserId,
    requestId: options.requestId,
    result: "prepared_not_executed",
    requestStatus: eligibility.request.status,
    stageReached: "prepare_execution",
  });

  return {
    ok: true,
    requestId: options.requestId,
    targetUserId: eligibility.targetUserId,
    requestStatus: eligibility.request.status,
    stages,
    manifestSummary: {
      blocked: manifestValidation.manifest.blocked,
      blockCode: manifestValidation.manifest.blockCode,
      warningCount: manifestValidation.manifest.warnings.length,
    },
    auditPreview,
    destructiveStages: DESTRUCTIVE_STAGES.map((stage) =>
      stageRecord(stage, "NOT_IMPLEMENTED")
    ),
  };
}

export async function acquireExecutionLock(
  requestId: string,
  deps: Pick<AccountDeletionExecutionDeps, "tryAcquireExecutionLock">
): Promise<AccountDeletionExecutionLockResult> {
  return deps.tryAcquireExecutionLock(requestId);
}

export function createDefaultExecutionLockUpdater(
  serviceRoleClient: SupabaseClient
) {
  return async function tryAcquireExecutionLock(
    requestId: string
  ): Promise<AccountDeletionExecutionLockResult> {
    const { data, error } = await serviceRoleClient
      .from("account_deletion_requests")
      .update({
        status: ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
        execution_started_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", ACCOUNT_DELETION_STATUS.APPROVED)
      .select(EXECUTION_REQUEST_COLUMNS)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return { ok: true, request: data as AccountDeletionExecutionRequestRow };
    }

    const { data: current } = await serviceRoleClient
      .from("account_deletion_requests")
      .select(EXECUTION_REQUEST_COLUMNS)
      .eq("id", requestId)
      .maybeSingle();

    const row = current as AccountDeletionExecutionRequestRow | null;
    const normalized = normalizeLegacyDeletionStatus(row?.status ?? null);

    if (normalized === ACCOUNT_DELETION_STATUS.DELETED) {
      return { ok: false, code: "already_deleted", request: row };
    }

    if (normalized === ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS) {
      return { ok: false, code: "execution_in_progress", request: row };
    }

    return { ok: false, code: "request_not_approved", request: row };
  };
}

export function createAccountDeletionExecutionDeps(options: {
  serviceRoleClient: SupabaseClient;
  verifyAdmin: (accessToken: string) => Promise<boolean>;
  verifyAdminAal2: (
    accessToken: string
  ) => Promise<
    | { ok: true }
    | { ok: false; code: "mfa_step_up_required" | "auth_error" }
  >;
  buildManifestDeps: AccountDeletionDryRunDeps;
}): AccountDeletionExecutionDeps {
  const { serviceRoleClient, verifyAdmin, verifyAdminAal2, buildManifestDeps } =
    options;

  return {
    isExecutionEnabled: () => isAccountDeletionExecutionEnabled(),
    verifyAdmin,
    verifyAdminAal2,
    async loadDeletionRequest(requestId) {
      const { data, error } = await serviceRoleClient
        .from("account_deletion_requests")
        .select(EXECUTION_REQUEST_COLUMNS)
        .eq("id", requestId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as AccountDeletionExecutionRequestRow;
    },
    async loadProfile(userId) {
      const { data, error } = await serviceRoleClient
        .from("profiles")
        .select("id, is_owner, is_admin")
        .eq("id", userId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as AccountDeletionExecutionProfileRow;
    },
    async buildManifest(requestId) {
      return buildAccountDeletionDryRunManifest(requestId, buildManifestDeps);
    },
    tryAcquireExecutionLock: createDefaultExecutionLockUpdater(serviceRoleClient),
  };
}

export async function verifyAdminAal2ForAccountDeletionExecution(
  accessToken: string
): Promise<
  | { ok: true }
  | { ok: false; code: "mfa_step_up_required" | "auth_error" }
> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, code: "auth_error" };
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const { data, error } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error || !data) {
    return { ok: false, code: "auth_error" };
  }

  if (data.currentLevel !== "aal2") {
    return { ok: false, code: "mfa_step_up_required" };
  }

  return { ok: true };
}

export const ACCOUNT_DELETION_EXECUTION_LOCK_DESIGN_NOTE =
  "Atomic lock uses conditional UPDATE ... WHERE id = ? AND status = 'approved' RETURNING *. Zero rows updated triggers re-read for idempotent in_progress/deleted handling. A SECURITY DEFINER RPC is optional later but not required for single-row compare-and-set.";
