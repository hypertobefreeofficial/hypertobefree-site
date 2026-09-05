import { createClient } from "@supabase/supabase-js";
import { authenticateSupabaseRequest } from "./authenticateSupabaseRequest";
import {
  buildAccountDeletionDryRunManifest,
  createAccountDeletionDryRunDeps,
  sanitizeManifestForResponse,
  verifyAdminForAccountDeletionDryRun,
} from "./accountDeletionManifest";
import { resolveCombinedSchemaExecutionReady } from "./accountDeletionDatabasePolicy";
import { fetchAccountDeletionSchemaProbe } from "./accountDeletionSchemaProbe";
import {
  checkPrayerRateLimit,
  PRAYER_RATE_LIMITS,
  rateLimitKey,
} from "./prayerRateLimit";

export type AccountDeletionDryRunHandlerResult =
  | { ok: true; status: 200; body: unknown }
  | { ok: false; status: number; body: unknown };

export function rejectArbitraryUserIdQuery(request: Request): boolean {
  const url = new URL(request.url);
  return url.searchParams.has("userId") || url.searchParams.has("user_id");
}

export async function handleAccountDeletionDryRunRequest(options: {
  request: Request;
  requestId: string;
}): Promise<AccountDeletionDryRunHandlerResult> {
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

  if (rejectArbitraryUserIdQuery(request)) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        code: "invalid_request",
        error:
          "Dry-run targets are resolved from account_deletion_requests.id only.",
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
      body: {
        ok: false,
        code: "service_unavailable",
        error: "Account deletion dry-run is unavailable right now.",
      },
    };
  }

  const auth = await authenticateSupabaseRequest(request);
  if (auth.ok === false) {
    return {
      ok: false,
      status: auth.status,
      body: {
        ok: false,
        code: auth.code,
        error: auth.error,
      },
    };
  }

  const isAdmin = await verifyAdminForAccountDeletionDryRun(
    auth.context.accessToken
  );
  if (!isAdmin) {
    return {
      ok: false,
      status: 403,
      body: {
        ok: false,
        code: "forbidden",
        error: "Admin access is required.",
      },
    };
  }

  const rateCheck = checkPrayerRateLimit(
    rateLimitKey(auth.context.user.id, "account_deletion_dry_run"),
    PRAYER_RATE_LIMITS.accountDeletionDryRun
  );
  if (rateCheck.allowed === false) {
    return {
      ok: false,
      status: 429,
      body: {
        ok: false,
        code: "rate_limited",
        error: "Too many requests. Please wait and try again.",
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      },
    };
  }

  const serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const liveSchemaProbe = await fetchAccountDeletionSchemaProbe(serviceRoleClient);
  const schemaReadiness = resolveCombinedSchemaExecutionReady({
    liveProbe: liveSchemaProbe,
  });

  const result = await buildAccountDeletionDryRunManifest(
    requestId,
    createAccountDeletionDryRunDeps(serviceRoleClient)
  );

  if (result.ok === false) {
    const status = result.code === "not_found" ? 404 : 503;
    return {
      ok: false,
      status,
      body: {
        ok: false,
        code: result.code,
        error: result.message,
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      manifest: sanitizeManifestForResponse(result.manifest),
      schemaReadiness: {
        staticPrerequisitesReady: schemaReadiness.staticPrerequisitesReady,
        liveCatalogProbeReady: schemaReadiness.liveCatalogProbeReady,
        combinedSchemaExecutionReady: schemaReadiness.combinedReady,
        liveSchemaProbe,
      },
    },
  };
}
