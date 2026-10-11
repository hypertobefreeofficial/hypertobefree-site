/**
 * Guarded real PostgreSQL coverage for 3B.4B.1.
 * Intentionally skipped unless ACCOUNT_DELETION_INTEGRATION_DB_URL points to
 * the dedicated vanilla PostgreSQL database (never local Supabase :54322).
 */

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  INTEGRATION_PROFILE_AVATAR_APPROVED_ORIGIN,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import {
  asAuthenticatedUser,
  assertFreshMigrationProfileHelperPrivileges,
  cleanupProfileIntegration,
  ensureProfileIntegrationGrants,
  isDedicatedVanillaIntegrationDb,
  PROFILE_SYNTHETIC,
  RUNNER_IT_OTHER,
  RUNNER_IT_TARGET,
  seedCompanionUsers,
  seedRunnerIntegrationUsers,
  seedSyntheticTargetProfile,
  setAttemptStagePrivileged,
} from "./accountDeletionProfileStage.integrationHarness";
import {
  asAuthenticatedOwner,
  asServiceRole,
  seedApprovedAttemptAtInventory,
} from "./accountDeletionStorageStageRunner.integrationHarness";
import {
  authorizeProfileMedia,
  claimAndAuthorizeProfileMedia,
  claimProfileMedia,
  completeProfileMedia,
  driveLifecycleToProfileMedia,
  type ProfileMediaFixture,
  type ProfileMediaRpcPayload,
} from "./accountDeletionProfileMediaExecution.integrationHarness";
import { parseAccountDeletionProfileMediaClaim } from "./accountDeletionProfileMediaPolicy";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

describeIntegration(
  `account deletion profile-media integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await assertFreshMigrationProfileHelperPrivileges(client);
      await ensureProfileIntegrationGrants(client);
    }, 300_000);

    afterAll(async () => {
      await client?.end();
    });

    it("B1-READINESS: new and prior probes pass while ordinary authority rejects profile-avatars", async () => {
      const profileMedia = await client.query<{
        payload: { ready: boolean; prerequisites: { id: string; ready: boolean }[] };
      }>(`SELECT public.verify_account_deletion_profile_media_ready() AS payload`);
      expect(profileMedia.rows[0]?.payload.ready).toBe(true);
      const ids = new Set(
        profileMedia.rows[0]?.payload.prerequisites.map((row) => row.id)
      );
      for (const id of [
        "profile_media_rpcs_present",
        "profile_media_authority_hardened",
        "profile_media_reference_safety",
        "profile_media_result_state_contract",
        "profile_media_hold_serialization",
        "profile_media_operator_attested_origin_configured",
        "profile_media_parser_behavior",
        "profile_media_completion_predicate",
        "profile_media_service_role_only",
        "profile_media_internal_helpers_sealed",
        "ordinary_storage_authority_remains_journey_only",
        "profile_media_prior_stages_ready",
      ]) {
        expect(ids.has(id)).toBe(true);
      }
      for (const probe of [
        "verify_account_deletion_storage_stage_runner_ready",
        "verify_account_deletion_profile_stage_ready",
        "verify_account_deletion_schema_execution_ready",
      ]) {
        const result = await client.query<{ payload: { ready: boolean } }>(
          `SELECT public.${probe}() AS payload`
        );
        expect(result.rows[0]?.payload.ready).toBe(true);
      }
      const buckets = await client.query<{ journey: boolean; profile: boolean }>(
        `SELECT
           public.account_deletion_storage_destructive_bucket_allowed('journey-private-media') AS journey,
           public.account_deletion_storage_destructive_bucket_allowed('profile-avatars') AS profile`
      );
      expect(buckets.rows[0]).toEqual({ journey: true, profile: false });

      await client.query(`DELETE FROM public.account_deletion_profile_avatar_approved_origins`);
      const unconfigured = await client.query<{
        payload: { ready: boolean; prerequisites: { id: string; ready: boolean }[] };
      }>(`SELECT public.verify_account_deletion_profile_media_ready() AS payload`);
      expect(unconfigured.rows[0]?.payload.ready).toBe(false);
      expect(
        unconfigured.rows[0]?.payload.prerequisites.find(
          (row) => row.id ===
            "profile_media_operator_attested_origin_configured"
        )?.ready
      ).toBe(false);
      await client.query(
        `INSERT INTO public.account_deletion_profile_avatar_approved_origins (origin)
         VALUES ($1)`,
        [INTEGRATION_PROFILE_AVATAR_APPROVED_ORIGIN]
      );

      await client.query(
        `INSERT INTO public.account_deletion_profile_avatar_approved_origins (origin)
         VALUES ('https://second-operator-attested.supabase.co')`
      );
      const multiple = await client.query<{
        payload: {
          ready: boolean;
          prerequisites: { id: string; ready: boolean; detail: string }[];
        };
      }>(`SELECT public.verify_account_deletion_profile_media_ready() AS payload`);
      expect(multiple.rows[0]?.payload.ready).toBe(false);
      expect(
        multiple.rows[0]?.payload.prerequisites.find(
          (row) =>
            row.id === "profile_media_operator_attested_origin_configured"
        )
      ).toMatchObject({
        ready: false,
        detail:
          "exactly one sealed operator-attested origin is configured; environment identity verification is an external deployment gate",
      });
      await client.query(
        `DELETE FROM public.account_deletion_profile_avatar_approved_origins
         WHERE origin = 'https://second-operator-attested.supabase.co'`
      );
      await expect(
        client.query(
          `INSERT INTO public.account_deletion_profile_avatar_approved_origins (origin)
           VALUES ('https://INVALID.supabase.co/')`
        )
      ).rejects.toThrow();
    });

    it("B1-READINESS-TRIGGER: disabled, rebound, incomplete, or mistimed guards fail readiness", async () => {
      const triggerName = "account_deletion_profile_avatar_reference_guard";
      const readiness = async () =>
        (
          await client.query<{ payload: { ready: boolean } }>(
            `SELECT public.verify_account_deletion_profile_media_ready() AS payload`
          )
        ).rows[0]?.payload.ready;
      const restoreTrigger = async () => {
        await client.query(`DROP TRIGGER IF EXISTS ${triggerName} ON public.profiles`);
        await client.query(
          `CREATE TRIGGER ${triggerName}
           BEFORE INSERT OR UPDATE OF id, avatar_url ON public.profiles
           FOR EACH ROW
           EXECUTE FUNCTION public.trg_account_deletion_profile_avatar_reference_guard()`
        );
      };

      await client.query(`ALTER TABLE public.profiles DISABLE TRIGGER ${triggerName}`);
      expect(await readiness()).toBe(false);
      await client.query(`ALTER TABLE public.profiles ENABLE TRIGGER ${triggerName}`);
      expect(await readiness()).toBe(true);

      await client.query(
        `CREATE OR REPLACE FUNCTION public.test_profile_avatar_guard_replacement()
         RETURNS trigger
         LANGUAGE plpgsql
         SECURITY DEFINER
         SET search_path = ''
         AS $$ BEGIN RETURN NEW; END; $$`
      );
      try {
        await client.query(`DROP TRIGGER ${triggerName} ON public.profiles`);
        await client.query(
          `CREATE TRIGGER ${triggerName}
           BEFORE INSERT OR UPDATE OF id, avatar_url ON public.profiles
           FOR EACH ROW
           EXECUTE FUNCTION public.test_profile_avatar_guard_replacement()`
        );
        expect(await readiness()).toBe(false);

        for (const definition of [
          "BEFORE INSERT OR UPDATE OF avatar_url",
          "BEFORE INSERT OR UPDATE OF id",
          "AFTER INSERT OR UPDATE OF id, avatar_url",
          "BEFORE UPDATE OF id, avatar_url",
        ]) {
          await client.query(`DROP TRIGGER ${triggerName} ON public.profiles`);
          await client.query(
            `CREATE TRIGGER ${triggerName}
             ${definition} ON public.profiles
             FOR EACH ROW
             EXECUTE FUNCTION public.trg_account_deletion_profile_avatar_reference_guard()`
          );
          expect(await readiness()).toBe(false);
        }
      } finally {
        await restoreTrigger();
        await client.query(
          `DROP FUNCTION IF EXISTS public.test_profile_avatar_guard_replacement()`
        );
      }
      expect(await readiness()).toBe(true);
    });

    it("B1-PARSER: getPublicUrl parses; external is external; malformed internal fails closed", async () => {
      const values = [
        PROFILE_SYNTHETIC.avatarUrl,
        PROFILE_SYNTHETIC.avatarUrl.replace(
          INTEGRATION_PROFILE_AVATAR_APPROVED_ORIGIN,
          "https://another-project.supabase.co"
        ),
        PROFILE_SYNTHETIC.avatarUrl.replace(
          INTEGRATION_PROFILE_AVATAR_APPROVED_ORIGIN,
          INTEGRATION_PROFILE_AVATAR_APPROVED_ORIGIN.toUpperCase()
        ),
        `${PROFILE_SYNTHETIC.avatarUrl}?download=1#avatar`,
        "https://cdn.example.test/avatars/public-user.png",
        `https://example.supabase.co/storage/v1/object/public/profile-avatars/${RUNNER_IT_TARGET}/%2e%2e/avatar.png`,
        `https://evil.example.test/storage/v1/object/public/profile-avatars/${RUNNER_IT_TARGET}/avatar.png`,
        `https://example.supabase.co.evil.example/storage/v1/object/public/profile-avatars/${RUNNER_IT_TARGET}/avatar.png`,
        `https://evil-supabase.co/storage/v1/object/public/profile-avatars/${RUNNER_IT_TARGET}/avatar.png`,
        `https://user@example.supabase.co/storage/v1/object/public/profile-avatars/${RUNNER_IT_TARGET}/avatar.png`,
        `https://example.supabase.co:444/storage/v1/object/public/profile-avatars/${RUNNER_IT_TARGET}/avatar.png`,
        `${RUNNER_IT_TARGET}/avatar.png`,
        `profile-avatars/${RUNNER_IT_TARGET}/avatar.png`,
        `${RUNNER_IT_OTHER}/avatar.png`,
      ];
      const result = await client.query<{ parsed: Record<string, string> }>(
        `SELECT public.account_deletion_profile_avatar_reference_parse_profile_value(value) AS parsed
         FROM unnest($1::text[]) AS value`,
        [values]
      );
      expect(result.rows[0]?.parsed).toMatchObject({
        kind: "internal",
        bucket: "profile-avatars",
        object_path: PROFILE_SYNTHETIC.avatarPath,
        owner_user_id: RUNNER_IT_TARGET,
      });
      expect(result.rows[1]?.parsed.kind).toBe("foreign_supabase");
      expect(result.rows[2]?.parsed.kind).toBe("internal");
      expect(result.rows[3]?.parsed.kind).toBe("internal");
      expect(result.rows[4]?.parsed.kind).toBe("external");
      for (const index of [5, 6, 7, 8, 9, 10]) {
        expect(result.rows[index]?.parsed.kind).toBe("malformed_internal");
      }
      for (const index of [11, 12, 13]) {
        expect(result.rows[index]?.parsed).toMatchObject({
          kind: "malformed_internal",
          code: "profile_avatar_reference_untrusted_raw_value",
        });
      }
      const authoritativePaths = await client.query<{
        own_path: boolean;
        foreign_owner_path: boolean;
      }>(
        `SELECT
           public.account_deletion_profile_avatar_object_path_canonical($1, $2) AS own_path,
           public.account_deletion_profile_avatar_object_path_canonical($1, $3) AS foreign_owner_path`,
        [PROFILE_SYNTHETIC.avatarPath, RUNNER_IT_TARGET, RUNNER_IT_OTHER]
      );
      expect(authoritativePaths.rows[0]).toEqual({
        own_path: true,
        foreign_owner_path: false,
      });
    });

    it("B1-MANIFEST-PARSER: external creates no avatar work; malformed internal blocks capture", async () => {
      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedCompanionUsers(client);
      await seedSyntheticTargetProfile(client);
      await client.query(`UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`, [
        RUNNER_IT_TARGET,
        "https://cdn.example.test/avatar.png",
      ]);
      let requestId = randomUUID();
      let attemptId = await seedApprovedAttemptAtInventory(client, requestId);
      let capture = await asServiceRole<ProfileMediaRpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1,$2) AS payload`,
        [requestId, attemptId]
      );
      expect(capture.ok).toBe(true);
      let avatarRows = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND media_category = 'profile_avatar'`,
        [attemptId]
      );
      expect(avatarRows.rows[0]?.count).toBe("0");

      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedCompanionUsers(client);
      await seedSyntheticTargetProfile(client);
      await client.query(`UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`, [
        RUNNER_IT_TARGET,
        `https://another-project.supabase.co/storage/v1/object/public/profile-avatars/${RUNNER_IT_TARGET}/avatar.png`,
      ]);
      requestId = randomUUID();
      attemptId = await seedApprovedAttemptAtInventory(client, requestId);
      capture = await asServiceRole<ProfileMediaRpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1,$2) AS payload`,
        [requestId, attemptId]
      );
      expect(capture.ok).toBe(true);
      avatarRows = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND media_category = 'profile_avatar'`,
        [attemptId]
      );
      expect(avatarRows.rows[0]?.count).toBe("0");
      const localObject = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM storage.objects
         WHERE bucket_id = 'profile-avatars' AND name = $1`,
        [PROFILE_SYNTHETIC.avatarPath]
      );
      expect(localObject.rows[0]?.count).toBe("1");

      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedCompanionUsers(client);
      await seedSyntheticTargetProfile(client);
      await client.query(
        `ALTER TABLE public.profiles
         DISABLE TRIGGER account_deletion_profile_avatar_reference_guard`
      );
      try {
        await client.query(
          `UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`,
          [RUNNER_IT_TARGET, `${RUNNER_IT_TARGET}/avatar.png`]
        );
      } finally {
        await client.query(
          `ALTER TABLE public.profiles
           ENABLE TRIGGER account_deletion_profile_avatar_reference_guard`
        );
      }
      requestId = randomUUID();
      attemptId = await seedApprovedAttemptAtInventory(client, requestId);
      capture = await asServiceRole<ProfileMediaRpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1,$2) AS payload`,
        [requestId, attemptId]
      );
      expect(capture).toMatchObject({
        ok: false,
        code: "storage_manifest_unresolved_media_reference",
      });
      avatarRows = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_manifest
         WHERE execution_attempt_id = $1 AND media_category = 'profile_avatar'`,
        [attemptId]
      );
      expect(avatarRows.rows[0]?.count).toBe("0");

      await cleanupProfileIntegration(client);
      await seedRunnerIntegrationUsers(client);
      await seedCompanionUsers(client);
      await seedSyntheticTargetProfile(client);
      await client.query(`ALTER TABLE public.profiles DISABLE TRIGGER account_deletion_profile_avatar_reference_guard`);
      await client.query(`UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`, [
        RUNNER_IT_TARGET,
        `https://example.supabase.co/storage/v1/object/public/profile-avatars/${RUNNER_IT_TARGET}/%2e%2e/avatar.png`,
      ]);
      await client.query(`ALTER TABLE public.profiles ENABLE TRIGGER account_deletion_profile_avatar_reference_guard`);
      requestId = randomUUID();
      attemptId = await seedApprovedAttemptAtInventory(client, requestId);
      capture = await asServiceRole<ProfileMediaRpcPayload>(
        client,
        `SELECT public.capture_account_deletion_storage_manifest($1,$2) AS payload`,
        [requestId, attemptId]
      );
      expect(capture.ok).toBe(false);
      expect(capture.code).toBe("storage_manifest_unresolved_media_reference");
    });

    it("B1-AUTHORITY: only active profile stage with exact request/attempt/result succeeds", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const claimed = await claimProfileMedia(client, fixture);
      expect(claimed).toMatchObject({
        ok: true,
        code: "claimed",
        result_id: fixture.resultId,
      });
      expect(typeof claimed.claim_lease_expires_at).toBe("string");
      expect(parseAccountDeletionProfileMediaClaim(claimed)).toMatchObject({
        resultId: fixture.resultId,
        claimToken: claimed.claim_token,
        claimExpiresAt: claimed.claim_lease_expires_at,
      });

      for (const stage of ["storage_completed", "storage", "profile_completed"]) {
        const next = await driveLifecycleToProfileMedia(client);
        await setAttemptStagePrivileged(client, next.attemptId, stage);
        const denied = await claimProfileMedia(client, next);
        expect(denied.ok).toBe(false);
        expect(denied.code).toBe("attempt_mismatch");
      }

      const bound = await driveLifecycleToProfileMedia(client);
      expect(
        (await claimProfileMedia(client, bound, { requestId: randomUUID() })).ok
      ).toBe(false);
      expect(
        (await claimProfileMedia(client, bound, { attemptId: randomUUID() })).code
      ).toBe("attempt_mismatch");
      expect(
        (await claimProfileMedia(client, bound, { resultId: randomUUID() })).code
      ).toBe("result_mismatch");
    });

    it("B1-AUTHORITY-METADATA: Journey result and tampered profile authority are denied", async () => {
      const fixture = await driveLifecycleToProfileMedia(client, {
        deletePrivateCount: 1,
      });
      const journey = await client.query<{ id: string }>(
        `SELECT id FROM public.account_deletion_storage_execution_results
         WHERE execution_attempt_id = $1 AND disposition_snapshot = 'DELETE_PRIVATE'
         LIMIT 1`,
        [fixture.attemptId]
      );
      const journeyDenied = await claimProfileMedia(client, fixture, {
        resultId: journey.rows[0]!.id,
      });
      expect(journeyDenied.code).toBe("profile_media_authority_mismatch");

      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET bucket = 'journey-private-media'
         WHERE id = $1`,
        [fixture.resultId]
      );
      expect((await claimProfileMedia(client, fixture)).code).toBe(
        "profile_media_authority_mismatch"
      );

      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET bucket = 'profile-avatars',
             object_path = $2
         WHERE id = $1`,
        [fixture.resultId, `${RUNNER_IT_OTHER}/avatar.png`]
      );
      expect((await claimProfileMedia(client, fixture)).code).toBe(
        "profile_media_authority_mismatch"
      );

      const ownerFixture = await driveLifecycleToProfileMedia(client);
      await client.query(
        `ALTER TABLE public.account_deletion_storage_manifest
         DISABLE TRIGGER account_deletion_storage_manifest_freeze`
      );
      await expect(
        client.query(
          `UPDATE public.account_deletion_storage_manifest
           SET object_path = $2 WHERE id = $1`,
          [ownerFixture.manifestId, `${RUNNER_IT_OTHER}/avatar.png`]
        )
      ).rejects.toThrow();
      await client.query(
        `ALTER TABLE public.account_deletion_storage_manifest
         ENABLE TRIGGER account_deletion_storage_manifest_freeze`
      );
    });

    it("B1-REFERENCE: scrubbed target shell is mandatory and every surviving profile is scanned", async () => {
      let fixture = await driveLifecycleToProfileMedia(client);
      await client.query(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
      await client.query(`DELETE FROM public.profiles WHERE id = $1`, [RUNNER_IT_TARGET]);
      await client.query(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
      expect((await claimProfileMedia(client, fixture)).code).toBe(
        "profile_media_target_not_scrubbed"
      );

      fixture = await driveLifecycleToProfileMedia(client);
      await client.query(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
      await client.query(`UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`, [
        RUNNER_IT_TARGET,
        PROFILE_SYNTHETIC.avatarUrl,
      ]);
      await client.query(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
      expect((await claimProfileMedia(client, fixture)).code).toBe(
        "profile_media_target_not_scrubbed"
      );

      fixture = await driveLifecycleToProfileMedia(client);
      await client.query(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
      await client.query(`UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`, [
        RUNNER_IT_OTHER,
        PROFILE_SYNTHETIC.avatarUrl,
      ]);
      await client.query(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
      expect((await claimProfileMedia(client, fixture)).code).toBe(
        "profile_media_reference_active"
      );

      fixture = await driveLifecycleToProfileMedia(client);
      await client.query(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
      await client.query(`UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`, [
        RUNNER_IT_OTHER,
        `https://example.supabase.co/storage/v1/object/public/profile-avatars/${RUNNER_IT_TARGET}/%61vatar.png`,
      ]);
      await client.query(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
      expect((await claimProfileMedia(client, fixture)).code).toBe(
        "profile_media_reference_active"
      );

      // Availability-fail-safe policy: even an unrelated malformed internal
      // avatar reference blocks physical profile-media authority.
      fixture = await driveLifecycleToProfileMedia(client);
      await client.query(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
      await client.query(`UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`, [
        RUNNER_IT_OTHER,
        `${RUNNER_IT_OTHER}/avatar.png`,
      ]);
      await client.query(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
      expect((await claimProfileMedia(client, fixture)).code).toBe(
        "profile_media_reference_active"
      );
    });

    it("B1-WRITE-GUARD: own/external writes survive; cross-user and deletion reattachment fail", async () => {
      await driveLifecycleToProfileMedia(client);
      const ownUrl = `https://example.supabase.co/storage/v1/object/public/profile-avatars/${RUNNER_IT_OTHER}/avatar.webp`;
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_OTHER,
          `UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`,
          [RUNNER_IT_OTHER, ownUrl]
        )
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_OTHER,
          `UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`,
          [RUNNER_IT_OTHER, "https://cdn.example.test/avatar.png"]
        )
      ).resolves.toMatchObject({ rowCount: 1 });
      for (const rawValue of [
        `${RUNNER_IT_OTHER}/avatar.png`,
        `profile-avatars/${RUNNER_IT_OTHER}/avatar.png`,
        `${RUNNER_IT_TARGET}/avatar.png`,
      ]) {
        await expect(
          asAuthenticatedUser(
            client,
            RUNNER_IT_OTHER,
            `UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`,
            [RUNNER_IT_OTHER, rawValue]
          )
        ).rejects.toThrow(/malformed or unsafe/i);
      }
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_OTHER,
          `UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`,
          [RUNNER_IT_OTHER, PROFILE_SYNTHETIC.avatarUrl]
        )
      ).rejects.toThrow(/owner does not match/i);
      await expect(
        client.query(`UPDATE public.profiles SET avatar_url = $2 WHERE id = $1`, [
          RUNNER_IT_TARGET,
          PROFILE_SYNTHETIC.avatarUrl,
        ])
      ).rejects.toThrow(/cannot be attached during account deletion/i);

      const idPairs = Array.from({ length: 3 }, () => ({
        source: randomUUID(),
        destination: randomUUID(),
      }));
      const authIds = idPairs.flatMap((pair) => [pair.source, pair.destination]);
      try {
        await client.query(
          `INSERT INTO auth.users (id, email)
           SELECT id, id::text || '@test.invalid'
           FROM unnest($1::uuid[]) AS id`,
          [authIds]
        );
        await client.query(`DELETE FROM public.profiles WHERE id = ANY($1::uuid[])`, [
          idPairs.map((pair) => pair.destination),
        ]);
        await client.query(
          `UPDATE public.profiles
           SET avatar_url = CASE id
             WHEN $1::uuid THEN $2::text
             WHEN $3::uuid THEN NULL
             WHEN $4::uuid THEN 'https://cdn.example.test/avatar.png'
           END
           WHERE id = ANY($5::uuid[])`,
          [
            idPairs[0]!.source,
            `${INTEGRATION_PROFILE_AVATAR_APPROVED_ORIGIN}/storage/v1/object/public/profile-avatars/${idPairs[0]!.source}/avatar.png`,
            idPairs[1]!.source,
            idPairs[2]!.source,
            idPairs.map((pair) => pair.source),
          ]
        );

        await expect(
          client.query(`UPDATE public.profiles SET id = $2 WHERE id = $1`, [
            idPairs[0]!.source,
            idPairs[0]!.destination,
          ])
        ).rejects.toThrow(/owner does not match/i);
        await expect(
          client.query(`UPDATE public.profiles SET id = $2 WHERE id = $1`, [
            idPairs[1]!.source,
            idPairs[1]!.destination,
          ])
        ).resolves.toMatchObject({ rowCount: 1 });
        await expect(
          client.query(`UPDATE public.profiles SET id = $2 WHERE id = $1`, [
            idPairs[2]!.source,
            idPairs[2]!.destination,
          ])
        ).resolves.toMatchObject({ rowCount: 1 });
        await expect(
          client.query(
            `UPDATE public.profiles SET avatar_url = avatar_url WHERE id = $1`,
            [idPairs[1]!.destination]
          )
        ).resolves.toMatchObject({ rowCount: 1 });
      } finally {
        await client.query(`DELETE FROM public.profiles WHERE id = ANY($1::uuid[])`, [
          authIds,
        ]);
        await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [
          authIds,
        ]);
      }
    });

    it("B1-HOLDS: request, attempt, and object holds block claims", async () => {
      for (const scope of ["request", "attempt", "manifest_object"] as const) {
        const fixture = await driveLifecycleToProfileMedia(client);
        const hold = await asAuthenticatedOwner<ProfileMediaRpcPayload>(
          client,
          `SELECT public.create_account_deletion_storage_preservation_hold(
             $1::uuid,$2::text,'legal_hold'::text,$3::uuid,$4::uuid,NULL
           ) AS payload`,
          [
            fixture.requestId,
            scope,
            scope === "request" ? null : fixture.attemptId,
            scope === "manifest_object" ? fixture.manifestId : null,
          ]
        );
        expect(hold.ok).toBe(true);
        expect((await claimProfileMedia(client, fixture)).code).toBe(
          "preservation_hold_active"
        );
      }
    });

    it("B1-HOLD-PRECOMMIT: hold introduced after claim clears claim and restores deferred state", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const claim = await claimProfileMedia(client, fixture);
      expect(claim.ok).toBe(true);
      const hold = await asAuthenticatedOwner<ProfileMediaRpcPayload>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
           $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
         ) AS payload`,
        [fixture.requestId, fixture.attemptId, fixture.manifestId]
      );
      expect(hold.ok).toBe(true);
      const state = await client.query<{
        execution_state: string;
        claim_token: string | null;
        delete_commit_token: string | null;
      }>(
        `SELECT execution_state, claim_token, delete_commit_token
         FROM public.account_deletion_storage_execution_results WHERE id = $1`,
        [fixture.resultId]
      );
      expect(state.rows[0]).toEqual({
        execution_state: "deferred_profile",
        claim_token: null,
        delete_commit_token: null,
      });
      expect(
        (
          await authorizeProfileMedia(
            client,
            fixture,
            String(claim.claim_token)
          )
        ).code
      ).toBe("preservation_hold_active");
    });

    it("B1-HOLD-POSTCOMMIT: object hold cannot revoke committed delete authority", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const { claim, authorization } = await claimAndAuthorizeProfileMedia(
        client,
        fixture
      );
      const hold = await asAuthenticatedOwner<ProfileMediaRpcPayload>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
           $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
         ) AS payload`,
        [fixture.requestId, fixture.attemptId, fixture.manifestId]
      );
      expect(hold).toMatchObject({ ok: false, code: "delete_already_committed" });
      const repeated = await authorizeProfileMedia(
        client,
        fixture,
        String(claim.claim_token)
      );
      expect(repeated).toMatchObject({
        ok: true,
        code: "already_authorized",
        delete_commit_token: authorization.delete_commit_token,
      });
    });

    it("B1-STATE: retryable and expired deleting claims can be reclaimed; terminal states cannot", async () => {
      let fixture = await driveLifecycleToProfileMedia(client);
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET execution_state = 'failed_retryable' WHERE id = $1`,
        [fixture.resultId]
      );
      expect((await claimProfileMedia(client, fixture)).code).toBe("claimed");

      fixture = await driveLifecycleToProfileMedia(client);
      await claimProfileMedia(client, fixture);
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET claim_lease_expires_at = now() - interval '1 second' WHERE id = $1`,
        [fixture.resultId]
      );
      expect(await claimProfileMedia(client, fixture)).toMatchObject({
        ok: true,
        code: "claimed",
        reclaimed: true,
      });

      for (const state of ["deleted", "missing", "failed_terminal"] as const) {
        fixture = await driveLifecycleToProfileMedia(client);
        const { authorization } = await claimAndAuthorizeProfileMedia(client, fixture);
        await completeProfileMedia(
          client,
          fixture,
          String(authorization.delete_commit_token),
          state,
          state === "failed_terminal" ? "storage_delete_failed" : null
        );
        expect((await claimProfileMedia(client, fixture)).code).toBe("not_claimable");
      }
    });

    it("B1-COMPLETION: valid commit token records each bounded outcome", async () => {
      for (const [outcome, errorCode] of [
        ["deleted", null],
        ["missing", null],
        ["failed_retryable", "storage_network_error"],
        ["failed_terminal", "storage_permission_error"],
      ] as const) {
        const fixture = await driveLifecycleToProfileMedia(client);
        const { authorization } = await claimAndAuthorizeProfileMedia(client, fixture);
        const completed = await completeProfileMedia(
          client,
          fixture,
          String(authorization.delete_commit_token),
          outcome,
          errorCode
        );
        expect(completed).toMatchObject({
          ok: true,
          code: "completed",
          execution_state: outcome,
        });
      }
    });

    it("B1-COMPLETION-TOKEN: wrong and expired tokens fail atomically", async () => {
      let fixture = await driveLifecycleToProfileMedia(client);
      let { authorization } = await claimAndAuthorizeProfileMedia(client, fixture);
      expect(
        (
          await completeProfileMedia(client, fixture, randomUUID(), "deleted")
        ).code
      ).toBe("delete_commit_token_mismatch");

      fixture = await driveLifecycleToProfileMedia(client);
      ({ authorization } = await claimAndAuthorizeProfileMedia(client, fixture));
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET delete_commit_expires_at = now() - interval '1 second' WHERE id = $1`,
        [fixture.resultId]
      );
      expect(
        (
          await completeProfileMedia(
            client,
            fixture,
            String(authorization.delete_commit_token),
            "deleted"
          )
        ).code
      ).toBe("delete_commit_expired");
      const state = await client.query<{ execution_state: string }>(
        `SELECT execution_state FROM public.account_deletion_storage_execution_results WHERE id = $1`,
        [fixture.resultId]
      );
      expect(state.rows[0]?.execution_state).toBe("deleting");
    });

    it("B1-RETRY-CEILING: twentieth retry becomes failed_terminal", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const { authorization } = await claimAndAuthorizeProfileMedia(client, fixture);
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET attempt_count = 20 WHERE id = $1`,
        [fixture.resultId]
      );
      const completed = await completeProfileMedia(
        client,
        fixture,
        String(authorization.delete_commit_token),
        "failed_retryable",
        "storage_network_error"
      );
      expect(completed.execution_state).toBe("failed_terminal");
    });

    it("B1-PROGRESS: in-flight/failure/hold blocks completion; deleted or missing permits it", async () => {
      let fixture = await driveLifecycleToProfileMedia(client);
      let predicate = await client.query<{ payload: ProfileMediaRpcPayload }>(
        `SELECT public.account_deletion_profile_media_completion_blocked($1,$2) AS payload`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(predicate.rows[0]?.payload).toMatchObject({
        ok: false,
        code: "profile_media_completion_blocked",
      });

      const { authorization } = await claimAndAuthorizeProfileMedia(client, fixture);
      await completeProfileMedia(
        client,
        fixture,
        String(authorization.delete_commit_token),
        "deleted"
      );
      predicate = await client.query<{ payload: ProfileMediaRpcPayload }>(
        `SELECT public.account_deletion_profile_media_completion_blocked($1,$2) AS payload`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(predicate.rows[0]?.payload).toMatchObject({
        ok: true,
        code: "profile_media_complete",
      });

      fixture = await driveLifecycleToProfileMedia(client);
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET execution_state = 'failed_terminal' WHERE id = $1`,
        [fixture.resultId]
      );
      const blocked = await client.query<{ payload: ProfileMediaRpcPayload }>(
        `SELECT public.account_deletion_profile_media_progress_snapshot($1,$2) AS payload`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(blocked.rows[0]?.payload).toMatchObject({
        failed_terminal: 1,
        completion_blocked: true,
      });
      expect(JSON.stringify(blocked.rows[0]?.payload)).not.toContain(
        fixture.objectPath
      );
    });

    it("B1-COMPLETION-LIFECYCLE: predicate independently requires the exact active finalized profile lifecycle", async () => {
      const terminalFixture = async () => {
        const fixture = await driveLifecycleToProfileMedia(client);
        const { authorization } = await claimAndAuthorizeProfileMedia(client, fixture);
        await completeProfileMedia(
          client,
          fixture,
          String(authorization.delete_commit_token),
          "deleted"
        );
        return fixture;
      };
      const predicate = async (fixture: ProfileMediaFixture) => {
        const result = await client.query<{ payload: ProfileMediaRpcPayload }>(
          `SELECT public.account_deletion_profile_media_completion_blocked($1,$2) AS payload`,
          [fixture.requestId, fixture.attemptId]
        );
        return result.rows[0]!.payload;
      };

      let fixture = await terminalFixture();
      expect(await predicate(fixture)).toMatchObject({
        ok: true,
        code: "profile_media_complete",
      });

      for (const status of ["approved", "cancelled", "completed"] as const) {
        fixture = await terminalFixture();
        await client.query(`ALTER TABLE public.account_deletion_requests DISABLE TRIGGER USER`);
        try {
          await client.query(
            `UPDATE public.account_deletion_requests SET status = $2 WHERE id = $1`,
            [fixture.requestId, status]
          );
        } finally {
          await client.query(`ALTER TABLE public.account_deletion_requests ENABLE TRIGGER USER`);
        }
        expect(await predicate(fixture)).toMatchObject({
          ok: false,
          code: "request_not_in_progress",
        });
      }

      fixture = await terminalFixture();
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET status = 'failed', completed_at = now()
         WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(await predicate(fixture)).toMatchObject({
        ok: false,
        code: "attempt_mismatch",
      });

      fixture = await terminalFixture();
      await setAttemptStagePrivileged(client, fixture.attemptId, "storage_completed");
      expect(await predicate(fixture)).toMatchObject({
        ok: false,
        code: "attempt_mismatch",
      });

      fixture = await terminalFixture();
      await client.query(
        `ALTER TABLE public.account_deletion_execution_attempts
         DISABLE TRIGGER account_deletion_execution_attempt_target_validation`
      );
      try {
        await client.query(
          `UPDATE public.account_deletion_execution_attempts
           SET target_user_id = $2 WHERE id = $1`,
          [fixture.attemptId, RUNNER_IT_OTHER]
        );
      } finally {
        await client.query(
          `ALTER TABLE public.account_deletion_execution_attempts
           ENABLE TRIGGER account_deletion_execution_attempt_target_validation`
        );
      }
      expect(await predicate(fixture)).toMatchObject({
        ok: false,
        code: "attempt_mismatch",
      });

      fixture = await terminalFixture();
      await client.query(
        `UPDATE public.account_deletion_execution_attempts
         SET storage_manifest_status = NULL,
             storage_manifest_finalized_at = NULL
         WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(await predicate(fixture)).toMatchObject({
        ok: false,
        code: "attempt_mismatch",
      });

      fixture = await driveLifecycleToProfileMedia(client);
      await client.query(
        `DELETE FROM public.account_deletion_storage_execution_results WHERE id = $1`,
        [fixture.resultId]
      );
      expect(await predicate(fixture)).toMatchObject({
        ok: false,
        code: "profile_media_completion_blocked",
      });

      fixture = await terminalFixture();
      await client.query(
        `UPDATE public.account_deletion_storage_execution_results
         SET target_user_id = $2 WHERE id = $1`,
        [fixture.resultId, RUNNER_IT_OTHER]
      );
      const mismatched = await predicate(fixture);
      expect(mismatched).toMatchObject({
        ok: false,
        code: "profile_media_completion_blocked",
      });
      expect(
        (mismatched.media as { mismatch_count?: number })?.mismatch_count
      ).toBe(1);

      fixture = await terminalFixture();
      const hold = await asAuthenticatedOwner<ProfileMediaRpcPayload>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
           $1::uuid,'request'::text,'legal_hold'::text,NULL,NULL,NULL
         ) AS payload`,
        [fixture.requestId]
      );
      expect(hold.ok).toBe(true);
      expect(await predicate(fixture)).toMatchObject({
        ok: false,
        code: "profile_media_completion_blocked",
      });
    });

    it("B1-CONCURRENCY: two claimers serialize to one claim", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const second = new Client({ connectionString: dbUrl! });
      await second.connect();
      try {
        const results = await Promise.all([
          claimProfileMedia(client, fixture),
          claimProfileMedia(second, fixture),
        ]);
        expect(results.filter((row) => row.ok === true)).toHaveLength(1);
        expect(results.filter((row) => row.ok !== true)).toHaveLength(1);
      } finally {
        await second.end();
      }
    });

    it("B1-CONCURRENCY-HOLD: claim and object hold serialize without a live precommit claim", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const second = new Client({ connectionString: dbUrl! });
      await second.connect();
      try {
        const [claim, hold] = await Promise.all([
          claimProfileMedia(client, fixture),
          asAuthenticatedOwner<ProfileMediaRpcPayload>(
            second,
            `SELECT public.create_account_deletion_storage_preservation_hold(
               $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
             ) AS payload`,
            [fixture.requestId, fixture.attemptId, fixture.manifestId]
          ),
        ]);
        expect(hold.ok).toBe(true);
        expect(["claimed", "preservation_hold_active"]).toContain(claim.code);
        const state = await client.query<{
          execution_state: string;
          claim_token: string | null;
        }>(
          `SELECT execution_state, claim_token
           FROM public.account_deletion_storage_execution_results WHERE id = $1`,
          [fixture.resultId]
        );
        expect(state.rows[0]).toEqual({
          execution_state: "deferred_profile",
          claim_token: null,
        });
      } finally {
        await second.end();
      }
    });

    it("B1-CONCURRENCY-HOLD-RELEASE: exactly one concurrent caller releases and audits", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const hold = await asAuthenticatedOwner<ProfileMediaRpcPayload>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
           $1::uuid,'request'::text,'legal_hold'::text,NULL,NULL,NULL
         ) AS payload`,
        [fixture.requestId]
      );
      expect(hold).toMatchObject({ ok: true, code: "hold_created" });

      const second = new Client({ connectionString: dbUrl! });
      await second.connect();
      try {
        const releases = await Promise.all([
          asAuthenticatedOwner<ProfileMediaRpcPayload>(
            client,
            `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
            [hold.hold_id],
            { aal2: true }
          ),
          asAuthenticatedOwner<ProfileMediaRpcPayload>(
            second,
            `SELECT public.release_account_deletion_storage_preservation_hold($1::uuid) AS payload`,
            [hold.hold_id],
            { aal2: true }
          ),
        ]);
        expect(releases.filter((row) => row.code === "hold_released")).toHaveLength(1);
        expect(
          releases.filter((row) => row.code === "hold_already_released")
        ).toHaveLength(1);
        const audit = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM public.account_deletion_storage_execution_audit
           WHERE hold_id = $1
             AND event_type = 'hold_released'`,
          [hold.hold_id]
        );
        expect(audit.rows[0]?.count).toBe("1");
      } finally {
        await second.end();
      }
    });

    it("B1-CONCURRENCY-AUTHORIZE-HOLD: hold either wins precommit or is rejected postcommit", async () => {
      const fixture = await driveLifecycleToProfileMedia(client);
      const claim = await claimProfileMedia(client, fixture);
      const second = new Client({ connectionString: dbUrl! });
      await second.connect();
      try {
        const [authorization, hold] = await Promise.all([
          authorizeProfileMedia(client, fixture, String(claim.claim_token)),
          asAuthenticatedOwner<ProfileMediaRpcPayload>(
            second,
            `SELECT public.create_account_deletion_storage_preservation_hold(
               $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
             ) AS payload`,
            [fixture.requestId, fixture.attemptId, fixture.manifestId]
          ),
        ]);
        if (authorization.ok === true) {
          expect(authorization.code).toBe("authorized");
          expect(hold).toMatchObject({
            ok: false,
            code: "delete_already_committed",
          });
        } else {
          expect(authorization.code).toBe("preservation_hold_active");
          expect(hold.ok).toBe(true);
          const state = await client.query<{
            execution_state: string;
            delete_commit_token: string | null;
          }>(
            `SELECT execution_state, delete_commit_token
             FROM public.account_deletion_storage_execution_results WHERE id = $1`,
            [fixture.resultId]
          );
          expect(state.rows[0]).toEqual({
            execution_state: "deferred_profile",
            delete_commit_token: null,
          });
        }
      } finally {
        await second.end();
      }
    });
  }
);
