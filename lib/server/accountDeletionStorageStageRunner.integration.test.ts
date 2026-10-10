import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import { executeAccountDeletionStorageObject } from "./accountDeletionStorageObjectExecutor";
import { runAccountDeletionStorageStageTick } from "./accountDeletionStorageStageRunner";
import { ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE } from "./accountDeletionStorageStageRunnerPolicy";
import {
  ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE as HARNESS_BATCH,
  asAuthenticatedOwner,
  asServiceRole,
  captureManifestAndMarkDatabaseCompleted,
  cleanupRunnerIntegration,
  createPgBackedStorageExecutor,
  createPgSupabaseShim,
  getAttemptStage,
  getRequestStatus,
  insertJourneyObject,
  isDedicatedVanillaIntegrationDb,
  RUNNER_IT_OWNER,
  RUNNER_IT_TARGET,
  RUNNER_IT_THREAD,
  cloneDeletePrivateManifestRow,
  readRunnerSeedDiagnostics,
  seedApprovedAttemptAtInventory,
  seedDatabaseCompletedWithDeletePrivate,
  seedRunnerIntegrationUsers,
  verifyRunnerIntegrationReadiness,
  beginServiceRoleTransaction,
  serviceRoleRpcInOpenTransaction,
  type RpcPayload,
} from "./accountDeletionStorageStageRunner.integrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

async function runTick(
  client: Client,
  requestId: string,
  attemptId: string,
  options: {
    physicalEnabled?: boolean;
    executeStorageObject?: ReturnType<typeof createPgBackedStorageExecutor>;
    batchSize?: number;
  } = {}
) {
  return runAccountDeletionStorageStageTick({
    requestId,
    attemptId,
    deps: {
      serviceRoleClient: createPgSupabaseShim(client),
      verifyRunnerReadiness: () => verifyRunnerIntegrationReadiness(client),
      isPhysicalStorageExecutionEnabled: () => options.physicalEnabled ?? false,
      executeStorageObject: options.executeStorageObject,
      batchSize: options.batchSize,
    },
  });
}

async function initResultsAtDatabaseCompleted(
  client: Client,
  requestId: string,
  attemptId: string
) {
  return asServiceRole<RpcPayload>(
    client,
    `SELECT public.initialize_account_deletion_storage_execution_results($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
}

async function seedStorageStageWithPendingDeletePrivate(client: Client) {
  const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
    client,
    { deletePrivateCount: 1 }
  );
  await initResultsAtDatabaseCompleted(client, requestId, attemptId);
  const advanced = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
  expect(advanced.ok).toBe(true);
  const manifest = await client.query<{ manifest_object_id: string }>(
    `SELECT manifest_object_id
     FROM public.account_deletion_storage_execution_results
     WHERE execution_attempt_id = $1
     LIMIT 1`,
    [attemptId]
  );
  return {
    requestId,
    attemptId,
    manifestObjectId: manifest.rows[0]!.manifest_object_id,
  };
}

function manifestFixtureForBucket(bucket: string): {
  mediaCategory: string;
  ownershipBasis: string;
} {
  if (bucket === "story-images") {
    return {
      mediaCategory: "story_image",
      ownershipBasis: "stories.image_url",
    };
  }
  return {
    mediaCategory: "journey_private_media",
    ownershipBasis: "inbox_messages.video_url",
  };
}

async function insertSyntheticManifestRow(
  client: Client,
  params: {
    requestId: string;
    attemptId: string;
    objectPath: string;
    disposition: string;
    bucket?: string;
  }
) {
  const bucket = params.bucket ?? "journey-private-media";
  const { mediaCategory, ownershipBasis } = manifestFixtureForBucket(bucket);
  const isDeletePrivate = params.disposition === "DELETE_PRIVATE";
  const status =
    params.disposition === "BLOCK_UNRESOLVED"
      ? "blocked"
      : params.disposition === "DELETE_PRIVATE"
        ? "pending"
        : "preserved";
  await client.query(`SET session_replication_role = replica`);
  const id = (
    await client.query<{ id: string }>(
      `INSERT INTO public.account_deletion_storage_manifest (
        deletion_request_id, execution_attempt_id, target_user_id, bucket, object_path,
        media_category, ownership_basis, disposition, disposition_reason,
        preservation_required, reference_state, total_reference_count, surviving_reference_count,
        reference_fingerprint, status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,'integration',false,$9,$10,$11,$12,$13
      ) RETURNING id`,
      [
        params.requestId,
        params.attemptId,
        RUNNER_IT_TARGET,
        bucket,
        params.objectPath,
        mediaCategory,
        ownershipBasis,
        params.disposition,
        isDeletePrivate ? "exclusive" : "unresolved",
        isDeletePrivate ? 1 : 0,
        0,
        isDeletePrivate ? "integration-ref-fp" : null,
        status,
      ]
    )
  ).rows[0]!.id;
  await client.query(`SET session_replication_role = DEFAULT`);
  return id;
}

async function assertZeroObjectRunnerPreconditions(
  client: Client,
  requestId: string,
  attemptId: string
) {
  const diag = await readRunnerSeedDiagnostics(client, requestId, attemptId);
  expect(diag.requestStatus).toBe("deletion_in_progress");
  expect(diag.attemptStatus).toBe("active");
  expect(diag.attemptStage).toBe("database_completed");
  expect(diag.storageManifestStatus).toBe("finalized");
  expect(diag.captureStatus).toBe("finalized");
  expect(diag.captureObjectCount).toBe(0);
  expect(diag.runnerReadiness).toBe(true);
}

describeIntegration(
  `account deletion storage stage runner integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV} vanilla PG)`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
    });

    afterAll(async () => {
      await client.end();
    });

    beforeEach(async () => {
      await cleanupRunnerIntegration(client);
    });

    it("R-HP: database_completed → storage → deleted → storage_completed", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      const execute = createPgBackedStorageExecutor(client, "deleted");
      const tick1 = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      expect(tick1.code).toBe("storage_completed");
      expect(await getAttemptStage(client, attemptId)).toBe("storage_completed");
      expect(await getRequestStatus(client, requestId)).toBe("deletion_in_progress");
      const result = await client.query<{ execution_state: string }>(
        `SELECT execution_state FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      expect(result.rows[0]?.execution_state).toBe("deleted");
    });

    it("R-ZERO: zero-object finalized manifest completes storage stage", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 0 }
      );
      await assertZeroObjectRunnerPreconditions(client, requestId, attemptId);
      const tick = await runTick(client, requestId, attemptId, {
        physicalEnabled: false,
      });
      if (tick.code === "precondition_failed") {
        const init = await initResultsAtDatabaseCompleted(client, requestId, attemptId);
        const advance = await asServiceRole<RpcPayload>(
          client,
          `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
          [requestId, attemptId]
        );
        const snap = await asServiceRole<RpcPayload>(
          client,
          `SELECT public.account_deletion_storage_execution_progress_snapshot($1::uuid,$2::uuid) AS payload`,
          [requestId, attemptId]
        );
        throw new Error(
          `R-ZERO precondition_failed diagnostics: init=${JSON.stringify(init)} advance=${JSON.stringify(advance)} snapshot=${JSON.stringify(snap)} seed=${JSON.stringify(await readRunnerSeedDiagnostics(client, requestId, attemptId))}`
        );
      }
      expect(tick.code).toBe("storage_completed");
      const snap = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.account_deletion_storage_execution_progress_snapshot($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(snap.counts).toMatchObject({ total: 0 });
    });

    it("R-MANY: respects batch size across ticks", async () => {
      const total = HARNESS_BATCH + 3;
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: total }
      );
      const execute = createPgBackedStorageExecutor(client, "deleted");
      const tick1 = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
        batchSize: HARNESS_BATCH,
      });
      expect(tick1.processedResultIds?.length).toBeLessThanOrEqual(HARNESS_BATCH);
      expect(tick1.code).toBe("in_progress");
      expect(await getAttemptStage(client, attemptId)).toBe("storage");
      const tick2 = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
        batchSize: HARNESS_BATCH,
      });
      expect(tick2.code).toBe("storage_completed");
    });

    it("R-PRES: preserved rows never invoke executor and allow completion", async () => {
      const storyPath = `${RUNNER_IT_TARGET}/story/img.png`;
      await seedRunnerIntegrationUsers(client);
      const requestId = randomUUID();
      await client.query(
        `INSERT INTO public.stories (id, user_id, name, email, story_text, image_url, status)
         VALUES ($1,$2,'n','e@t','body',$3,'approved')`,
        [randomUUID(), RUNNER_IT_TARGET, `story-images/${storyPath}`]
      );
      await client.query(
        `INSERT INTO storage.objects (bucket_id, name, owner)
         VALUES ('story-images', $1, $2) ON CONFLICT DO NOTHING`,
        [storyPath, RUNNER_IT_TARGET]
      );
      const attemptId = await seedApprovedAttemptAtInventory(client, requestId);
      await captureManifestAndMarkDatabaseCompleted(client, requestId, attemptId);
      const execute = vi.fn();
      const tick = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      expect(execute).not.toHaveBeenCalled();
      expect(tick.code).toBe("storage_completed");
    });

    it("R-DEFER: deferred_profile is terminal for Storage without profile deletion", async () => {
      const avatarPath = `${RUNNER_IT_TARGET}/avatar.png`;
      await seedRunnerIntegrationUsers(client);
      const requestId = randomUUID();
      await client.query(
        `UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`,
        [RUNNER_IT_TARGET, `profile-avatars/${avatarPath}`]
      );
      await client.query(
        `INSERT INTO storage.objects (bucket_id, name, owner)
         VALUES ('profile-avatars', $1, $2) ON CONFLICT DO NOTHING`,
        [avatarPath, RUNNER_IT_TARGET]
      );
      const attemptId = await seedApprovedAttemptAtInventory(client, requestId);
      await captureManifestAndMarkDatabaseCompleted(client, requestId, attemptId);
      const execute = vi.fn();
      const tick = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      expect(execute).not.toHaveBeenCalled();
      expect(tick.code).toBe("storage_completed");
      const profile = await client.query<{ avatar_url: string | null }>(
        `SELECT avatar_url FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(profile.rows[0]?.avatar_url).toContain("profile-avatars/");
    });

    it("R-BLOCK: BLOCK_UNRESOLVED prevents entering storage and completion", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 0 }
      );
      const blockPath = `${RUNNER_IT_TARGET}/${RUNNER_IT_THREAD}/orphan-block.mp4`;
      await insertJourneyObject(client, blockPath);
      await insertSyntheticManifestRow(client, {
        requestId,
        attemptId,
        objectPath: blockPath,
        disposition: "BLOCK_UNRESOLVED",
      });
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      const advance = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(advance.code).toBe("storage_manifest_blocked");
      const tick = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: createPgBackedStorageExecutor(client, "deleted"),
      });
      expect(tick.code).toBe("precondition_failed");
      expect(await getAttemptStage(client, attemptId)).toBe("database_completed");
      const complete = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage_completed($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(complete.ok).toBe(false);
    });

    it("R-HOLD: preservation hold blocks delete and completion", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      const manifest = await client.query<{ id: string }>(
        `SELECT id FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND disposition = 'DELETE_PRIVATE' LIMIT 1`,
        [attemptId]
      );
      const manifestId = manifest.rows[0]!.id;
      await asAuthenticatedOwner<RpcPayload>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [requestId, attemptId, manifestId]
      );
      await asServiceRole(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      const execute = vi.fn();
      const tick = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      expect(tick.code).toBe("blocked");
      expect(execute).not.toHaveBeenCalled();
    });

    it("R-RETRY: failed_retryable then successful retry completes stage", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      const execute = createPgBackedStorageExecutor(client, "retry_once_then_deleted");
      const tick1 = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      expect(tick1.code).toBe("in_progress");
      const tick2 = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      expect(tick2.code).toBe("storage_completed");
    });

    it("R-MISSING: legitimate missing terminal allows completion", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      await client.query(
        `DELETE FROM storage.objects WHERE bucket_id = 'journey-private-media'`
      );
      const execute = createPgBackedStorageExecutor(client, "missing");
      const tick = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      expect(tick.code).toBe("storage_completed");
      const row = await client.query<{ execution_state: string }>(
        `SELECT execution_state FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      expect(row.rows[0]?.execution_state).toBe("missing");
    });

    it("R-CRASH: expired deleting lease recovers on next claim path", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      await asServiceRole(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      const manifest = await client.query<{ id: string }>(
        `SELECT id FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND disposition = 'DELETE_PRIVATE' LIMIT 1`,
        [attemptId]
      );
      const manifestId = manifest.rows[0]!.id;
      await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [requestId, attemptId, manifestId]
      );
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET claim_lease_expires_at = now() - interval '1 minute'
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      const reclaim = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [requestId, attemptId, manifestId]
      );
      expect(reclaim.ok).toBe(true);
    });

    it("R-REPLAY: idempotent ticks without duplicate rows or regression", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      const execute = createPgBackedStorageExecutor(client, "deleted");
      await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      const count1 = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      const replay = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      expect(replay.code).toBe("already_completed");
      const count2 = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      expect(count2.rows[0]?.c).toBe(count1.rows[0]?.c);
    });

    it("R-CONCURRENT: parallel claims serialize destructive work", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      await asServiceRole(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      const result = await client.query<{ id: string; manifest_object_id: string }>(
        `SELECT id, manifest_object_id FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1 AND disposition_snapshot = 'DELETE_PRIVATE'`,
        [attemptId]
      );
      const resultId = result.rows[0]!.id;
      const clientB = new Client({ connectionString: dbUrl! });
      await clientB.connect();
      const shimA = createPgSupabaseShim(client);
      const shimB = createPgSupabaseShim(clientB);
      const exec = createPgBackedStorageExecutor(client, "deleted");
      try {
        const [a, b] = await Promise.all([
          executeAccountDeletionStorageObject(
            { requestId, attemptId, resultId },
            {
              serviceRoleClient: shimA,
              removeObjects: async () => ({ error: null }),
              objectExists: async () => ({ status: "exists" }),
              isAccountDeletionExecutionEnabled: () => true,
              isStorageExecutionEnabled: () => true,
            }
          ),
          executeAccountDeletionStorageObject(
            { requestId, attemptId, resultId },
            {
              serviceRoleClient: shimB,
              removeObjects: async () => ({ error: null }),
              objectExists: async () => ({ status: "exists" }),
              isAccountDeletionExecutionEnabled: () => true,
              isStorageExecutionEnabled: () => true,
            }
          ),
        ]);
        const successes = [a, b].filter((r) => r.ok === true).length;
        expect(successes).toBeLessThanOrEqual(1);
        void exec;
      } finally {
        await clientB.end();
      }
    });

    it("R-FLAGS: flags OFF leaves actionable work and blocks completion", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      const execute = vi.fn();
      const tick = await runTick(client, requestId, attemptId, {
        physicalEnabled: false,
        executeStorageObject: execute,
      });
      expect(tick.code).toBe("disabled");
      expect(execute).not.toHaveBeenCalled();
      expect(await getAttemptStage(client, attemptId)).toBe("storage");
    });

    it("R-FORBIDDEN: forbidden bucket rejected by authorize path", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      await asServiceRole(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET bucket = 'story-images',
             object_path = $2
         WHERE execution_attempt_id = $1
           AND disposition_snapshot = 'DELETE_PRIVATE'`,
        [attemptId, `${RUNNER_IT_TARGET}/forbidden.png`]
      );
      const badResult = await client.query<{ id: string }>(
        `SELECT id FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1 AND bucket = 'story-images'`,
        [attemptId]
      );
      const shim = createPgSupabaseShim(client);
      const outcome = await executeAccountDeletionStorageObject(
        { requestId, attemptId, resultId: badResult.rows[0]!.id },
        {
          serviceRoleClient: shim,
          removeObjects: vi.fn(),
          objectExists: vi.fn(),
          isAccountDeletionExecutionEnabled: () => true,
          isStorageExecutionEnabled: () => true,
        }
      );
      expect(outcome.ok).toBe(false);
    });

    it("R-BIND: wrong attempt/request binding rejected", async () => {
      const a = await seedDatabaseCompletedWithDeletePrivate(client, {
        deletePrivateCount: 0,
      });
      await client.query(
        `UPDATE public.account_deletion_requests
         SET status = 'approved', execution_started_at = NULL
         WHERE id = $1`,
        [a.requestId]
      );
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET status = 'failed', completed_at = now()
         WHERE id = $1`,
        [a.attemptId]
      );
      const b = await seedDatabaseCompletedWithDeletePrivate(client, {
        deletePrivateCount: 0,
      });
      const tick = await runTick(client, a.requestId, b.attemptId);
      expect(tick.code).toBe("precondition_failed");
      const advance = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [a.requestId, b.attemptId]
      );
      expect(advance.ok).toBe(false);
    });

    it("R-ATOMIC: completion RPC refuses when pending row exists", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      const execute = createPgBackedStorageExecutor(client, "deleted");
      await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: execute,
      });
      const latePath = `${RUNNER_IT_TARGET}/${RUNNER_IT_THREAD}/late-pending.mp4`;
      await insertJourneyObject(client, latePath);
      await insertSyntheticManifestRow(client, {
        requestId,
        attemptId,
        objectPath: latePath,
        disposition: "DELETE_PRIVATE",
      });
      await client.query(
        `INSERT INTO public.account_deletion_storage_execution_results (
          deletion_request_id, execution_attempt_id, manifest_object_id, target_user_id,
          bucket, object_path, disposition_snapshot, preservation_required_snapshot, execution_state
        )
        SELECT $1,$2,m.id,$3,m.bucket,m.object_path,m.disposition,false,'pending'
        FROM public.account_deletion_storage_manifest m
        WHERE m.object_path = $4`,
        [
          requestId,
          attemptId,
          RUNNER_IT_TARGET,
          latePath,
        ]
      );
      await client.query(
        `UPDATE public.account_deletion_execution_attempts SET stage = 'storage' WHERE id = $1`,
        [attemptId]
      );
      const complete = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage_completed($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(complete.ok).toBe(false);
    });

    it("R-CONCURRENCY-A: claim locks attempt; completion blocks then refuses deleting", async () => {
      const { requestId, attemptId, manifestObjectId } =
        await seedStorageStageWithPendingDeletePrivate(client);

      const holder = new Client({ connectionString: dbUrl! });
      const completer = new Client({ connectionString: dbUrl! });
      await holder.connect();
      await completer.connect();
      try {
        await beginServiceRoleTransaction(holder);
        const claim = await serviceRoleRpcInOpenTransaction<RpcPayload>(
          holder,
          `SELECT public.claim_account_deletion_storage_execution_object(
            $1::uuid, $2::uuid, $3::uuid, 900
          ) AS payload`,
          [requestId, attemptId, manifestObjectId]
        );
        expect(claim.ok).toBe(true);

        await beginServiceRoleTransaction(completer);
        let completeResolved = false;
        const completePromise = serviceRoleRpcInOpenTransaction<RpcPayload>(
          completer,
          `SELECT public.advance_account_deletion_attempt_to_storage_completed(
            $1::uuid, $2::uuid
          ) AS payload`,
          [requestId, attemptId]
        ).then((payload) => {
          completeResolved = true;
          return payload;
        });

        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(completeResolved).toBe(false);

        await holder.query("COMMIT");
        const complete = await completePromise;
        expect(complete.ok).toBe(false);
        expect(complete.code).toBe("storage_execution_not_terminal");

        await completer.query("ROLLBACK");
      } finally {
        await holder.end();
        await completer.end();
      }
    });

    it("R-CONCURRENCY-B: completion locks attempt; claim blocks then rejects stage", async () => {
      const { requestId, attemptId, manifestObjectId } =
        await seedStorageStageWithPendingDeletePrivate(client);
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET execution_state = 'deleted', completed_at = now()
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );

      const completer = new Client({ connectionString: dbUrl! });
      const claimer = new Client({ connectionString: dbUrl! });
      await completer.connect();
      await claimer.connect();
      try {
        await beginServiceRoleTransaction(completer);
        const complete = await serviceRoleRpcInOpenTransaction<RpcPayload>(
          completer,
          `SELECT public.advance_account_deletion_attempt_to_storage_completed(
            $1::uuid, $2::uuid
          ) AS payload`,
          [requestId, attemptId]
        );
        expect(complete.ok).toBe(true);

        await beginServiceRoleTransaction(claimer);
        let claimResolved = false;
        const claimPromise = serviceRoleRpcInOpenTransaction<RpcPayload>(
          claimer,
          `SELECT public.claim_account_deletion_storage_execution_object(
            $1::uuid, $2::uuid, $3::uuid, 900
          ) AS payload`,
          [requestId, attemptId, manifestObjectId]
        ).then((payload) => {
          claimResolved = true;
          return payload;
        });

        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(claimResolved).toBe(false);

        await completer.query("COMMIT");
        const claim = await claimPromise;
        expect(claim.ok).toBe(false);
        expect(claim.code).toBe("attempt_mismatch");

        await claimer.query("ROLLBACK");
      } finally {
        await completer.end();
        await claimer.end();
      }
    });

    it.each([
      ["blocked", "BLOCK_UNRESOLVED"],
      ["blocked_on_hold", "DELETE_PRIVATE"],
      ["failed_terminal", "DELETE_PRIVATE"],
    ] as const)("R-HARD-BLOCKERS: %s prevents completion", async (state, disposition) => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 0 }
      );
      const objectPath = `${RUNNER_IT_TARGET}/${RUNNER_IT_THREAD}/hb-${state}.mp4`;
      if (disposition === "DELETE_PRIVATE") {
        await insertJourneyObject(client, objectPath);
      }
      const manifestId = await insertSyntheticManifestRow(client, {
        requestId,
        attemptId,
        objectPath,
        disposition,
      });
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      if (state === "blocked_on_hold") {
        await client.query(
          `UPDATE public.account_deletion_storage_execution_results
           SET execution_state = 'blocked_on_hold'
           WHERE manifest_object_id = $1`,
          [manifestId]
        );
      } else if (state === "failed_terminal") {
        await client.query(
          `UPDATE public.account_deletion_storage_execution_results
           SET execution_state = 'failed_terminal'
           WHERE manifest_object_id = $1`,
          [manifestId]
        );
      }
      await asServiceRole(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      const complete = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage_completed($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(complete.ok).toBe(false);
    });

    it("R-ACTIONABLE: pending and failed_retryable are not hard blockers", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      await asServiceRole(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET execution_state = 'failed_retryable'
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      const tick = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: createPgBackedStorageExecutor(client, "deleted"),
      });
      expect(tick.code).not.toBe("blocked");
    });

    it("R-DELETING: in-progress deleting prevents completion", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      await asServiceRole(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET execution_state = 'deleting', claim_token = gen_random_uuid(),
             claim_lease_expires_at = now() + interval '10 minutes'
         WHERE execution_attempt_id = $1`,
        [attemptId]
      );
      const tick = await runTick(client, requestId, attemptId, {
        physicalEnabled: true,
        executeStorageObject: createPgBackedStorageExecutor(client, "deleted"),
      });
      expect(tick.code).toBe("in_progress");
      const complete = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage_completed($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(complete.ok).toBe(false);
    });

    it("R-COUNT-MISMATCH: manifest/result count mismatch refuses completion", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      const template = await client.query<{ id: string }>(
        `SELECT id FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND disposition = 'DELETE_PRIVATE' LIMIT 1`,
        [attemptId]
      );
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      await cloneDeletePrivateManifestRow(
        client,
        requestId,
        attemptId,
        template.rows[0]!.id,
        "orphan-only"
      );
      await asServiceRole(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      const complete = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage_completed($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(complete.ok).toBe(false);
    });

    it("R-STAGE-GUARDS: destructive RPCs require storage stage", async () => {
      const { requestId, attemptId } = await seedDatabaseCompletedWithDeletePrivate(
        client,
        { deletePrivateCount: 1 }
      );
      await initResultsAtDatabaseCompleted(client, requestId, attemptId);
      const manifest = await client.query<{ id: string }>(
        `SELECT id FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND disposition = 'DELETE_PRIVATE' LIMIT 1`,
        [attemptId]
      );
      const result = await client.query<{ id: string }>(
        `SELECT id FROM public.account_deletion_storage_execution_results
         WHERE manifest_object_id = $1`,
        [manifest.rows[0]!.id]
      );
      const claimAtDb = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_object($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [requestId, attemptId, manifest.rows[0]!.id]
      );
      expect(claimAtDb.ok).toBe(false);
      const initAtDatabaseCompleted = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.initialize_account_deletion_storage_execution_results($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(initAtDatabaseCompleted.ok).toBe(true);
      expect(initAtDatabaseCompleted.code).toBe("initialized");
      await asServiceRole(
        client,
        `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      const initAtStorage = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.initialize_account_deletion_storage_execution_results($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(initAtStorage.code).toBe("invalid_stage");
      const claimAtStorage = await asServiceRole<RpcPayload>(
        client,
        `SELECT public.claim_account_deletion_storage_execution_result($1::uuid,$2::uuid,$3::uuid,900) AS payload`,
        [requestId, attemptId, result.rows[0]!.id]
      );
      expect(claimAtStorage.ok).toBe(true);
    });
  }
);

describe("accountDeletionStorageStageRunner.integration guards", () => {
  it("refuses local Supabase app DB port 54322", () => {
    expect(
      isDedicatedVanillaIntegrationDb("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    ).toBe(false);
    expect(
      isDedicatedVanillaIntegrationDb("postgresql://postgres:postgres@localhost:54322/postgres")
    ).toBe(false);
  });

  it("R-SURFACE: runner not imported by orchestrator or app/api patterns", () => {
    const orchestrator = readFileSync(
      path.join(import.meta.dirname, "accountDeletionExecutionOrchestrator.ts"),
      "utf8"
    );
    expect(orchestrator).not.toContain("accountDeletionStorageStageRunner");
    const runner = readFileSync(
      path.join(import.meta.dirname, "accountDeletionStorageStageRunner.ts"),
      "utf8"
    );
    expect(runner).toContain('import "server-only"');
    expect(ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE).toBe(50);
  });
});
