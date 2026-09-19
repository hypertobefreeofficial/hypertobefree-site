import { createClient } from "@supabase/supabase-js";
import { authenticateSupabaseRequest } from "./authenticateSupabaseRequest";
import { verifyAdminForAccountDeletionDryRun } from "./accountDeletionManifest";
import {
  httpStatusForAccountDeletionOrchestrationError,
  isAccountDeletionExecutionEnabled,
  sanitizeAccountDeletionOrchestrationErrorMessage,
  type AccountDeletionExecutionOrchestrationHttpCode,
} from "./accountDeletionExecutionPolicy";
import { verifyAdminAal2ForAccountDeletionExecution } from "./accountDeletionExecutor";
import { verifyOwnerForAccountDeletionExecution } from "./accountDeletionOwnerAuthorization";
import {
  createAccountDeletionExecutionOrchestratorDeps,
  runAccountDeletionExecutionOrchestrator,
  type AccountDeletionExecutionOrchestratorFailureCode,
  type AccountDeletionExecutionOrchestratorResult,
} from "./accountDeletionExecutionOrchestrator";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
} from "./prayerRateLimit";

export type AccountDeletionExecuteHandlerResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: unknown };

function orchestrationErrorBody(code: AccountDeletionExecutionOrchestrationHttpCode) {
  return {
    ok: false,
    code,
    error: sanitizeAccountDeletionOrchestrationErrorMessage(code),
  };
}

function mapOrchestratorFailureCode(
  code: AccountDeletionExecutionOrchestratorFailureCode
): AccountDeletionExecutionOrchestrationHttpCode {
  return code;
}

function mapOrchestratorResultToHandler(
  result: AccountDeletionExecutionOrchestratorResult
): AccountDeletionExecuteHandlerResult {
  if (result.ok === false) {
    const code = mapOrchestratorFailureCode(result.code);
    return {
      ok: false,
      status: httpStatusForAccountDeletionOrchestrationError(code),
      body: orchestrationErrorBody(code),
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      code: result.code,
      requestId: result.requestId,
      attemptId: result.attemptId,
      error: sanitizeAccountDeletionOrchestrationErrorMessage(result.code),
    },
  };
}

export function rejectExecutionIdentityFromRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.searchParams.has("userId") || url.searchParams.has("user_id")) {
    return true;
  }

  return false;
}

const FORBIDDEN_EXECUTION_BODY_KEYS = new Set([
  "userId",
  "user_id",
  "email",
  "username",
  "targetUserId",
  "target_user_id",
  "attemptId",
  "attempt_id",
  "initiatedBy",
  "initiated_by",
  "manifest",
  "deletionManifest",
  "status",
  "storagePaths",
]);

export async function rejectExecutionIdentityFromBody(
  request: Request
): Promise<boolean> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return false;
  }

  try {
    const body = (await request.clone().json()) as Record<string, unknown>;
    return Object.keys(body).some((key) =>
      FORBIDDEN_EXECUTION_BODY_KEYS.has(key)
    );
  } catch {
    return false;
  }
}

export async function handleAccountDeletionExecuteRequest(options: {
  request: Request;
  requestId: string;
}): Promise<AccountDeletionExecuteHandlerResult> {
  const { request, requestId } = options;

  if (!requestId.trim()) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: "invalid_request",
        error: "A deletion request id is required.",
      },
    };
  }

  if (rejectExecutionIdentityFromRequest(request)) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: "invalid_request",
        error:
          "Execution targets are resolved from account_deletion_requests.id only.",
      },
    };
  }

  if (await rejectExecutionIdentityFromBody(request)) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: "invalid_request",
        error:
          "Execution targets and manifests are resolved server-side from account_deletion_requests.id only.",
      },
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return {
      ok: false,
      status: 503,
      body: orchestrationErrorBody("internal_error"),
    };
  }

  const auth = await authenticateSupabaseRequest(request);
  if (auth.ok === false) {
    return {
      ok: false,
      status: auth.status === 503 ? 503 : 401,
      body: orchestrationErrorBody("unauthorized"),
    };
  }

  const isAdmin = await verifyAdminForAccountDeletionDryRun(
    auth.context.accessToken
  );
  if (!isAdmin) {
    return {
      ok: false,
      status: 403,
      body: orchestrationErrorBody("forbidden"),
    };
  }

  const isOwner = await verifyOwnerForAccountDeletionExecution(
    auth.context.accessToken
  );
  if (!isOwner) {
    return {
      ok: false,
      status: 403,
      body: orchestrationErrorBody("owner_required"),
    };
  }

  if (!isAccountDeletionExecutionEnabled()) {
    return {
      ok: false,
      status: 503,
      body: orchestrationErrorBody("execution_disabled"),
    };
  }

  const aalGate = await verifyAdminAal2ForAccountDeletionExecution(
    auth.context.accessToken
  );
  if (aalGate.ok === false) {
    const code =
      aalGate.code === "mfa_step_up_required"
        ? "mfa_step_up_required"
        : "internal_error";
    return {
      ok: false,
      status: httpStatusForAccountDeletionOrchestrationError(code),
      body: orchestrationErrorBody(code),
    };
  }

  const rateCheck = checkPrayerRateLimit(
    rateLimitKey(auth.context.user.id, "account_deletion_execute"),
    PRAYER_RATE_LIMITS.accountDeletionExecute
  );
  if (rateCheck.allowed === false) {
    return {
      ok: false,
      status: 429,
      body: {
        ...orchestrationErrorBody("rate_limited"),
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      },
    };
  }

  const serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const orchestratorResult = await runAccountDeletionExecutionOrchestrator({
    requestId,
    initiatedBy: auth.context.user.id,
    deps: createAccountDeletionExecutionOrchestratorDeps(serviceRoleClient),
  });

  return mapOrchestratorResultToHandler(orchestratorResult);
}
