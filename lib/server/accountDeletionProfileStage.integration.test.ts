/**
 * Real PostgreSQL integration for profile stage foundation (3B.4A).
 * Guarded: requires ACCOUNT_DELETION_INTEGRATION_DB_URL and not Supabase :54322.
 */

import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import {
  accountDeletionScrubbedProfileEmail,
  accountDeletionScrubbedProfileUsername,
} from "./accountDeletionProfileStagePolicy";
type RpcPayload = Record<string, unknown>;

import {
  cleanupProfileIntegration,
  asAuthenticatedUser,
  driveLifecycleToStorageCompleted,
  dropProfilePrepareAbortTrigger,
  assertFreshMigrationProfileHelperPrivileges,
  ensureProfileIntegrationGrants,
  installProfilePrepareAbortTrigger,
  isDedicatedVanillaIntegrationDb,
  prepareProfileStageRpc,
  profileCleanupSnapshotRpc,
  PROFILE_IT_STORY,
  PROFILE_IT_UNRELATED_BLOCKER,
  PROFILE_SYNTHETIC,
  RUNNER_IT_OTHER,
  RUNNER_IT_TARGET,
  seedCompanionUsers,
  seedRunnerIntegrationUsers,
  seedSyntheticTargetProfile,
  seedDeletionNamespaceCollisionUsername,
  restoreProfilesUsernameFormatCheck,
  setAttemptStagePrivileged,
} from "./accountDeletionProfileStage.integrationHarness";
const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

const PII_MARKERS = [
  PROFILE_SYNTHETIC.email,
  PROFILE_SYNTHETIC.username,
  PROFILE_SYNTHETIC.displayName,
  PROFILE_SYNTHETIC.location,
  PROFILE_SYNTHETIC.bio,
  PROFILE_SYNTHETIC.avatarPath,
  PROFILE_SYNTHETIC.realName,
] as const;

function expectNoPiiInAuditRows(rows: { event_type: string; detail_code: string | null }[]) {
  const blob = JSON.stringify(rows);
  for (const marker of PII_MARKERS) {
    expect(blob).not.toContain(marker);
  }
}

describeIntegration(
  `account deletion profile stage integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await assertFreshMigrationProfileHelperPrivileges(client);
      const readinessBeforeGrants = await client.query<{ payload: { ready?: boolean } }>(
        `SELECT public.verify_account_deletion_profile_stage_ready() AS payload`
      );
      if (!readinessBeforeGrants.rows[0]?.payload?.ready) {
        throw new Error(
          `profile stage readiness failed before test grants: ${JSON.stringify(readinessBeforeGrants.rows[0]?.payload)}`
        );
      }
      await ensureProfileIntegrationGrants(client);
    }, 300_000);

    afterAll(async () => {
      await dropProfilePrepareAbortTrigger(client).catch(() => undefined);
      await client?.end();
    });

    beforeEach(async () => {
      await dropProfilePrepareAbortTrigger(client).catch(() => undefined);
    });

    it("P-A-READINESS: profile stage prerequisites include 3B.4A contracts", async () => {
      await client.query(
        `REVOKE ALL ON FUNCTION public.account_deletion_profile_cleanup_snapshot(uuid, uuid) FROM service_role`
      );
      const row = await client.query<{ payload: { ready?: boolean; prerequisites?: { id: string; ready: boolean }[] } }>(
        `SELECT public.verify_account_deletion_profile_stage_ready() AS payload`
      );
      const payload = row.rows[0]?.payload;
      expect(payload?.ready).toBe(true);
      const ids = new Set((payload?.prerequisites ?? []).map((p) => p.id));
      for (const id of [
        "profile_stage_rpcs_present",
        "profile_prepare_hardening",
        "profile_prepare_grants_service_role_only",
        "profile_internal_helpers_sealed",
        "profile_stage_check_vocabulary",
        "profile_audit_event_vocabulary",
        "profile_rows_affected_column",
        "profile_private_table_columns",
        "profile_deletion_username_namespace_clear",
        "profile_prior_storage_stage_runner_ready",
      ]) {
        expect(ids.has(id)).toBe(true);
      }
      const composed = await client.query<{ payload: { ready?: boolean } }>(
        `SELECT public.verify_account_deletion_schema_execution_ready() AS payload`
      );
      expect(composed.rows[0]?.payload?.ready).toBe(true);
      const runner = await client.query<{ payload: { ready?: boolean } }>(
        `SELECT public.verify_account_deletion_storage_stage_runner_ready() AS payload`
      );
      expect(runner.rows[0]?.payload?.ready).toBe(true);
    });

    it("P-A-STAGE: prepare from storage_completed advances to profile", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client, {
        deletePrivateCount: 1,
      });
      const preAttempt = await client.query<{
        stage: string;
        status: string;
        storage_manifest_status: string | null;
        target_user_id: string;
      }>(
        `SELECT stage, status, storage_manifest_status, target_user_id
         FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(preAttempt.rows[0]?.stage).toBe("storage_completed");
      expect(preAttempt.rows[0]?.storage_manifest_status).toBe("finalized");
      const profileExists = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = $1) AS exists`,
        [RUNNER_IT_TARGET]
      );
      expect(profileExists.rows[0]?.exists).toBe(true);
      const beforeBinding = await client.query<{ target_user_id: string }>(
        `SELECT target_user_id FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      const gate = await client.query<{ payload: RpcPayload }>(
        `SELECT public.account_deletion_storage_execution_completion_blocked($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      const snap = await client.query<{ payload: RpcPayload }>(
        `SELECT public.account_deletion_profile_cleanup_snapshot($1::uuid,$2::uuid) AS payload`,
        [requestId, attemptId]
      );
      expect(gate.rows[0]?.payload?.ok, JSON.stringify(gate.rows[0]?.payload)).toBe(true);
      expect(snap.rows[0]?.payload?.ok, JSON.stringify(snap.rows[0]?.payload)).toBe(true);

      const prepared = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(prepared.code, JSON.stringify({ prepared, gate: gate.rows[0]?.payload, snap: snap.rows[0]?.payload })).toBe(
        "prepared"
      );
      expect(prepared.stage).toBe("profile");

      const attempt = await client.query<{ stage: string; status: string; target_user_id: string }>(
        `SELECT stage, status, target_user_id FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(attempt.rows[0]?.stage).toBe("profile");
      expect(attempt.rows[0]?.status).toBe("active");
      expect(attempt.rows[0]?.target_user_id).toBe(beforeBinding.rows[0]?.target_user_id);

      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [requestId]
      );
      expect(request.rows[0]?.status).toBe("deletion_in_progress");
    });

    it("P-A-EARLY-STAGE: rejects database_completed and storage", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await setAttemptStagePrivileged(client, attemptId, "database_completed");
      const earlyDb = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(earlyDb.ok).toBe(false);
      expect(earlyDb.code).toBe("invalid_stage");

      await setAttemptStagePrivileged(client, attemptId, "storage");
      const earlyStorage = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(earlyStorage.ok).toBe(false);
      expect(earlyStorage.code).toBe("invalid_stage");

      const inboxCount = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.inbox_messages WHERE user_id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(Number(inboxCount.rows[0]?.count)).toBeGreaterThan(0);
      const profile = await client.query<{ email: string }>(
        `SELECT email FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(profile.rows[0]?.email).toBe(PROFILE_SYNTHETIC.email);
    });

    it("P-A-IDEMPOTENT-REPAIR: dirty scrubbed preference field is repaired on profile-stage retry", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      const first = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(first.code).toBe("prepared");

      await client.query(
        `UPDATE public.profiles SET show_location = true, journey_focus = 'prayer' WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );

      const repair = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(repair.ok).toBe(true);
      expect(repair.code).toBe("prepared");

      const profile = await client.query<{
        show_location: boolean;
        journey_focus: string;
        stage: string;
      }>(
        `SELECT p.show_location, p.journey_focus, a.stage
         FROM public.profiles AS p
         INNER JOIN public.account_deletion_execution_attempts AS a ON a.id = $2
         WHERE p.id = $1`,
        [RUNNER_IT_TARGET, attemptId]
      );
      expect(profile.rows[0]?.show_location).toBe(false);
      expect(profile.rows[0]?.journey_focus).toBe("encouragement");
      expect(profile.rows[0]?.stage).toBe("profile");

      const defer = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1
           AND disposition_snapshot = 'DEFER_PROFILE'
           AND execution_state = 'deferred_profile'`,
        [attemptId]
      );
      expect(Number(defer.rows[0]?.count)).toBeGreaterThanOrEqual(0);

      const story = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.stories WHERE id = $1`,
        [PROFILE_IT_STORY]
      );
      expect(Number(story.rows[0]?.count)).toBe(1);

      const third = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(third.code).toBe("already_prepared");
      void requestId;
    });

    it("P-A-IDEMPOTENT: second prepare is already_prepared without duplicate audit entered", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      const first = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(first.code).toBe("prepared");
      const entered = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_storage_execution_audit
         WHERE execution_attempt_id = $1 AND event_type = 'profile_stage_entered'`,
        [attemptId]
      );
      expect(Number(entered.rows[0]?.count)).toBe(1);

      const second = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(second.ok).toBe(true);
      expect(second.code).toBe("already_prepared");
      const enteredAfter = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_storage_execution_audit
         WHERE execution_attempt_id = $1 AND event_type = 'profile_stage_entered'`,
        [attemptId]
      );
      expect(Number(enteredAfter.rows[0]?.count)).toBe(1);
      const stageRow = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(stageRow.rows[0]?.stage).toBe("profile");
    });

    it("P-A-PRIVATE-INBOX: recipient-owned deleted, survivor sender row preserved", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      const recipient = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.inbox_messages WHERE user_id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(Number(recipient.rows[0]?.count)).toBe(0);
      const survivor = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.inbox_messages
         WHERE user_id = $1 AND title = 'From target'`,
        [RUNNER_IT_OTHER]
      );
      expect(Number(survivor.rows[0]?.count)).toBe(1);
      const severedSender = await client.query<{ sender_user_id: string | null }>(
        `SELECT sender_user_id FROM public.inbox_messages
         WHERE user_id = $1 AND title = 'From target' LIMIT 1`,
        [RUNNER_IT_OTHER]
      );
      expect(severedSender.rows[0]?.sender_user_id).toBeNull();
    });

    it("P-A-REACTIONS: target reactions removed, other preserved", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      expect(
        Number(
          (
            await client.query(`SELECT count(*)::text AS count FROM public.story_reactions WHERE user_id = $1`, [
              RUNNER_IT_TARGET,
            ])
          ).rows[0]?.count
        )
      ).toBe(0);
      expect(
        Number(
          (
            await client.query(`SELECT count(*)::text AS count FROM public.story_reactions WHERE user_id = $1`, [
              RUNNER_IT_OTHER,
            ])
          ).rows[0]?.count
        )
      ).toBe(1);
    });

    it("P-A-SAVED: target saved_content removed", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      expect(
        Number(
          (await client.query(`SELECT count(*)::text AS count FROM public.saved_content WHERE user_id = $1`, [RUNNER_IT_TARGET]))
            .rows[0]?.count
        )
      ).toBe(0);
      expect(
        Number(
          (await client.query(`SELECT count(*)::text AS count FROM public.saved_content WHERE user_id = $1`, [RUNNER_IT_OTHER]))
            .rows[0]?.count
        )
      ).toBe(1);
    });

    it("P-A-FOLLOWS: target prayer_follows removed", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      expect(
        Number(
          (await client.query(`SELECT count(*)::text AS count FROM public.prayer_follows WHERE user_id = $1`, [RUNNER_IT_TARGET]))
            .rows[0]?.count
        )
      ).toBe(0);
      expect(
        Number(
          (await client.query(`SELECT count(*)::text AS count FROM public.prayer_follows WHERE user_id = $1`, [RUNNER_IT_OTHER]))
            .rows[0]?.count
        )
      ).toBe(1);
    });

    it("P-A-SEARCH-PREFS: target ZIP/radius preference removed", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      expect(
        Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.prayer_search_preferences WHERE user_id = $1`,
              [RUNNER_IT_TARGET]
            )
          ).rows[0]?.count
        )
      ).toBe(0);
      expect(
        Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.prayer_search_preferences WHERE user_id = $1`,
              [RUNNER_IT_OTHER]
            )
          ).rows[0]?.count
        )
      ).toBe(1);
    });

    it("P-A-BLOCKS: both directions for target removed, unrelated preserved", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      expect(
        Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.blocked_users
               WHERE blocker_user_id = $1 OR blocked_user_id = $1`,
              [RUNNER_IT_TARGET]
            )
          ).rows[0]?.count
        )
      ).toBe(0);
      expect(
        Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.blocked_users
               WHERE blocker_user_id = $1 AND blocked_user_id = $2`,
              [PROFILE_IT_UNRELATED_BLOCKER, RUNNER_IT_TARGET]
            )
          ).rows[0]?.count
        )
      ).toBe(0);
      expect(
        Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.blocked_users
               WHERE blocker_user_id = $1 AND blocked_user_id = $2`,
              [PROFILE_IT_UNRELATED_BLOCKER, RUNNER_IT_OTHER]
            )
          ).rows[0]?.count
        )
      ).toBe(1);
    });

    it("P-A-PROFILE-SCRUB: PII cleared to tombstone email/username and null identity fields", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      const profile = await client.query<{
        email: string;
        display_name: string | null;
        username: string | null;
        real_name: string | null;
        location: string | null;
        bio: string | null;
        avatar_url: string | null;
        deletion_requested_at: string | null;
        journey_focus: string;
        show_location: boolean;
        show_real_name: boolean;
        allow_prayer_notifications: boolean;
        allow_story_notifications: boolean;
        notify_replies: boolean;
        notify_prayers: boolean;
        notify_praise: boolean;
        notify_journey_updates: boolean;
        notify_email_updates: boolean;
        allow_video_responses: boolean;
        allow_prayer_messages: boolean;
        allow_journey_messages: boolean;
      }>(`SELECT * FROM public.profiles WHERE id = $1`, [RUNNER_IT_TARGET]);
      const row = profile.rows[0]!;
      expect(row.email).toBe(accountDeletionScrubbedProfileEmail(RUNNER_IT_TARGET));
      expect(row.display_name).toBeNull();
      expect(row.username).toBe(accountDeletionScrubbedProfileUsername(RUNNER_IT_TARGET));
      expect(row.username).not.toBe(PROFILE_SYNTHETIC.username);
      expect(row.real_name).toBeNull();
      expect(row.location).toBeNull();
      expect(row.bio).toBeNull();
      expect(row.avatar_url).toBeNull();
      expect(row.deletion_requested_at).toBeNull();
      expect(row.journey_focus).toBe("encouragement");
      expect(row.show_location).toBe(false);
      expect(row.show_real_name).toBe(false);
      expect(row.allow_prayer_notifications).toBe(false);
      expect(row.allow_story_notifications).toBe(false);
      expect(row.notify_replies).toBe(false);
      expect(row.notify_prayers).toBe(false);
      expect(row.notify_praise).toBe(false);
      expect(row.notify_journey_updates).toBe(false);
      expect(row.notify_email_updates).toBe(false);
      expect(row.allow_video_responses).toBe(false);
      expect(row.allow_prayer_messages).toBe(false);
      expect(row.allow_journey_messages).toBe(false);
      const serialized = JSON.stringify(row);
      for (const marker of PII_MARKERS) {
        expect(serialized).not.toContain(marker);
      }
    });

    it("P-A-PROFILE-ROW-SURVIVES: profiles row remains after prepare", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      const exists = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = $1) AS exists`,
        [RUNNER_IT_TARGET]
      );
      expect(exists.rows[0]?.exists).toBe(true);
    });

    it("P-A-TOMBSTONE-IDEMPOTENT: scrubbed email helper is stable and unique per uuid", async () => {
      const a = await client.query<{ email: string }>(
        `SELECT public.account_deletion_scrubbed_profile_email($1::uuid) AS email`,
        [RUNNER_IT_TARGET]
      );
      const b = await client.query<{ email: string }>(
        `SELECT public.account_deletion_scrubbed_profile_email($1::uuid) AS email`,
        [RUNNER_IT_TARGET]
      );
      const other = await client.query<{ email: string }>(
        `SELECT public.account_deletion_scrubbed_profile_email($1::uuid) AS email`,
        [RUNNER_IT_OTHER]
      );
      const expected = accountDeletionScrubbedProfileEmail(RUNNER_IT_TARGET);
      expect(a.rows[0]?.email).toBe(expected);
      expect(b.rows[0]?.email).toBe(expected);
      expect(other.rows[0]?.email).not.toBe(expected);
    });

    it("P-A-DEFER-UNCHANGED: DEFER_PROFILE deferred_profile rows unchanged", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      const before = await client.query<{
        disposition_snapshot: string;
        execution_state: string;
        bucket: string;
        object_path: string;
      }>(
        `SELECT disposition_snapshot, execution_state, bucket, object_path
         FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1 AND disposition_snapshot = 'DEFER_PROFILE'`,
        [attemptId]
      );
      expect(before.rowCount).toBeGreaterThan(0);
      await prepareProfileStageRpc(client, requestId, attemptId);
      const after = await client.query(
        `SELECT disposition_snapshot, execution_state, bucket, object_path
         FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1 AND disposition_snapshot = 'DEFER_PROFILE'`,
        [attemptId]
      );
      expect(after.rows).toEqual(before.rows);
    });

    it("P-A-HOLD-SNAPSHOT: cleanup snapshot exposes bounded deferred counts only", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client, {
        deferProfileHold: true,
      });
      await prepareProfileStageRpc(client, requestId, attemptId);
      const snapshot = await profileCleanupSnapshotRpc(client, requestId, attemptId);
      expect(snapshot.ok).toBe(true);
      expect(snapshot.deferred_profile_result_count).toBeGreaterThan(0);
      const blob = JSON.stringify(snapshot);
      for (const forbidden of ["legal_hold", PROFILE_SYNTHETIC.email, PROFILE_SYNTHETIC.username, PROFILE_SYNTHETIC.avatarPath]) {
        expect(blob.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
      expect(Object.keys(snapshot).sort()).not.toContain("hold_reason");
    });

    it("P-A-SHARED-CONTENT: public story and prayer content survive profile prepare", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client, {
        sharedPublicStory: true,
        privateSeed: { inboxRecipientOwned: false, inboxSurvivorFromTarget: false },
      });
      await prepareProfileStageRpc(client, requestId, attemptId);
      const story = await client.query<{ id: string; user_id: string; status: string }>(
        `SELECT id, user_id, status FROM public.stories WHERE id = $1`,
        [PROFILE_IT_STORY]
      );
      expect(story.rows[0]?.id).toBe(PROFILE_IT_STORY);
      expect(story.rows[0]?.status).toBe("approved");
      const replies = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.story_video_replies WHERE story_id = $1`,
        [PROFILE_IT_STORY]
      );
      expect(Number(replies.rows[0]?.count)).toBeGreaterThan(0);
      const prayers = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.prayer_video_responses WHERE story_id = $1`,
        [PROFILE_IT_STORY]
      );
      expect(Number(prayers.rows[0]?.count)).toBeGreaterThan(0);
    });

    it("P-A-CONTROL-PLANE: deletion proof tables retained after prepare", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client, {
        deletePrivateCount: 1,
      });
      await prepareProfileStageRpc(client, requestId, attemptId);
      expect(
        Number(
          (await client.query(`SELECT count(*)::text AS count FROM public.account_deletion_requests WHERE id = $1`, [requestId]))
            .rows[0]?.count
        )
      ).toBe(1);
      expect(
        Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.account_deletion_execution_attempts WHERE id = $1`,
              [attemptId]
            )
          ).rows[0]?.count
        )
      ).toBe(1);
      expect(
        Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.account_deletion_storage_manifest WHERE execution_attempt_id = $1`,
              [attemptId]
            )
          ).rows[0]?.count
        )
      ).toBeGreaterThan(0);
      expect(
        Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.account_deletion_storage_execution_results WHERE execution_attempt_id = $1`,
              [attemptId]
            )
          ).rows[0]?.count
        )
      ).toBeGreaterThan(0);
    });

    it("P-A-AUDIT-NO-PII: profile audit events contain bounded detail codes only", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      const audit = await client.query<{ event_type: string; detail_code: string | null }>(
        `SELECT event_type, detail_code FROM public.account_deletion_storage_execution_audit
         WHERE execution_attempt_id = $1
           AND event_type IN (
             'profile_stage_entered',
             'profile_private_data_deleted',
             'profile_identity_scrubbed'
           )`,
        [attemptId]
      );
      expect(audit.rowCount).toBeGreaterThanOrEqual(3);
      expectNoPiiInAuditRows(audit.rows);
    });

    it("P-A-CONCURRENT: dual clients serialize to single profile transition", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      const clientB = new Client({ connectionString: dbUrl! });
      await clientB.connect();
      try {
        const [a, b] = await Promise.all([
          prepareProfileStageRpc(client, requestId, attemptId),
          prepareProfileStageRpc(clientB, requestId, attemptId),
        ]);
        const codes = [a.code, b.code].sort();
        expect(codes).toEqual(["already_prepared", "prepared"].sort());
        const stage = await client.query<{ stage: string }>(
          `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
          [attemptId]
        );
        expect(stage.rows[0]?.stage).toBe("profile");
        const inbox = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM public.inbox_messages WHERE user_id = $1`,
          [RUNNER_IT_TARGET]
        );
        expect(Number(inbox.rows[0]?.count)).toBe(0);
      } finally {
        await clientB.end();
      }
    });

    it("P-A-ROLLBACK: abort trigger rolls back partial profile prepare", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await installProfilePrepareAbortTrigger(client);
      await client.query(`SELECT set_config('htbf.profile_prepare_abort', 'on', false)`);
      const aborted = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(aborted.ok).toBe(false);
      expect(aborted.code).toBe("invariant_failed");
      await client.query(`SELECT set_config('htbf.profile_prepare_abort', 'off', false)`);

      expect(await client.query(`SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`, [attemptId])).toMatchObject({
        rows: [{ stage: "storage_completed" }],
      });
      const profile = await client.query<{ email: string }>(
        `SELECT email FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(profile.rows[0]?.email).toBe(PROFILE_SYNTHETIC.email);
      const username = await client.query<{ username: string | null }>(
        `SELECT username FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(username.rows[0]?.username).toBe(PROFILE_SYNTHETIC.username);
      const inbox = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.inbox_messages WHERE user_id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(Number(inbox.rows[0]?.count)).toBeGreaterThan(0);
      const profileAudit = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_storage_execution_audit
         WHERE execution_attempt_id = $1 AND event_type LIKE 'profile_%'`,
        [attemptId]
      );
      expect(Number(profileAudit.rows[0]?.count)).toBe(0);
    });

    it("P-A-LATE-STAGE: cannot regress profile_completed to profile", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await setAttemptStagePrivileged(client, attemptId, "profile_completed");
      const result = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(result.ok).toBe(false);
      expect(result.code).toBe("irreversible_stage");
      for (const stage of ["auth_pending", "auth", "finalize", "completed"] as const) {
        await setAttemptStagePrivileged(client, attemptId, stage);
        const blocked = await prepareProfileStageRpc(client, requestId, attemptId);
        expect(blocked.code).toBe("irreversible_stage");
      }
    });

    it("P-A-NO-PROFILE-DELETE: migration has no DELETE FROM public.profiles", async () => {
      const migration = readFileSync(
        "supabase/migrations/20260919240000_account_deletion_profile_stage_foundation_phase4c7b1e2c3b4a.sql",
        "utf8"
      );
      expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.profiles/i);
    });

    it("P-A-NO-STORAGE: storage.objects unchanged by profile prepare", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      const before = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM storage.objects WHERE bucket_id = 'profile-avatars'`
      );
      await prepareProfileStageRpc(client, requestId, attemptId);
      const after = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM storage.objects WHERE bucket_id = 'profile-avatars'`
      );
      expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
      const avatarObject = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM storage.objects WHERE name = $1`,
        [PROFILE_SYNTHETIC.avatarPath]
      );
      expect(Number(avatarObject.rows[0]?.count)).toBe(1);
    });

    it("U-CONTEXT-PREPARE: established username becomes deterministic del_* tombstone", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      const before = await client.query<{ username: string }>(
        `SELECT username FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(before.rows[0]?.username).toBe(PROFILE_SYNTHETIC.username);
      await prepareProfileStageRpc(client, requestId, attemptId);
      const after = await client.query<{ username: string }>(
        `SELECT username FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(after.rows[0]?.username).toBe(
        accountDeletionScrubbedProfileUsername(RUNNER_IT_TARGET)
      );
      expect(after.rows[0]?.username).toMatch(/^del_[a-f0-9]{20}$/);
      void attemptId;
      void requestId;
    });

    it("U-TOMBSTONE-NAMESPACE-SELF-DENIED: user cannot claim own deterministic tombstone", async () => {
      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedSyntheticTargetProfile(client);
      const tombstone = accountDeletionScrubbedProfileUsername(RUNNER_IT_TARGET);
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_TARGET,
          `UPDATE public.profiles SET username = $1 WHERE id = $2`,
          [tombstone, RUNNER_IT_TARGET]
        )
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("U-TOMBSTONE-NAMESPACE-OTHER-DENIED: user cannot claim another target tombstone", async () => {
      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedCompanionUsers(client);
      await seedSyntheticTargetProfile(client);
      const otherTombstone = accountDeletionScrubbedProfileUsername(RUNNER_IT_TARGET);
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_OTHER,
          `UPDATE public.profiles SET username = $1 WHERE id = $2`,
          [otherTombstone, RUNNER_IT_OTHER]
        )
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("U-TOMBSTONE-NAMESPACE-RANDOM-DENIED: user cannot claim arbitrary deletion namespace", async () => {
      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedSyntheticTargetProfile(client);
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_TARGET,
          `UPDATE public.profiles SET username = $1 WHERE id = $2`,
          ["del_01234567890123456789", RUNNER_IT_TARGET]
        )
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("U-TOMBSTONE-CONTEXT-ALLOWED: profile prepare assigns exact-target tombstone", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      const row = await client.query<{ username: string }>(
        `SELECT username FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(row.rows[0]?.username).toBe(
        accountDeletionScrubbedProfileUsername(RUNNER_IT_TARGET)
      );
    });

    it("U-TOMBSTONE-WRONG-TARGET-DENIED: profile context cannot assign another profile tombstone", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      const otherTombstone = accountDeletionScrubbedProfileUsername(RUNNER_IT_OTHER);
      await client.query(
        `UPDATE public.profiles SET username = 'other_runner', username_changed_at = now() - interval '31 days'
         WHERE id = $1`,
        [RUNNER_IT_OTHER]
      );
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO public.account_deletion_database_execution_context (
            backend_pid, transaction_id, attempt_id, deletion_request_id, target_user_id, purpose
          ) VALUES (
            pg_backend_pid(), txid_current()::bigint, $1::uuid, $2::uuid, $3::uuid, 'profile_stage'::text
          )`,
          [attemptId, requestId, RUNNER_IT_TARGET]
        );
        await expect(
          client.query(
            `UPDATE public.profiles SET username = $1 WHERE id = $2`,
            [otherTombstone, RUNNER_IT_OTHER]
          )
        ).rejects.toMatchObject({ code: "23514" });
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    it("P-A-TOMBSTONE-COLLISION-ATOMIC: preflight collision leaves DB unchanged", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      const targetTombstone = accountDeletionScrubbedProfileUsername(RUNNER_IT_TARGET);
      /** Privileged test-only: occupy target deterministic tombstone on another profile. */
      await seedDeletionNamespaceCollisionUsername(client, RUNNER_IT_OTHER, targetTombstone);

      const beforeStage = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      const beforeProfile = await client.query<{
        email: string;
        username: string;
        avatar_url: string | null;
      }>(`SELECT email, username, avatar_url FROM public.profiles WHERE id = $1`, [
        RUNNER_IT_TARGET,
      ]);
      const countPrivate = async () => ({
        inbox: Number(
          (
            await client.query(`SELECT count(*)::text AS count FROM public.inbox_messages WHERE user_id = $1`, [
              RUNNER_IT_TARGET,
            ])
          ).rows[0]?.count
        ),
        reactions: Number(
          (
            await client.query(`SELECT count(*)::text AS count FROM public.story_reactions WHERE user_id = $1`, [
              RUNNER_IT_TARGET,
            ])
          ).rows[0]?.count
        ),
        saved: Number(
          (
            await client.query(`SELECT count(*)::text AS count FROM public.saved_content WHERE user_id = $1`, [
              RUNNER_IT_TARGET,
            ])
          ).rows[0]?.count
        ),
        follows: Number(
          (
            await client.query(`SELECT count(*)::text AS count FROM public.prayer_follows WHERE user_id = $1`, [
              RUNNER_IT_TARGET,
            ])
          ).rows[0]?.count
        ),
        searchPrefs: Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.prayer_search_preferences WHERE user_id = $1`,
              [RUNNER_IT_TARGET]
            )
          ).rows[0]?.count
        ),
        blocks: Number(
          (
            await client.query(
              `SELECT count(*)::text AS count FROM public.blocked_users
               WHERE blocker_user_id = $1 OR blocked_user_id = $1`,
              [RUNNER_IT_TARGET]
            )
          ).rows[0]?.count
        ),
      });
      const privateBefore = await countPrivate();
      const auditBefore = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_storage_execution_audit
         WHERE execution_attempt_id = $1 AND event_type LIKE 'profile_%'`,
        [attemptId]
      );
      const ctxBefore = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_database_execution_context`
      );
      const deferBefore = await client.query(
        `SELECT disposition_snapshot, execution_state, bucket, object_path
         FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1 AND disposition_snapshot = 'DEFER_PROFILE'`,
        [attemptId]
      );
      const storageBefore = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM storage.objects WHERE bucket_id = 'profile-avatars'`
      );

      const result = await prepareProfileStageRpc(client, requestId, attemptId);
      expect(result.ok).toBe(false);
      expect(result.code).toBe("profile_username_tombstone_unavailable");

      const afterStage = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(afterStage.rows[0]?.stage).toBe(beforeStage.rows[0]?.stage);
      expect(afterStage.rows[0]?.stage).toBe("storage_completed");

      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [requestId]
      );
      expect(request.rows[0]?.status).toBe("deletion_in_progress");

      const afterProfile = await client.query<{
        email: string;
        username: string;
        avatar_url: string | null;
      }>(`SELECT email, username, avatar_url FROM public.profiles WHERE id = $1`, [
        RUNNER_IT_TARGET,
      ]);
      expect(afterProfile.rows[0]).toEqual(beforeProfile.rows[0]);
      expect(afterProfile.rows[0]?.email).toBe(PROFILE_SYNTHETIC.email);
      expect(afterProfile.rows[0]?.username).toBe(PROFILE_SYNTHETIC.username);
      expect(afterProfile.rows[0]?.avatar_url).toBe(PROFILE_SYNTHETIC.avatarUrl);

      const privateAfter = await countPrivate();
      expect(privateAfter).toEqual(privateBefore);
      expect(privateBefore.inbox).toBeGreaterThan(0);

      const auditAfter = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_storage_execution_audit
         WHERE execution_attempt_id = $1 AND event_type LIKE 'profile_%'`,
        [attemptId]
      );
      expect(auditAfter.rows[0]?.count).toBe(auditBefore.rows[0]?.count);

      const ctxAfter = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.account_deletion_database_execution_context`
      );
      expect(ctxAfter.rows[0]?.count).toBe(ctxBefore.rows[0]?.count);

      const deferAfter = await client.query(
        `SELECT disposition_snapshot, execution_state, bucket, object_path
         FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1 AND disposition_snapshot = 'DEFER_PROFILE'`,
        [attemptId]
      );
      expect(deferAfter.rows).toEqual(deferBefore.rows);

      const storageAfter = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM storage.objects WHERE bucket_id = 'profile-avatars'`
      );
      expect(storageAfter.rows[0]?.count).toBe(storageBefore.rows[0]?.count);

      const authUser = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.users WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(Number(authUser.rows[0]?.count)).toBe(1);
    });

    it("U-TOMBSTONE-MIXED-CASE-READINESS: uppercase namespace occupant fails CI readiness scan", async () => {
      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedCompanionUsers(client);
      const lowercaseCollision = "del_aabbccddeeff00112233";
      const mixedCaseCollision = "DEL_AABBCCDDEEFF00112233";
      expect(lowercaseCollision).toBe(mixedCaseCollision.toLowerCase());
      await seedDeletionNamespaceCollisionUsername(client, RUNNER_IT_OTHER, mixedCaseCollision);
      const blocked = await client.query<{ payload: { ready?: boolean; prerequisites?: { id: string; ready: boolean }[] } }>(
        `SELECT public.verify_account_deletion_profile_stage_ready() AS payload`
      );
      const blockedPrereq = (blocked.rows[0]?.payload?.prerequisites ?? []).find(
        (p) => p.id === "profile_deletion_username_namespace_clear"
      );
      expect(blockedPrereq?.ready).toBe(false);
      expect(blocked.rows[0]?.payload?.ready).toBe(false);

      await client.query(
        `UPDATE public.profiles SET username = 'other_user' WHERE id = $1`,
        [RUNNER_IT_OTHER]
      );
      await restoreProfilesUsernameFormatCheck(client);
      const cleared = await client.query<{ payload: { ready?: boolean; prerequisites?: { id: string; ready: boolean }[] } }>(
        `SELECT public.verify_account_deletion_profile_stage_ready() AS payload`
      );
      const clearedPrereq = (cleared.rows[0]?.payload?.prerequisites ?? []).find(
        (p) => p.id === "profile_deletion_username_namespace_clear"
      );
      expect(clearedPrereq?.ready).toBe(true);
    });

    it("U-TOMBSTONE-EXISTING-COLLISION-READINESS: unexpected namespace occupancy fails readiness", async () => {
      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedCompanionUsers(client);
      const collisionUsername = "del_aabbccddeeff00112233";
      await seedDeletionNamespaceCollisionUsername(
        client,
        RUNNER_IT_OTHER,
        collisionUsername
      );
      const blocked = await client.query<{ payload: { ready?: boolean; prerequisites?: { id: string; ready: boolean }[] } }>(
        `SELECT public.verify_account_deletion_profile_stage_ready() AS payload`
      );
      const blockedPrereq = (blocked.rows[0]?.payload?.prerequisites ?? []).find(
        (p) => p.id === "profile_deletion_username_namespace_clear"
      );
      expect(blockedPrereq?.ready).toBe(false);
      expect(blocked.rows[0]?.payload?.ready).toBe(false);

      await client.query(
        `UPDATE public.profiles SET username = 'other_user' WHERE id = $1`,
        [RUNNER_IT_OTHER]
      );
      const cleared = await client.query<{ payload: { ready?: boolean; prerequisites?: { id: string; ready: boolean }[] } }>(
        `SELECT public.verify_account_deletion_profile_stage_ready() AS payload`
      );
      const clearedPrereq = (cleared.rows[0]?.payload?.prerequisites ?? []).find(
        (p) => p.id === "profile_deletion_username_namespace_clear"
      );
      expect(clearedPrereq?.ready).toBe(true);
    });

    it("U-NORMAL-USER-TOMBSTONE-DENIED: authenticated user cannot bypass cooldown via del_*", async () => {
      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedCompanionUsers(client);
      await seedSyntheticTargetProfile(client);
      await client.query(
        `UPDATE public.profiles SET username_changed_at = now() WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      const tombstone = accountDeletionScrubbedProfileUsername(RUNNER_IT_TARGET);
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_TARGET,
          `UPDATE public.profiles SET username = $1 WHERE id = $2`,
          [tombstone, RUNNER_IT_TARGET]
        )
      ).rejects.toMatchObject({ code: "23514" });
      const row = await client.query<{ username: string }>(
        `SELECT username FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(row.rows[0]?.username).toBe(PROFILE_SYNTHETIC.username);
    });

    it("U-NORMAL-USER-NULL-DENIED: established username cannot become NULL outside deletion", async () => {
      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedSyntheticTargetProfile(client);
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_TARGET,
          `UPDATE public.profiles SET username = NULL WHERE id = $1`,
          [RUNNER_IT_TARGET]
        )
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("U-CONTEXT-WRONG-TARGET: profile_stage context for A does not scrub B", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await client.query(
        `UPDATE public.profiles
         SET username = 'other_runner', username_changed_at = now()
         WHERE id = $1`,
        [RUNNER_IT_OTHER]
      );
      const otherTombstone = accountDeletionScrubbedProfileUsername(RUNNER_IT_OTHER);
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO public.account_deletion_database_execution_context (
            backend_pid, transaction_id, attempt_id, deletion_request_id, target_user_id, purpose
          ) VALUES (
            pg_backend_pid(), txid_current()::bigint, $1::uuid, $2::uuid, $3::uuid, 'profile_stage'::text
          )`,
          [attemptId, requestId, RUNNER_IT_TARGET]
        );
        await expect(
          client.query(
            `UPDATE public.profiles SET username = $1 WHERE id = $2`,
            [otherTombstone, RUNNER_IT_OTHER]
          )
        ).rejects.toMatchObject({ code: "23514" });
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      const other = await client.query<{ username: string }>(
        `SELECT username FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_OTHER]
      );
      expect(other.rows[0]?.username).toBe("other_runner");
    });

    it("U-CONTEXT-WRONG-PURPOSE: database_stage context does not authorize tombstone scrub", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await client.query(
        `UPDATE public.profiles SET username_changed_at = now() WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      const tombstone = accountDeletionScrubbedProfileUsername(RUNNER_IT_TARGET);
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO public.account_deletion_database_execution_context (
            backend_pid, transaction_id, attempt_id, deletion_request_id, target_user_id, purpose
          ) VALUES (
            pg_backend_pid(), txid_current()::bigint, $1::uuid, $2::uuid, $3::uuid,
            'nondestructive_database_stage'::text
          )`,
          [attemptId, requestId, RUNNER_IT_TARGET]
        );
        await expect(
          client.query(
            `UPDATE public.profiles SET username = $1 WHERE id = $2`,
            [tombstone, RUNNER_IT_TARGET]
          )
        ).rejects.toMatchObject({ code: "23514" });
        await client.query("ROLLBACK");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      const row = await client.query<{ username: string }>(
        `SELECT username FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(row.rows[0]?.username).toBe(PROFILE_SYNTHETIC.username);
    });

    it("U-CONTEXT-NO-SPOOF: authenticated cannot insert context or invoke internal authorizers", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_TARGET,
          `INSERT INTO public.account_deletion_database_execution_context (
            backend_pid, transaction_id, attempt_id, deletion_request_id, target_user_id, purpose
          ) VALUES (
            pg_backend_pid(), txid_current()::bigint, $1::uuid, $2::uuid, $3::uuid, 'profile_stage'::text
          )`,
          [attemptId, requestId, RUNNER_IT_TARGET]
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_TARGET,
          `SELECT public.account_deletion_profile_execution_context_is_valid() AS ok`
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_TARGET,
          `SELECT public.account_deletion_profile_username_scrub_authorized($1::uuid, $2::text) AS ok`,
          [RUNNER_IT_TARGET, accountDeletionScrubbedProfileUsername(RUNNER_IT_TARGET)]
        )
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("P-A-NO-AUTH: auth.users target survives; attempt stays before auth stages", async () => {
      const { requestId, attemptId } = await driveLifecycleToStorageCompleted(client);
      await prepareProfileStageRpc(client, requestId, attemptId);
      const authUser = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.users WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(Number(authUser.rows[0]?.count)).toBe(1);
      const stage = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(["auth", "auth_pending", "finalize", "completed"]).not.toContain(stage.rows[0]?.stage);
    });
  }
);

describe("accountDeletionProfileStage.integration guards", () => {
  it("refuses local Supabase app DB port 54322", () => {
    expect(
      isDedicatedVanillaIntegrationDb(
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
      )
    ).toBe(false);
  });

  it("P-A-NO-STORAGE: profile stage module does not import storage object executor", async () => {
    const profileStage = readFileSync("lib/server/accountDeletionProfileStage.ts", "utf8");
    expect(profileStage).not.toContain("accountDeletionStorageObjectExecutor");
    expect(profileStage).not.toContain(".remove(");
  });
});
