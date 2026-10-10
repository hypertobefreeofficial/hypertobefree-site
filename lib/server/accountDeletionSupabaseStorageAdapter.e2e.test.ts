import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAccountDeletionIntegrationDbUrl } from "./accountDeletionIntegrationHarness";
import {
  assertLocalSupabaseForStorageE2e,
  isAccountDeletionStorageE2eTestEnabled,
} from "./accountDeletionStorageE2ePolicy";
import {
  ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
  createAccountDeletionServiceRoleSupabaseClient,
  createAccountDeletionSupabaseStorageAdapter,
} from "./accountDeletionSupabaseStorageAdapter";
import {
  createAccountDeletionStorageObjectExecutorDeps,
  executeAccountDeletionStorageObject,
} from "./accountDeletionStorageObjectExecutor";

const E2E_SOURCE_PATH = path.join(
  import.meta.dirname,
  "accountDeletionSupabaseStorageAdapter.e2e.test.ts"
);

/** Tiny synthetic payload; bucket allows video/mp4 for journey-private-media. */
const SYNTHETIC_MP4_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);

/** Local Supabase CLI Postgres (must match supabase/config.toml db.port). */
export function isLocalSupabaseDatabaseUrl(connectionString: string): boolean {
  return /(?:@|\/\/)(?:127\.0\.0\.1|localhost):54322(?:\/|\?|$)/.test(
    connectionString
  );
}

const e2eEnabled = isAccountDeletionStorageE2eTestEnabled();
const dbUrl = getAccountDeletionIntegrationDbUrl();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const localApiOk =
  e2eEnabled &&
  !!supabaseUrl &&
  (() => {
    try {
      assertLocalSupabaseForStorageE2e(supabaseUrl);
      return true;
    } catch {
      return false;
    }
  })();
const localDbOk = !!dbUrl && isLocalSupabaseDatabaseUrl(dbUrl);

const describeE2e = localApiOk && localDbOk ? describe : describe.skip;

describe("accountDeletionSupabaseStorageAdapter.e2e architecture", () => {
  it("does not invoke vanilla integration schema reset or DROP SCHEMA", () => {
    const source = readFileSync(E2E_SOURCE_PATH, "utf8");
    const executableSource = source.replace(
      /describe\("accountDeletionSupabaseStorageAdapter\.e2e architecture"[\s\S]*?\}\);\n\n/,
      ""
    );
    expect(executableSource).not.toMatch(
      /await\s+resetAccountDeletionIntegrationSchema\s*\(/
    );
    expect(executableSource).not.toMatch(
      /await\s+applyAccountDeletionMigrations\s*\(/
    );
    const dropPublic = ["DROP", " SCHEMA", " public"].join("");
    const dropAuth = ["DROP", " SCHEMA", " auth"].join("");
    const dropStorage = ["DROP", " SCHEMA", " storage"].join("");
    expect(executableSource.includes(dropPublic)).toBe(false);
    expect(executableSource.includes(dropAuth)).toBe(false);
    expect(executableSource.includes(dropStorage)).toBe(false);
    expect(executableSource).not.toMatch(/DELETE\s+FROM\s+storage\.objects/i);
    expect(executableSource).not.toMatch(/INSERT\s+INTO\s+storage\.objects/i);
    expect(executableSource).not.toMatch(/UPDATE\s+storage\.objects/i);
    expect(executableSource).not.toMatch(/SET\s+is_owner\s*=\s*true/i);
    expect(executableSource).not.toMatch(/SET\s+is_admin\s*=\s*true/i);
    expect(executableSource).not.toMatch(/DISABLE\s+TRIGGER/i);
    expect(executableSource).not.toMatch(
      /acquire_account_deletion_execution_lock\s*\(/
    );
  });
});

async function submitSyntheticDeletionRequestAsTarget(
  pg: Client,
  input: {
    requestId: string;
    targetUserId: string;
    targetUsername: string;
    targetEmail: string;
  }
): Promise<void> {
  await pg.query("BEGIN");
  try {
    await pg.query("SET LOCAL ROLE authenticated");
    await pg.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: input.targetUserId }),
    ]);
    await pg.query(
      `INSERT INTO public.account_deletion_requests (
        id, user_id, status, target_username_snapshot, email
      ) VALUES ($1::uuid, $2::uuid, 'submitted', $3, $4)`,
      [input.requestId, input.targetUserId, input.targetUsername, input.targetEmail]
    );
    await pg.query("COMMIT");
  } catch (error) {
    await pg.query("ROLLBACK");
    throw error;
  }
}

/** Local fixture prep only — not application approval behavior. */
async function approveSyntheticDeletionRequestFixture(
  pg: Client,
  requestId: string,
  actorUserId: string
): Promise<void> {
  const updated = await pg.query(
    `UPDATE public.account_deletion_requests
     SET
       status = 'approved',
       approved_at = now(),
       approved_by = $2::uuid,
       reviewed_at = now(),
       reviewed_by = $2::uuid
     WHERE id = $1::uuid
       AND status = 'submitted'`,
    [requestId, actorUserId]
  );
  expect(updated.rowCount).toBe(1);
}

/**
 * Local fixture-only downstream state for the Storage executor E2E.
 * Acquisition RPC and approved → deletion_in_progress authorization are covered by
 * the standalone PostgreSQL integration suite (131/131). This E2E isolates real
 * Supabase Storage remove() against an already-valid executor DB snapshot.
 */
async function prepareSyntheticStorageExecutorAttempt(
  pg: Client,
  input: {
    requestId: string;
    targetUserId: string;
    actorUserId: string;
  }
): Promise<string> {
  const inProgress = await pg.query(
    `UPDATE public.account_deletion_requests
     SET
       status = 'deletion_in_progress',
       execution_started_at = now()
     WHERE id = $1::uuid
       AND status = 'approved'
       AND approved_at IS NOT NULL`,
    [input.requestId]
  );
  expect(inProgress.rowCount).toBe(1);

  const attemptRow = await pg.query<{ id: string }>(
    `INSERT INTO public.account_deletion_execution_attempts (
      deletion_request_id,
      target_user_id,
      initiated_by,
      status,
      stage,
      storage_manifest_status
    ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', 'database_completed', 'finalized')
    RETURNING id`,
    [input.requestId, input.targetUserId, input.actorUserId]
  );
  return attemptRow.rows[0]!.id;
}

describeE2e("account deletion Supabase Storage adapter (local E2E opt-in)", () => {
  const syntheticPath = `account-deletion-e2e/${randomUUID()}/object.mp4`;

  afterAll(async () => {
    const client = createAccountDeletionServiceRoleSupabaseClient();
    await client.storage
      .from(ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET)
      .remove([syntheticPath]);
  });

  it("upload → adapter remove → object absent (real Storage API)", async () => {
    const client = createAccountDeletionServiceRoleSupabaseClient();
    const upload = await client.storage
      .from(ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET)
      .upload(syntheticPath, SYNTHETIC_MP4_BYTES, {
        contentType: "video/mp4",
        upsert: true,
      });
    expect(upload.error).toBeNull();

    const adapter = createAccountDeletionSupabaseStorageAdapter(client);
    expect(
      await adapter.objectExists(
        ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
        syntheticPath
      )
    ).toEqual({ status: "exists" });

    const removed = await adapter.removeObjects(
      ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
      [syntheticPath]
    );
    expect(removed.error).toBeNull();
    expect(
      await adapter.objectExists(
        ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
        syntheticPath
      )
    ).toEqual({ status: "absent" });
  });
});

describeE2e(
  "account deletion storage executor + real Storage (local E2E opt-in)",
  () => {
    const targetUserId = randomUUID();
    const fixture = {
      targetUserId,
      actorUserId: randomUUID(),
      requestId: randomUUID(),
      attemptId: "" as string,
      manifestId: "" as string,
      resultId: "" as string,
      objectPath: `${targetUserId}/account-deletion-e2e/${randomUUID()}/executor.mp4`,
    };

    let pg: Client;

    beforeAll(async () => {
      pg = new Client({ connectionString: dbUrl! });
      await pg.connect();
    });

    afterAll(async () => {
      const supabase = createAccountDeletionServiceRoleSupabaseClient();
      await supabase.storage
        .from(ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET)
        .remove([fixture.objectPath]);

      if (pg && fixture.requestId) {
        await pg.query(
          `DELETE FROM public.account_deletion_storage_execution_audit
           WHERE deletion_request_id = $1::uuid`,
          [fixture.requestId]
        );
        await pg.query(
          `DELETE FROM public.account_deletion_storage_execution_results
           WHERE deletion_request_id = $1::uuid`,
          [fixture.requestId]
        );
        await pg.query(
          `DELETE FROM public.account_deletion_storage_preservation_holds
           WHERE deletion_request_id = $1::uuid`,
          [fixture.requestId]
        );
        await pg.query(
          `DELETE FROM public.account_deletion_storage_manifest
           WHERE deletion_request_id = $1::uuid`,
          [fixture.requestId]
        );
        await pg.query(
          `DELETE FROM public.account_deletion_execution_attempts
           WHERE deletion_request_id = $1::uuid`,
          [fixture.requestId]
        );
        await pg.query(
          `DELETE FROM public.account_deletion_requests WHERE id = $1::uuid`,
          [fixture.requestId]
        );
        await pg.query(
          `DELETE FROM public.profiles WHERE id = ANY($1::uuid[])`,
          [[fixture.targetUserId, fixture.actorUserId]]
        );
        await pg.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [
          [fixture.targetUserId, fixture.actorUserId],
        ]);
      }

      await pg?.end();
    });

    it("full executor path deletes real Storage object when flags enabled in test", async () => {
      const supabase = createAccountDeletionServiceRoleSupabaseClient();
      const targetEmail = `e2e-target-${fixture.targetUserId}@local.test`;
      const targetUsername = `e2e_${fixture.targetUserId.slice(0, 8)}`;

      await pg.query(
        `INSERT INTO auth.users (id, email) VALUES ($1,$2),($3,$4)
         ON CONFLICT (id) DO NOTHING`,
        [
          fixture.targetUserId,
          targetEmail,
          fixture.actorUserId,
          `e2e-actor-${fixture.actorUserId}@local.test`,
        ]
      );
      await pg.query(
        `INSERT INTO public.profiles (id, email, username, display_name)
         VALUES ($1,$2,$3,$4),($5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [
          fixture.targetUserId,
          targetEmail,
          targetUsername,
          "E2E Target",
          fixture.actorUserId,
          `e2e-actor-${fixture.actorUserId}@local.test`,
          `e2e_actor_${fixture.actorUserId.slice(0, 8)}`,
          "E2E Actor",
        ]
      );

      await submitSyntheticDeletionRequestAsTarget(pg, {
        requestId: fixture.requestId,
        targetUserId: fixture.targetUserId,
        targetUsername,
        targetEmail,
      });

      await approveSyntheticDeletionRequestFixture(
        pg,
        fixture.requestId,
        fixture.actorUserId
      );

      fixture.attemptId = await prepareSyntheticStorageExecutorAttempt(pg, {
        requestId: fixture.requestId,
        targetUserId: fixture.targetUserId,
        actorUserId: fixture.actorUserId,
      });

      const manifestRow = await pg.query<{ id: string }>(
        `INSERT INTO public.account_deletion_storage_manifest (
          deletion_request_id, execution_attempt_id, target_user_id, bucket, object_path,
          media_category, ownership_basis, disposition, disposition_reason,
          preservation_required, reference_state, total_reference_count, surviving_reference_count,
          reference_fingerprint, status
        ) VALUES (
          $1::uuid,$2::uuid,$3::uuid,$4,$5,'journey_private_media','exclusive_owner','DELETE_PRIVATE','e2e',false,'exclusive',1,0,$6,'pending'
        ) RETURNING id`,
        [
          fixture.requestId,
          fixture.attemptId,
          fixture.targetUserId,
          ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
          fixture.objectPath,
          `fp-${randomUUID()}`,
        ]
      );
      fixture.manifestId = manifestRow.rows[0]!.id;

      const resultRow = await pg.query<{ id: string }>(
        `INSERT INTO public.account_deletion_storage_execution_results (
          deletion_request_id, execution_attempt_id, manifest_object_id, target_user_id,
          bucket, object_path, disposition_snapshot, preservation_required_snapshot, execution_state
        ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,'DELETE_PRIVATE',false,'pending')
        RETURNING id`,
        [
          fixture.requestId,
          fixture.attemptId,
          fixture.manifestId,
          fixture.targetUserId,
          ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
          fixture.objectPath,
        ]
      );
      fixture.resultId = resultRow.rows[0]!.id;

      const upload = await supabase.storage
        .from(ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET)
        .upload(fixture.objectPath, SYNTHETIC_MP4_BYTES, {
          contentType: "video/mp4",
          upsert: true,
        });
      expect(upload.error).toBeNull();

      const deps = createAccountDeletionStorageObjectExecutorDeps(supabase);
      const result = await executeAccountDeletionStorageObject(
        {
          requestId: fixture.requestId,
          attemptId: fixture.attemptId,
          resultId: fixture.resultId,
        },
        {
          ...deps,
          isAccountDeletionExecutionEnabled: () => true,
          isStorageExecutionEnabled: () => true,
        }
      );

      expect(result).toMatchObject({ ok: true, code: "deleted" });
      const adapter = createAccountDeletionSupabaseStorageAdapter(supabase);
      expect(
        await adapter.objectExists(
          ACCOUNT_DELETION_DESTRUCTIVE_STORAGE_BUCKET,
          fixture.objectPath
        )
      ).toEqual({ status: "absent" });

      const state = await pg.query<{ execution_state: string }>(
        `SELECT execution_state FROM public.account_deletion_storage_execution_results WHERE id = $1::uuid`,
        [fixture.resultId]
      );
      expect(state.rows[0]?.execution_state).toBe("deleted");
    });
  }
);
