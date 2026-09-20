import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyOneAccountDeletionMigration,
  getAccountDeletionIntegrationDbUrl,
  listAccountDeletionMigrations,
  readMigrationFile,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import { ACCOUNT_DELETION_REQUEST_PRIVILEGE_MIGRATION } from "./accountDeletionDatabasePolicy";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration = dbUrl ? describe : describe.skip;

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CANCEL_REQUEST = "11111111-1111-4111-8111-111111111111";
const REJECT_REQUEST = "22222222-2222-4222-8222-222222222222";
const EXEC_REQUEST = "33333333-3333-4333-8333-333333333333";

const PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
] as const;

let serviceRoleGrantsApplied = false;
let authenticatedGrantsApplied = false;

async function privilege(
  client: Client,
  name: (typeof PRIVILEGES)[number]
): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT pg_catalog.has_table_privilege('service_role', 'public.account_deletion_requests', $1) AS allowed`,
    [name]
  );
  return result.rows[0]?.allowed === true;
}

async function ensureHashtextextendedStub(client: Client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION public.hashtextextended(text, bigint)
    RETURNS bigint
    LANGUAGE sql
    IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT pg_catalog.hashtextextended($1, $2) $$;
  `);
}

async function ensureRoles(client: Client) {
  if (!serviceRoleGrantsApplied) {
    await client.query(`
      GRANT USAGE ON SCHEMA public TO service_role;
      ALTER ROLE service_role BYPASSRLS;
    `);
    serviceRoleGrantsApplied = true;
  }
  if (!authenticatedGrantsApplied) {
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
}

async function seedUsers(client: Client) {
  await client.query(
    `
    INSERT INTO auth.users (id, email) VALUES
      ($1, 'target-priv@test.local'),
      ($2, 'owner-priv@test.local')
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, OWNER]
  );
  await client.query(
    `
    INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
    VALUES
      ($1, 'target-priv@test.local', 'target_priv', 'Target', false, false),
      ($2, 'owner-priv@test.local', 'owner_priv', 'Owner', false, false)
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, OWNER]
  );
  await client.query("BEGIN");
  try {
    await client.query(
      `ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_roles_trigger`
    );
    await client.query(
      `UPDATE public.profiles SET is_owner = true, is_admin = true WHERE id = $1`,
      [OWNER]
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

async function asAuthenticated(
  client: Client,
  userId: string,
  sql: string,
  params: unknown[]
) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId }),
    ]);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

describeIntegration(
  `account deletion request privilege hardening (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);

      const privilegeFile = ACCOUNT_DELETION_REQUEST_PRIVILEGE_MIGRATION.filename;
      for (const filePath of listAccountDeletionMigrations()) {
        if (filePath.endsWith(privilegeFile)) {
          continue;
        }
        await applyOneAccountDeletionMigration(
          client,
          filePath,
          readMigrationFile(filePath)
        );
      }

      await ensureHashtextextendedStub(client);
      await ensureRoles(client);

      await client.query(
        `GRANT ALL ON TABLE public.account_deletion_requests TO service_role`
      );
      expect(await privilege(client, "UPDATE")).toBe(true);

      const hardeningPath = listAccountDeletionMigrations().find((filePath) =>
        filePath.endsWith(privilegeFile)
      );
      if (!hardeningPath) {
        throw new Error("privilege hardening migration missing");
      }
      await applyOneAccountDeletionMigration(
        client,
        hardeningPath,
        readMigrationFile(hardeningPath)
      );
      await seedUsers(client);
    }, 300_000);

    afterAll(async () => {
      await client?.end();
    });

    it("hardens service_role to SELECT only", async () => {
      expect(await privilege(client, "SELECT")).toBe(true);
      expect(await privilege(client, "INSERT")).toBe(false);
      expect(await privilege(client, "UPDATE")).toBe(false);
      expect(await privilege(client, "DELETE")).toBe(false);
      expect(await privilege(client, "TRUNCATE")).toBe(false);
      expect(await privilege(client, "REFERENCES")).toBe(false);
      expect(await privilege(client, "TRIGGER")).toBe(false);
    });

    it("readiness is true, and a restored UPDATE privilege fails the probe", async () => {
      const ready = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_request_table_privileges_ready()->>'ready')::boolean AS ready`
      );
      expect(ready.rows[0]?.ready).toBe(true);
      const composed = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_schema_execution_ready()->>'ready')::boolean AS ready`
      );
      expect(composed.rows[0]?.ready).toBe(true);

      await client.query("BEGIN");
      await client.query(
        `GRANT UPDATE ON TABLE public.account_deletion_requests TO service_role`
      );
      const broken = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_request_table_privileges_ready()->>'ready')::boolean AS ready`
      );
      expect(broken.rows[0]?.ready).toBe(false);
      await client.query("ROLLBACK");

      const restored = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_request_table_privileges_ready()->>'ready')::boolean AS ready`
      );
      expect(restored.rows[0]?.ready).toBe(true);
    });

    it("denies direct service_role writes and still allows SELECT", async () => {
      await asAuthenticated(
        client,
        TARGET,
        `
        INSERT INTO public.account_deletion_requests (
          id, user_id, status, target_username_snapshot, email
        ) VALUES ($1, $2, 'submitted', 'target_priv', 'target-priv@test.local')
        `,
        [EXEC_REQUEST, TARGET]
      );

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      const selected = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [EXEC_REQUEST]
      );
      expect(selected.rows[0]?.status).toBe("submitted");
      await client.query("COMMIT");

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      await expect(
        client.query(
          `
          INSERT INTO public.account_deletion_requests (id, user_id, status, email)
          VALUES ($1, $2, 'submitted', 'x@test.local')
          `,
          ["44444444-4444-4444-8444-444444444444", TARGET]
        )
      ).rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      await expect(
        client.query(
          `UPDATE public.account_deletion_requests SET status = 'approved' WHERE id = $1`,
          [EXEC_REQUEST]
        )
      ).rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      await expect(
        client.query(
          `DELETE FROM public.account_deletion_requests WHERE id = $1`,
          [EXEC_REQUEST]
        )
      ).rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      await expect(
        client.query(`TRUNCATE TABLE public.account_deletion_requests`)
      ).rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK");
    });

    it("keeps authenticated submit, cancel, review, reject, and approve", async () => {
      await asAuthenticated(
        client,
        TARGET,
        `
        INSERT INTO public.account_deletion_requests (
          id, user_id, status, target_username_snapshot, email
        ) VALUES ($1, $2, 'submitted', 'target_priv', 'target-priv@test.local')
        `,
        [CANCEL_REQUEST, TARGET]
      );
      const cancelled = await asAuthenticated(
        client,
        TARGET,
        `
        UPDATE public.account_deletion_requests
        SET status = 'cancelled', cancelled_at = now()
        WHERE id = $1 AND status = 'submitted'
        `,
        [CANCEL_REQUEST]
      );
      expect(cancelled.rowCount).toBe(1);

      await asAuthenticated(
        client,
        TARGET,
        `
        INSERT INTO public.account_deletion_requests (
          id, user_id, status, target_username_snapshot, email
        ) VALUES ($1, $2, 'submitted', 'target_priv', 'target-priv@test.local')
        `,
        [REJECT_REQUEST, TARGET]
      );
      const reviewing = await asAuthenticated(
        client,
        OWNER,
        `
        UPDATE public.account_deletion_requests
        SET status = 'reviewing'
        WHERE id = $1 AND status = 'submitted'
        `,
        [REJECT_REQUEST]
      );
      expect(reviewing.rowCount).toBe(1);
      const rejected = await asAuthenticated(
        client,
        OWNER,
        `
        UPDATE public.account_deletion_requests
        SET status = 'rejected', rejected_at = now(), reviewed_at = now(), reviewed_by = $2
        WHERE id = $1 AND status = 'reviewing'
        `,
        [REJECT_REQUEST, OWNER]
      );
      expect(rejected.rowCount).toBe(1);

      const approved = await asAuthenticated(
        client,
        OWNER,
        `
        UPDATE public.account_deletion_requests
        SET status = 'approved', approved_at = now(), approved_by = $2,
            reviewed_at = now(), reviewed_by = $2
        WHERE id = $1 AND status = 'submitted'
        `,
        [EXEC_REQUEST, OWNER]
      );
      expect(approved.rowCount).toBe(1);
    });

    it("acquisition and cancellation still run as postgres-owned functions", async () => {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      const acquired = await client.query<{
        payload: { ok?: boolean; code?: string; attempt_id?: string };
      }>(
        `SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS payload`,
        [EXEC_REQUEST, OWNER]
      );
      await client.query("COMMIT");
      expect(acquired.rows[0]?.payload?.ok).toBe(true);
      expect(acquired.rows[0]?.payload?.code).toBe("acquired");
      const attemptId = acquired.rows[0]?.payload?.attempt_id;
      expect(typeof attemptId).toBe("string");

      const inProgress = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [EXEC_REQUEST]
      );
      expect(inProgress.rows[0]?.status).toBe("deletion_in_progress");

      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE service_role");
      const cancelled = await client.query<{
        payload: { ok?: boolean; code?: string };
      }>(
        `SELECT public.cancel_account_deletion_execution($1::uuid, $2::uuid, $3::uuid) AS payload`,
        [EXEC_REQUEST, attemptId, OWNER]
      );
      await client.query("COMMIT");
      expect(cancelled.rows[0]?.payload).toMatchObject({
        ok: true,
        code: "cancelled",
      });

      const restored = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [EXEC_REQUEST]
      );
      expect(restored.rows[0]?.status).toBe("approved");
    });
  }
);
