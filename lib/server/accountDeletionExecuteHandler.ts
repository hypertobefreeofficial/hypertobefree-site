import { createClient } from "@supabase/supabase-js";
import { authenticateSupabaseRequest } from "./authenticateSupabaseRequest";
import {
  createAccountDeletionDryRunDeps,
  verifyAdminForAccountDeletionDryRun,
} from "./accountDeletionManifest";
import {
  httpStatusForAccountDeletionExecutionError,
  isAccountDeletionExecutionEnabled,
  sanitizeAccountDeletionExecutionErrorMessage,
  type AccountDeletionExecutionErrorCode,
} from "./accountDeletionExecutionPolicy";
import {
  createAccountDeletionExecutionDeps,
  prepareAccountDeletionExecution,
  verifyAdminAal2ForAccountDeletionExecution,
} from "./accountDeletionExecutor";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
} from "./prayerRateLimit";

export type AccountDeletionExecuteHandlerResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: unknown };

function executionErrorBody(code: AccountDeletionExecutionErrorCode) {
  return {
    ok: false,
    code,
    error: sanitizeAccountDeletionExecutionErrorMessage(code),
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
      body: executionErrorBody("internal_error"),
    };
  }

  const auth = await authenticateSupabaseRequest(request);
  if (auth.ok === false) {
    return {
      ok: false,
      status: auth.status === 503 ? 503 : 401,
      body: executionErrorBody("unauthorized"),
    };
  }

  const isAdmin = await verifyAdminForAccountDeletionDryRun(
    auth.context.accessToken
  );
  if (!isAdmin) {
    return {
      ok: false,
      status: 403,
      body: executionErrorBody("forbidden"),
    };
  }

  if (!isAccountDeletionExecutionEnabled()) {
    return {
      ok: false,
      status: 503,
      body: executionErrorBody("execution_disabled"),
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
      status: httpStatusForAccountDeletionExecutionError(code),
      body: executionErrorBody(code),
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
        ...executionErrorBody("rate_limited"),
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      },
    };
  }

  const serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const deps = createAccountDeletionExecutionDeps({
    serviceRoleClient,
    verifyAdmin: verifyAdminForAccountDeletionDryRun,
    verifyAdminAal2: verifyAdminAal2ForAccountDeletionExecution,
    buildManifestDeps: createAccountDeletionDryRunDeps(serviceRoleClient),
  });

  const prepared = await prepareAccountDeletionExecution({
    requestId,
    actorUserId: auth.context.user.id,
    deps,
  });

  if (prepared.ok === false) {
    const status = httpStatusForAccountDeletionExecutionError(prepared.code);

    if (prepared.code === "already_deleted") {
      return {
        ok: true,
        status,
        body: {
          ok: true,
          code: prepared.code,
          error: sanitizeAccountDeletionExecutionErrorMessage(prepared.code),
          requestStatus: prepared.request?.status ?? null,
        },
      };
    }

    return {
      ok: false,
      status,
      body: {
        ...executionErrorBody(prepared.code),
        stages: prepared.stages,
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      code: "execution_prepared",
      message:
        "Execution eligibility verified. Destructive stages are not implemented in Phase 4C.7B.1C.",
      requestId: prepared.requestId,
      targetUserId: prepared.targetUserId,
      requestStatus: prepared.requestStatus,
      stages: prepared.stages,
      destructiveStages: prepared.destructiveStages,
      manifestSummary: prepared.manifestSummary,
      auditPreview: prepared.auditPreview,
    },
  };
}
