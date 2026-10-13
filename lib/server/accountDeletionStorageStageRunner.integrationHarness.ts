/**
 * Vanilla PostgreSQL integration helpers for Storage stage runner tests (3B.3F.1).
 * Not for Production or local Supabase app DB (:54322).
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "pg";
import type { AccountDeletionStorageObjectExecutorResult } from "./accountDeletionStorageObjectExecutor";
import { executeAccountDeletionStorageObject } from "./accountDeletionStorageObjectExecutor";
import type { AccountDeletionStorageObjectExistence } from "./accountDeletionStorageObjectExistence";
import { ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE } from "./accountDeletionStorageStageRunnerPolicy";

export type RpcPayload = Record<string, unknown>;

export const RUNNER_IT_TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const RUNNER_IT_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const RUNNER_IT_OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const RUNNER_IT_THREAD = "11111111-1111-4111-8111-111111111111";

let serviceRoleGrantsApplied = false;
let authenticatedGrantsApplied = false;

export function isDedicatedVanillaIntegrationDb(connectionString: string): boolean {
  return (
    !!connectionString &&
    !/(?:@|\/\/)(?:127\.0\.0\.1|localhost):54322(?:\/|\?|$)/.test(
      connectionString
    )
  );
}

export async function ensureServiceRole(client: Client) {
  if (serviceRoleGrantsApplied) return;
  await client.query(`
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER ROLE service_role BYPASSRLS;
  `);
  serviceRoleGrantsApplied = true;
}

export async function ensureAuthenticatedGrants(client: Client) {
  if (authenticatedGrantsApplied) return;
  await client.query(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  `);
  authenticatedGrantsApplied = true;
}

export async function asServiceRole<T>(
  client: Client,
  sql: string,
  params: unknown[] = []
): Promise<T> {
  await ensureServiceRole(client);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const result = await client.query<{ payload: T }>(sql, params);
    await client.query("COMMIT");
    return result.rows[0]?.payload as T;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Open a service_role transaction (caller must COMMIT or ROLLBACK). */
export async function beginServiceRoleTransaction(client: Client) {
  await ensureServiceRole(client);
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE service_role");
}

export async function serviceRoleRpcInOpenTransaction<T>(
  client: Client,
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const result = await client.query<{ payload: T }>(sql, params);
  return result.rows[0]?.payload as T;
}

export async function asAuthenticatedOwner<T>(
  client: Client,
  sql: string,
  params: unknown[] = [],
  options: { aal2?: boolean } = {}
): Promise<T> {
  await ensureAuthenticatedGrants(client);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({
        sub: RUNNER_IT_OWNER,
        ...(options.aal2 ? { aal: "aal2" } : {}),
      }),
    ]);
    const result = await client.query<{ payload: T }>(sql, params);
    await client.query("COMMIT");
    return result.rows[0]?.payload as T;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function cleanupRunnerIntegration(client: Client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // ignore
  }
  await client.query(`
    TRUNCATE TABLE
      public.account_deletion_storage_execution_audit,
      public.account_deletion_storage_execution_results,
      public.account_deletion_storage_preservation_holds,
      public.account_deletion_storage_manifest,
      public.account_deletion_storage_manifest_capture,
      public.account_deletion_story_freeze_scope,
      public.inbox_messages,
      public.prayer_video_responses,
      public.stories,
      public.account_deletion_execution_attempts,
      public.account_deletion_requests,
      public.profiles
    RESTART IDENTITY CASCADE
  `);
  await client.query(`DELETE FROM storage.objects`);
  await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [
    [RUNNER_IT_TARGET, RUNNER_IT_OTHER, RUNNER_IT_OWNER],
  ]);
}

export async function seedRunnerIntegrationUsers(client: Client) {
  await client.query(
    `INSERT INTO auth.users (id, email) VALUES ($1,'t@test'),($2,'o@test'),($3,'w@test')
     ON CONFLICT (id) DO NOTHING`,
    [RUNNER_IT_TARGET, RUNNER_IT_OTHER, RUNNER_IT_OWNER]
  );
  await client.query("BEGIN");
  try {
    await client.query(
      `ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_roles_trigger`
    );
    await client.query(
      `INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
       VALUES
         ($1,'target-runner@test.local','target_runner','Target',false,false),
         ($2,'other-runner@test.local','other_runner','Other',false,false),
         ($3,'owner-runner@test.local','owner_runner','Owner',false,false)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [RUNNER_IT_TARGET, RUNNER_IT_OTHER, RUNNER_IT_OWNER]
    );
    await client.query(
      `UPDATE public.profiles SET is_owner = true, is_admin = true WHERE id = $1`,
      [RUNNER_IT_OWNER]
    );
    await client.query(
      `ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_roles_trigger`
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function insertJourneyObject(client: Client, objectPath: string) {
  await client.query(
    `INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('journey-private-media', $1, $2) ON CONFLICT DO NOTHING`,
    [objectPath, RUNNER_IT_TARGET]
  );
}

export async function seedApprovedAttemptAtInventory(
  client: Client,
  requestId: string
): Promise<string> {
  await ensureAuthenticatedGrants(client);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: RUNNER_IT_TARGET }),
    ]);
    await client.query(
      `INSERT INTO public.account_deletion_requests (
        id, user_id, status, target_username_snapshot, email
      ) VALUES ($1, $2, 'submitted', 'target_runner', $3)`,
      [requestId, RUNNER_IT_TARGET, "target-runner@test.local"]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: RUNNER_IT_OWNER }),
    ]);
    await client.query(
      `UPDATE public.account_deletion_requests
       SET status = 'approved', approved_at = now(), approved_by = $2,
           reviewed_at = now(), reviewed_by = $2
       WHERE id = $1`,
      [requestId, RUNNER_IT_OWNER]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  let attemptId = "";
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const acquired = await client.query<{
      payload: { ok?: boolean; code?: string; attempt_id?: string };
    }>(
      `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
      [requestId, RUNNER_IT_OWNER]
    );
    const payload = acquired.rows[0]?.payload;
    if (payload?.ok !== true || !payload.attempt_id) {
      throw new Error(
        `account deletion acquisition failed: ${payload?.code ?? "missing_payload"}`
      );
    }
    attemptId = payload.attempt_id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  for (const rpc of [
    "advance_account_deletion_attempt_to_sessions_pending",
    "advance_account_deletion_attempt_to_sessions_revoked",
    "advance_account_deletion_attempt_to_inventory",
  ]) {
    await asServiceRole<RpcPayload>(
      client,
      `SELECT public.${rpc}($1::uuid, $2::uuid) AS payload`,
      [requestId, attemptId]
    );
  }

  return attemptId;
}

export async function captureManifestAndMarkDatabaseCompleted(
  client: Client,
  requestId: string,
  attemptId: string
) {
  const captured = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
  if (captured.ok !== true) {
    throw new Error(`capture failed: ${String(captured.code)}`);
  }
  await client.query(
    `UPDATE public.account_deletion_execution_attempts
     SET stage = 'database_completed'
     WHERE id = $1`,
    [attemptId]
  );
}

export async function insertDeletePrivateJourneyFixture(
  client: Client,
  objectSuffix: string
): Promise<string> {
  const objectId = randomUUID();
  const path = `${RUNNER_IT_TARGET}/${RUNNER_IT_THREAD}/${objectSuffix}-${objectId.slice(0, 8)}.mp4`;
  await insertJourneyObject(client, path);
  await client.query(
    `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body, video_url, thread_id)
     VALUES ($1,$2,$2,'t','b',$3,$4)`,
    [randomUUID(), RUNNER_IT_TARGET, `journey-private-media/${path}`, RUNNER_IT_THREAD]
  );
  return path;
}

export async function cloneDeletePrivateManifestRow(
  client: Client,
  requestId: string,
  attemptId: string,
  templateManifestId: string,
  pathSuffix: string
): Promise<{ manifestId: string; objectPath: string }> {
  const template = await client.query<{
    target_user_id: string;
    bucket: string;
    object_path: string;
    media_category: string;
    ownership_basis: string;
    disposition_reason: string;
    reference_fingerprint: string;
    total_reference_count: number;
    status: string;
  }>(
    `SELECT target_user_id, bucket, object_path, media_category, ownership_basis,
            disposition_reason, reference_fingerprint, total_reference_count, status
     FROM public.account_deletion_storage_manifest WHERE id = $1`,
    [templateManifestId]
  );
  const t = template.rows[0]!;
  const newPath = `${t.object_path.replace(/\.mp4$/, "")}-${pathSuffix}.mp4`;
  await insertJourneyObject(client, newPath);
  await client.query(`SET session_replication_role = replica`);
  const manifestId = (
    await client.query<{ id: string }>(
      `INSERT INTO public.account_deletion_storage_manifest (
        deletion_request_id, execution_attempt_id, target_user_id, bucket, object_path,
        media_category, ownership_basis, disposition, disposition_reason,
        preservation_required, reference_state, total_reference_count, surviving_reference_count,
        reference_fingerprint, status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,'DELETE_PRIVATE',$8,false,'exclusive',$9,0,$10,$11
      ) RETURNING id`,
      [
        requestId,
        attemptId,
        t.target_user_id,
        t.bucket,
        newPath,
        t.media_category,
        t.ownership_basis,
        t.disposition_reason,
        t.total_reference_count,
        t.reference_fingerprint,
        t.status,
      ]
    )
  ).rows[0]!.id;
  await client.query(`SET session_replication_role = DEFAULT`);
  return { manifestId, objectPath: newPath };
}

export async function getAttemptStage(client: Client, attemptId: string) {
  const row = await client.query<{ stage: string }>(
    `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
    [attemptId]
  );
  return row.rows[0]?.stage;
}

export async function getRequestStatus(client: Client, requestId: string) {
  const row = await client.query<{ status: string }>(
    `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
    [requestId]
  );
  return row.rows[0]?.status;
}

type RpcCall = { fn: string; args: Record<string, unknown> };

function rpcToSql(call: RpcCall): { sql: string; params: unknown[] } {
  const { fn, args } = call;
  switch (fn) {
    case "verify_account_deletion_schema_execution_ready":
      return {
        sql: `SELECT public.verify_account_deletion_schema_execution_ready() AS payload`,
        params: [],
      };
    case "acquire_account_deletion_execution_lock":
      return {
        sql: `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
        params: [args.p_request_id, args.p_initiated_by],
      };
    case "prepare_account_deletion_profile_stage":
      return {
        sql: `SELECT public.prepare_account_deletion_profile_stage($1::uuid, $2::uuid) AS payload`,
        params: [args.p_request_id, args.p_attempt_id],
      };
    case "finalize_account_deletion_profile_stage":
      return {
        sql: `SELECT public.finalize_account_deletion_profile_stage($1::uuid, $2::uuid) AS payload`,
        params: [args.p_request_id, args.p_attempt_id],
      };
    case "prepare_account_deletion_auth_stage":
      return {
        sql: `SELECT public.prepare_account_deletion_auth_stage($1::uuid, $2::uuid) AS payload`,
        params: [args.p_request_id, args.p_attempt_id],
      };
    case "claim_account_deletion_auth_execution":
      return {
        sql: `SELECT public.claim_account_deletion_auth_execution($1::uuid, $2::uuid, $3::integer) AS payload`,
        params: [args.p_request_id, args.p_attempt_id, args.p_lease_seconds ?? 900],
      };
    case "complete_account_deletion_auth_execution":
      return {
        sql: `SELECT public.complete_account_deletion_auth_execution($1::uuid, $2::uuid, $3::uuid, $4::text) AS payload`,
        params: [
          args.p_request_id,
          args.p_attempt_id,
          args.p_delete_commit_token,
          args.p_outcome,
        ],
      };
    case "verify_account_deletion_auth_execution_ready":
      return {
        sql: `SELECT public.verify_account_deletion_auth_execution_ready() AS payload`,
        params: [],
      };
    case "account_deletion_storage_execution_refresh_hold_eligibility":
      return {
        sql: `SELECT public.account_deletion_storage_execution_refresh_hold_eligibility($1::uuid,$2::uuid) AS payload`,
        params: [args.p_request_id, args.p_attempt_id],
      };
    case "initialize_account_deletion_storage_execution_results":
      return {
        sql: `SELECT public.initialize_account_deletion_storage_execution_results($1::uuid,$2::uuid) AS payload`,
        params: [args.p_request_id, args.p_attempt_id],
      };
    case "advance_account_deletion_attempt_to_storage":
      return {
        sql: `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        params: [args.p_request_id, args.p_attempt_id],
      };
    case "advance_account_deletion_attempt_to_storage_completed":
      return {
        sql: `SELECT public.advance_account_deletion_attempt_to_storage_completed($1::uuid,$2::uuid) AS payload`,
        params: [args.p_request_id, args.p_attempt_id],
      };
    case "account_deletion_storage_execution_progress_snapshot":
      return {
        sql: `SELECT public.account_deletion_storage_execution_progress_snapshot($1::uuid,$2::uuid) AS payload`,
        params: [args.p_request_id, args.p_attempt_id],
      };
    case "claim_account_deletion_storage_execution_result":
      return {
        sql: `SELECT public.claim_account_deletion_storage_execution_result($1::uuid,$2::uuid,$3::uuid,$4::integer) AS payload`,
        params: [
          args.p_request_id,
          args.p_attempt_id,
          args.p_result_id,
          args.p_lease_seconds ?? 900,
        ],
      };
    case "authorize_account_deletion_storage_object_delete":
      return {
        sql: `SELECT public.authorize_account_deletion_storage_object_delete($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS payload`,
        params: [
          args.p_request_id,
          args.p_attempt_id,
          args.p_result_id,
          args.p_claim_token,
        ],
      };
    case "complete_account_deletion_storage_execution_object":
      return {
        sql: `SELECT public.complete_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text) AS payload`,
        params: [
          args.p_request_id,
          args.p_attempt_id,
          args.p_result_id,
          args.p_delete_commit_token,
          args.p_outcome,
          args.p_error_code ?? null,
          args.p_error_detail_safe ?? null,
        ],
      };
    case "verify_account_deletion_profile_media_runner_ready":
      return {
        sql: `SELECT public.verify_account_deletion_profile_media_runner_ready() AS payload`,
        params: [],
      };
    case "account_deletion_profile_media_progress_snapshot":
      return {
        sql: `SELECT public.account_deletion_profile_media_progress_snapshot($1::uuid,$2::uuid) AS payload`,
        params: [args.p_request_id, args.p_attempt_id],
      };
    case "select_account_deletion_profile_media_actionable_result_ids":
      return {
        sql: `SELECT public.select_account_deletion_profile_media_actionable_result_ids($1::uuid,$2::uuid,$3::integer) AS payload`,
        params: [args.p_request_id, args.p_attempt_id, args.p_limit],
      };
    default:
      throw new Error(`unsupported rpc in integration shim: ${fn}`);
  }
}

class PgSelectBuilder {
  private filters: string[] = [];
  private filterParams: unknown[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;

  constructor(
    private client: Client,
    private table: string,
    private columns: string
  ) {}

  eq(column: string, value: unknown) {
    this.filterParams.push(value);
    this.filters.push(`${column} = $${this.filterParams.length}`);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filterParams.push(values);
    this.filters.push(`${column} = ANY($${this.filterParams.length})`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push(`${column} ${opts?.ascending === false ? "DESC" : "ASC"}`);
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  async maybeSingle() {
    const rows = await this.runQuery();
    return { data: rows[0] ?? null, error: rows.length > 1 ? { message: "multiple" } : null };
  }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: (value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return this.runQuery()
      .then((rows) => ({ data: rows, error: null }))
      .then(onfulfilled, onrejected);
  }

  private async runQuery(): Promise<Record<string, unknown>[]> {
    const where = this.filters.length ? `WHERE ${this.filters.join(" AND ")}` : "";
    const order = this.orders.length ? `ORDER BY ${this.orders.join(", ")}` : "";
    const limit = this.limitN != null ? `LIMIT ${this.limitN}` : "";
    const sql = `SELECT ${this.columns} FROM public.${this.table} ${where} ${order} ${limit}`;
    await ensureServiceRole(this.client);
    const result = await this.client.query<Record<string, unknown>>(
      sql,
      this.filterParams
    );
    return result.rows;
  }
}

export function createPgSupabaseShim(client: Client): SupabaseClient {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const { sql, params } = rpcToSql({ fn, args });
      try {
        const payload = await asServiceRole<RpcPayload>(client, sql, params);
        return { data: payload, error: null };
      } catch (error) {
        return { data: null, error: { message: String(error) } };
      }
    },
    from: (table: string) => ({
      select: (columns: string) => new PgSelectBuilder(client, table, columns),
    }),
  } as unknown as SupabaseClient;
}

export type StorageExecutorMockMode =
  | "deleted"
  | "missing"
  | "retry_once_then_deleted"
  | "retryable_always";

export function createPgBackedStorageExecutor(
  client: Client,
  mode: StorageExecutorMockMode
) {
  const shim = createPgSupabaseShim(client);
  const attemptCounts = new Map<string, number>();
  const removed = new Set<string>();

  return async (input: {
    requestId: string;
    attemptId: string;
    resultId: string;
  }): Promise<AccountDeletionStorageObjectExecutorResult> => {
    const attempts = (attemptCounts.get(input.resultId) ?? 0) + 1;
    attemptCounts.set(input.resultId, attempts);

    return executeAccountDeletionStorageObject(input, {
      serviceRoleClient: shim,
      removeObjects: async () => {
        if (mode === "retryable_always") {
          return { error: { message: "network timeout" } };
        }
        if (mode === "retry_once_then_deleted" && attempts === 1) {
          return { error: { message: "network timeout" } };
        }
        removed.add(input.resultId);
        return { error: null };
      },
      objectExists: async (_bucket, _path) => {
        if (mode === "missing") {
          return { status: "absent" };
        }
        if (removed.has(input.resultId)) {
          return { status: "absent" };
        }
        if (mode === "retryable_always") {
          return { status: "uncertain", code: "storage_existence_check_failed" };
        }
        return { status: "exists" };
      },
      isAccountDeletionExecutionEnabled: () => true,
      isStorageExecutionEnabled: () => true,
    });
  };
}

export async function verifyRunnerIntegrationReadiness(client: Client) {
  const payload = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.verify_account_deletion_storage_stage_runner_ready() AS payload`
  );
  return payload.ready === true;
}

/** Journey/inbox fixtures must run before acquisition (deletion_in_progress write freeze). */
export async function seedDeletePrivateJourneyFixturesBeforeAcquisition(
  client: Client,
  options: { deletePrivateCount?: number; extraCapturePaths?: string[] } = {}
) {
  const count = options.deletePrivateCount ?? 0;
  for (let i = 0; i < count; i += 1) {
    await insertDeletePrivateJourneyFixture(client, `dp-${i}`);
  }
  for (const extra of options.extraCapturePaths ?? []) {
    await insertJourneyObject(client, extra);
  }
}

export async function seedDatabaseCompletedWithDeletePrivate(
  client: Client,
  options: { deletePrivateCount?: number; extraCapturePaths?: string[] } = {}
) {
  const requestId = randomUUID();
  await seedRunnerIntegrationUsers(client);
  await seedDeletePrivateJourneyFixturesBeforeAcquisition(client, options);
  const attemptId = await seedApprovedAttemptAtInventory(client, requestId);
  await captureManifestAndMarkDatabaseCompleted(client, requestId, attemptId);

  return { requestId, attemptId };
}

export async function readRunnerSeedDiagnostics(
  client: Client,
  requestId: string,
  attemptId: string
) {
  const request = await client.query<{ status: string }>(
    `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
    [requestId]
  );
  const attempt = await client.query<{
    status: string;
    stage: string;
    storage_manifest_status: string | null;
  }>(
    `SELECT status, stage, storage_manifest_status
     FROM public.account_deletion_execution_attempts WHERE id = $1`,
    [attemptId]
  );
  const capture = await client.query<{ status: string; object_count: number }>(
    `SELECT status, object_count FROM public.account_deletion_storage_manifest_capture
     WHERE execution_attempt_id = $1 AND deletion_request_id = $2`,
    [attemptId, requestId]
  );
  return {
    requestStatus: request.rows[0]?.status,
    attemptStatus: attempt.rows[0]?.status,
    attemptStage: attempt.rows[0]?.stage,
    storageManifestStatus: attempt.rows[0]?.storage_manifest_status,
    captureStatus: capture.rows[0]?.status,
    captureObjectCount: capture.rows[0]?.object_count,
    runnerReadiness: await verifyRunnerIntegrationReadiness(client),
  };
}

export { ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE };
