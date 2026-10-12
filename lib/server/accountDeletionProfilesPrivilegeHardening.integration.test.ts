/**
 * PostgreSQL integration for 3B.4C.1a profiles service_role DELETE revoke.
 * Simulates Production ACL (service_role holds DELETE) then applies corrective migration.
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyOneAccountDeletionMigration,
  configureIntegrationProfileAvatarApprovedOrigin,
  getAccountDeletionIntegrationDbUrl,
  listAccountDeletionMigrations,
  readMigrationFile,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import { ACCOUNT_DELETION_PROFILES_PRIVILEGE_HARDENING_MIGRATION } from "./accountDeletionDatabasePolicy";
import {
  asAuthenticatedUser,
  asServiceRole,
  assertFreshMigrationProfileHelperPrivileges,
  cleanupProfileIntegration,
  ensureProfileIntegrationGrants,
  RUNNER_IT_TARGET,
} from "./accountDeletionProfileStage.integrationHarness";
import {
  driveLifecycleToProfileReadyForFinalize,
  finalizeProfileStageRpc,
} from "./accountDeletionProfileCompletion.integrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration = dbUrl ? describe : describe.skip;

const HARDENING_FILE =
  ACCOUNT_DELETION_PROFILES_PRIVILEGE_HARDENING_MIGRATION.filename;

type ReadinessPayload = {
  ready?: boolean;
  prerequisites?: Array<{ id?: string; ready?: boolean }>;
};

async function profilesDeletePrivilege(client: Client): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT pg_catalog.has_table_privilege('service_role', 'public.profiles', 'DELETE') AS allowed`
  );
  return result.rows[0]?.allowed === true;
}

async function profilesSelectPrivilege(client: Client): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT pg_catalog.has_table_privilege('service_role', 'public.profiles', 'SELECT') AS allowed`
  );
  return result.rows[0]?.allowed === true;
}

async function profileCompletionReady(client: Client): Promise<ReadinessPayload> {
  const result = await client.query<{ payload: ReadinessPayload }>(
    `SELECT public.verify_account_deletion_profile_completion_ready() AS payload`
  );
  return result.rows[0]?.payload ?? {};
}

async function ensureIntegrationRoles(client: Client) {
  await client.query(`
    DO $$
    BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER ROLE service_role BYPASSRLS;
  `);
  await ensureProfileIntegrationGrants(client);
  await client.query(`
    GRANT INSERT ON TABLE public.profiles TO authenticated;
  `);
}

describeIntegration(
  `account deletion profiles privilege hardening (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;
    let bootstrapDeleteGrantedBeforeMigration = false;
    let bootstrapReadinessFalseBeforeMigration = false;
    let bootstrapSelectHeldAfterMigration = false;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);

      for (const filePath of listAccountDeletionMigrations()) {
        if (filePath.endsWith(HARDENING_FILE)) {
          continue;
        }
        await applyOneAccountDeletionMigration(
          client,
          filePath,
          readMigrationFile(filePath)
        );
      }

      await assertFreshMigrationProfileHelperPrivileges(client);
      await ensureIntegrationRoles(client);

      await client.query(`GRANT SELECT ON TABLE public.profiles TO service_role`);
      await client.query(`GRANT DELETE ON TABLE public.profiles TO service_role`);

      expect(await profilesDeletePrivilege(client)).toBe(true);
      expect(await profilesSelectPrivilege(client)).toBe(true);
      bootstrapDeleteGrantedBeforeMigration = true;

      const beforeReady = await profileCompletionReady(client);
      expect(beforeReady.ready).toBe(false);
      bootstrapReadinessFalseBeforeMigration = true;
      const failing = beforeReady.prerequisites?.find(
        (entry) => entry.id === "profile_completion_no_broad_profiles_delete_grant"
      );
      expect(failing?.ready).toBe(false);

      const hardeningPath = listAccountDeletionMigrations().find((filePath) =>
        filePath.endsWith(HARDENING_FILE)
      );
      if (!hardeningPath) {
        throw new Error("profiles privilege hardening migration missing");
      }
      await applyOneAccountDeletionMigration(
        client,
        hardeningPath,
        readMigrationFile(hardeningPath)
      );
      await configureIntegrationProfileAvatarApprovedOrigin(client);

      expect(await profilesDeletePrivilege(client)).toBe(false);
      expect(await profilesSelectPrivilege(client)).toBe(true);
      bootstrapSelectHeldAfterMigration = true;

      const afterReady = await profileCompletionReady(client);
      expect(afterReady.ready).toBe(true);

      const schema = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_schema_execution_ready()->>'ready')::boolean AS ready`
      );
      expect(schema.rows[0]?.ready).toBe(true);
    }, 300_000);

    afterAll(async () => {
      await client?.end();
    });

    it("1a-BOOTSTRAP: corrective migration applied after simulated Production DELETE=true", () => {
      expect(bootstrapDeleteGrantedBeforeMigration).toBe(true);
      expect(bootstrapReadinessFalseBeforeMigration).toBe(true);
      expect(bootstrapSelectHeldAfterMigration).toBe(true);
    });

    it("1a-PRODUCTION-DEFECT: DELETE true blocks readiness; REVOKE restores readiness", async () => {
      expect(await profilesSelectPrivilege(client)).toBe(true);

      await client.query(`GRANT DELETE ON TABLE public.profiles TO service_role`);
      expect(await profilesDeletePrivilege(client)).toBe(true);

      const broken = await profileCompletionReady(client);
      expect(broken.ready).toBe(false);
      const failingGrant = broken.prerequisites?.find(
        (entry) => entry.id === "profile_completion_no_broad_profiles_delete_grant"
      );
      expect(failingGrant?.ready).toBe(false);

      await client.query(`REVOKE DELETE ON TABLE public.profiles FROM service_role`);
      expect(await profilesDeletePrivilege(client)).toBe(false);

      const restored = await profileCompletionReady(client);
      expect(restored.ready).toBe(true);
      expect(
        restored.prerequisites?.find(
          (entry) => entry.id === "profile_completion_no_broad_profiles_delete_grant"
        )?.ready
      ).toBe(true);

      const schema = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_schema_execution_ready()->>'ready')::boolean AS ready`
      );
      expect(schema.rows[0]?.ready).toBe(true);
    });

    it("1a-FINALIZER: service_role EXECUTE deletes scrubbed shell after DELETE revoke", async () => {
      await cleanupProfileIntegration(client);
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      const beforeAuth = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.users WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      const result = await finalizeProfileStageRpc(
        client,
        fixture.requestId,
        fixture.attemptId
      );
      expect(result).toMatchObject({ ok: true, code: "finalized" });
      const profile = await client.query(
        `SELECT id FROM public.profiles WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(profile.rowCount).toBe(0);
      const attempt = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [fixture.attemptId]
      );
      expect(attempt.rows[0]?.stage).toBe("profile_completed");
      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [fixture.requestId]
      );
      expect(request.rows[0]?.status).toBe("deletion_in_progress");
      const audit = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM public.account_deletion_storage_execution_audit
         WHERE deletion_request_id = $1 AND execution_attempt_id = $2
           AND event_type = 'profile_shell_deleted'`,
        [fixture.requestId, fixture.attemptId]
      );
      expect(Number(audit.rows[0]?.count)).toBe(1);
      const afterAuth = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM auth.users WHERE id = $1`,
        [RUNNER_IT_TARGET]
      );
      expect(afterAuth.rows[0]?.count).toBe(beforeAuth.rows[0]?.count);
    });

    it("1a-AUTH-PROFILE: authenticated UPDATE still allowed when not write-frozen", async () => {
      await cleanupProfileIntegration(client);
      const idRow = await client.query<{ id: string }>(
        `SELECT gen_random_uuid() AS id`
      );
      const userId = idRow.rows[0]!.id;
      await client.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, 'priv-hardening@test.local')`,
        [userId]
      );
      const seeded = await client.query<{ id: string; display_name: string | null }>(
        `SELECT id, display_name FROM public.profiles WHERE id = $1`,
        [userId]
      );
      expect(seeded.rowCount).toBe(1);

      await asAuthenticatedUser(
        client,
        userId,
        `UPDATE public.profiles SET display_name = 'Priv Updated' WHERE id = $1`,
        [userId]
      );
      const row = await client.query<{ display_name: string }>(
        `SELECT display_name FROM public.profiles WHERE id = $1`,
        [userId]
      );
      expect(row.rows[0]?.display_name).toBe("Priv Updated");
    });

    it("1a-RECREATE-DENIED: write-freeze blocks profile INSERT during deletion_in_progress", async () => {
      await cleanupProfileIntegration(client);
      const fixture = await driveLifecycleToProfileReadyForFinalize(client);
      await finalizeProfileStageRpc(client, fixture.requestId, fixture.attemptId);
      await expect(
        asAuthenticatedUser(
          client,
          RUNNER_IT_TARGET,
          `INSERT INTO public.profiles (id, email) VALUES ($1, 'recreated@test.invalid')`,
          [RUNNER_IT_TARGET]
        )
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("1a-IDEMPOTENT: re-applying corrective migration keeps DELETE revoked", async () => {
      const hardeningPath = listAccountDeletionMigrations().find((filePath) =>
        filePath.endsWith(HARDENING_FILE)
      );
      if (!hardeningPath) {
        throw new Error("profiles privilege hardening migration missing");
      }
      await applyOneAccountDeletionMigration(
        client,
        hardeningPath,
        readMigrationFile(hardeningPath)
      );
      expect(await profilesDeletePrivilege(client)).toBe(false);
      expect(await profileCompletionReady(client)).toMatchObject({ ready: true });
    });
  }
);
