import { createClient } from "@supabase/supabase-js";
import { authenticateSupabaseRequest } from "./authenticateSupabaseRequest";
import { verifyAdminForAccountDeletionDryRun } from "./accountDeletionManifest";
import { evaluateAccountDeletionExecutionRequestAllowlist } from "./accountDeletionExecutionAllowlist";
import {
  httpStatusForAccountDeletionOrchestrationError,
  isAccountDeletionExecutionEnabled,
  sanitizeAccountDeletionOrchestrationErrorMessage,
  type AccountDeletionExecutionOrchestrationHttpCode,
} from "./accountDeletionExecutionPolicy";
import { verifyAdminAal2ForAccountDeletionExecution } from "./accountDeletionExecutor";
import { verifyOwnerForAccountDeletionExecution } from "./accountDeletionOwnerAuthorization";
import {
  createAccountDeletionExecutionPreflightDeps,
  runAccountDeletionExecutionPreflight,
  type AccountDeletionExecutionPreflightFailureCode,
  type AccountDeletionExecutionPreflightSanitizedSummary,
} from "./accountDeletionExecutionPreflight";
import {
  fetchAccountDeletionSchemaProbe,
  isSchemaExecutionReadyFromLiveProbe,
} from "./accountDeletionSchemaProbe";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
} from "./prayerRateLimit";
import { rejectExecutionIdentityFromRequest } from "./accountDeletionExecuteHandler";
import {
  ACCOUNT_DELETION_STATUS,
  normalizeLegacyDeletionStatus,
} from "../accountCenter/accountDeletionLifecycle";

export type AccountDeletionExecutionPreflightGoNoGo = "GO" | "NO_GO";

export type AccountDeletionExecutionPreflightHandlerResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: unknown };

function mapPreflightFailureToOrchestrationCode(
  code: AccountDeletionExecutionPreflightFailureCode
): AccountDeletionExecutionOrchestrationHttpCode {
  switch (code) {
    case "target_not_found":
      return "target_not_found";
    case "blocked_owner":
      return "blocked_owner";
    case "blocked_admin":
      return "blocked_admin";
    case "unsupported_story_lifecycle":
      return "execution_preflight_blocked";
    case "preflight_lookup_failed":
      return "preflight_lookup_failed";
    case "preflight_invariant_failed":
      return "preflight_invariant_failed";
    case "execution_in_progress":
      return "execution_in_progress";
    case "request_not_approved":
      return "request_not_approved";
    default:
      return "preflight_invariant_failed";
  }
}

function orchestrationErrorBody(code: AccountDeletionExecutionOrchestrationHttpCode) {
  return {
    ok: false as const,
    code,
    error: sanitizeAccountDeletionOrchestrationErrorMessage(code),
  };
}

function buildPreflightResponseBody(input: {
  goNoGo: AccountDeletionExecutionPreflightGoNoGo;
  schemaReady: boolean;
  preflightCode: string;
  summary: AccountDeletionExecutionPreflightSanitizedSummary;
  orchestrationCode?: AccountDeletionExecutionOrchestrationHttpCode;
}) {
  const base = {
    goNoGo: input.goNoGo,
    schemaReady: input.schemaReady,
    preflightCode: input.preflightCode,
    summary: input.summary,
  };

  if (input.goNoGo === "GO") {
    return { ok: true as const, ...base };
  }

  return {
    ...orchestrationErrorBody(
      input.orchestrationCode ?? "preflight_lookup_failed"
    ),
    ...base,
  };
}

export async function handleAccountDeletionExecutionPreflightRequest(options: {
  request: Request;
  requestId: string;
}): Promise<AccountDeletionExecutionPreflightHandlerResult> {
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

  const allowlistGate = evaluateAccountDeletionExecutionRequestAllowlist(requestId);
  if (allowlistGate.ok === false) {
    return {
      ok: false,
      status: 503,
      body: orchestrationErrorBody("execution_request_not_allowed"),
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
    rateLimitKey(auth.context.user.id, "account_deletion_execution_preflight"),
    PRAYER_RATE_LIMITS.accountDeletionExecutionPreflight
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

  const { data: requestStatusRow, error: requestStatusError } =
    await serviceRoleClient
      .from("account_deletion_requests")
      .select("status")
      .eq("id", requestId)
      .maybeSingle();

  if (requestStatusError || !requestStatusRow) {
    const summary: AccountDeletionExecutionPreflightSanitizedSummary = {
      operation: "deletion_request_lookup",
      blockerCodes: ["request_not_found"],
      childTablesWithQueryFailures: [],
      expectedStoryCount: null,
      nonAuthoritativeStoryCount: null,
    };
    return {
      ok: false,
      status: httpStatusForAccountDeletionOrchestrationError("preflight_lookup_failed"),
      body: buildPreflightResponseBody({
        goNoGo: "NO_GO",
        schemaReady: false,
        preflightCode: "preflight_lookup_failed",
        summary,
        orchestrationCode: "preflight_lookup_failed",
      }),
    };
  }

  const normalizedRequestStatus = normalizeLegacyDeletionStatus(
    requestStatusRow.status
  );
  if (normalizedRequestStatus === ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS) {
    const summary: AccountDeletionExecutionPreflightSanitizedSummary = {
      operation: "deletion_request_lookup",
      blockerCodes: ["execution_in_progress"],
      childTablesWithQueryFailures: [],
      expectedStoryCount: null,
      nonAuthoritativeStoryCount: null,
    };
    return {
      ok: false,
      status: httpStatusForAccountDeletionOrchestrationError("execution_in_progress"),
      body: buildPreflightResponseBody({
        goNoGo: "NO_GO",
        schemaReady: false,
        preflightCode: "execution_in_progress",
        summary,
        orchestrationCode: "execution_in_progress",
      }),
    };
  }

  const liveSchemaProbe = await fetchAccountDeletionSchemaProbe(serviceRoleClient);
  const schemaReady = isSchemaExecutionReadyFromLiveProbe(liveSchemaProbe);

  if (!schemaReady) {
    const summary: AccountDeletionExecutionPreflightSanitizedSummary = {
      operation: "deletion_request_lookup",
      blockerCodes: ["schema_not_ready"],
      childTablesWithQueryFailures: [],
      expectedStoryCount: null,
      nonAuthoritativeStoryCount: null,
    };
    return {
      ok: false,
      status: httpStatusForAccountDeletionOrchestrationError("schema_not_ready"),
      body: buildPreflightResponseBody({
        goNoGo: "NO_GO",
        schemaReady: false,
        preflightCode: "schema_not_ready",
        summary,
        orchestrationCode: "schema_not_ready",
      }),
    };
  }

  const preflight = await runAccountDeletionExecutionPreflight({
    requestId,
    deps: createAccountDeletionExecutionPreflightDeps(serviceRoleClient),
  });

  if (preflight.ok === false) {
    const orchestrationCode = mapPreflightFailureToOrchestrationCode(
      preflight.code
    );
    return {
      ok: false,
      status: httpStatusForAccountDeletionOrchestrationError(orchestrationCode),
      body: buildPreflightResponseBody({
        goNoGo: "NO_GO",
        schemaReady: true,
        preflightCode: preflight.code,
        summary: preflight.summary,
        orchestrationCode,
      }),
    };
  }

  return {
    ok: true,
    status: 200,
    body: buildPreflightResponseBody({
      goNoGo: "GO",
      schemaReady: true,
      preflightCode: preflight.code,
      summary: preflight.summary,
    }),
  };
}
