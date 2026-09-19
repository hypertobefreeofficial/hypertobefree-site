import { Client } from "pg";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  INTEGRATION_SUPABASE_AUTH_JWT_STUB_NOTE,
  INTEGRATION_SUPABASE_AUTH_JWT_STUB_SQL,
  INTEGRATION_SUPABASE_AUTH_UID_STUB_NOTE,
  INTEGRATION_SUPABASE_AUTH_UID_STUB_SQL,
  INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_NOTE,
  INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_SQL,
  INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_NOTE,
  INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_SQL,
  PRODUCTION_BASELINE_MIGRATION_FILENAME,
  applyAccountDeletionMigrations,
  applyOneAccountDeletionMigration,
  ensureIntegrationDatabaseRoles,
  ensureIntegrationPostgresRole,
  getAccountDeletionIntegrationDbUrl,
  installSupabaseAuthStubs,
  installSupabaseHarnessStubs,
  isProductionBaselineMigration,
  listAccountDeletionMigrations,
  readMigrationFile,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";

const integrationDbUrl = getAccountDeletionIntegrationDbUrl();
const describeLiveAuth = integrationDbUrl ? describe : describe.skip;
const describeLiveStorage = integrationDbUrl ? describe : describe.skip;
const describeLivePostgresRole = integrationDbUrl ? describe : describe.skip;
const describeLiveAuthUsers = integrationDbUrl ? describe : describe.skip;

const TEST_SUBJECT_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEST_AUTH_USER_UUID = "99999999-9999-4999-8999-999999999999";

describe("accountDeletionIntegrationHarness", () => {
  it("recognizes the production baseline migration filename specifically", () => {
    const baselinePath = path.join(
      "supabase/migrations",
      PRODUCTION_BASELINE_MIGRATION_FILENAME
    );
    expect(isProductionBaselineMigration(baselinePath)).toBe(true);
    expect(
      isProductionBaselineMigration(
        "supabase/migrations/20260829190000_account_deletion_lifecycle_phase4c7b1b.sql"
      )
    ).toBe(false);
  });

  it("preserves sorted migration order with baseline first among dated files", () => {
    const migrations = listAccountDeletionMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    expect(path.basename(migrations[0]!)).toBe(
      PRODUCTION_BASELINE_MIGRATION_FILENAME
    );
    const sorted = [...migrations].sort();
    expect(migrations).toEqual(sorted);
  });

  it("disables check_function_bodies only for baseline and restores after success", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const baselinePath = path.join(
      "supabase/migrations",
      PRODUCTION_BASELINE_MIGRATION_FILENAME
    );
    const laterPath =
      "supabase/migrations/20260829190000_account_deletion_lifecycle_phase4c7b1b.sql";

    await applyOneAccountDeletionMigration(
      { query },
      baselinePath,
      "SELECT baseline;"
    );
    await applyOneAccountDeletionMigration({ query }, laterPath, "SELECT later;");

    const calls = query.mock.calls.map(([text]) => String(text));
    expect(calls[0]).toContain("CREATE OR REPLACE FUNCTION auth.jwt()");
    expect(calls[1]).toContain("CREATE OR REPLACE FUNCTION auth.uid()");
    expect(calls[2]).toContain("CREATE OR REPLACE FUNCTION storage.foldername(name text)");
    expect(calls.slice(3)).toEqual([
      "SET check_function_bodies = off",
      "SELECT baseline;",
      "SET check_function_bodies = on",
      "SELECT later;",
    ]);
  });

  it("restores check_function_bodies even when baseline execution fails", async () => {
    const query = vi.fn(async (text: string) => {
      if (text === "SELECT fail;") {
        throw new Error("baseline failed");
      }
      if (text === "ROLLBACK") {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const baselinePath = path.join(
      "supabase/migrations",
      PRODUCTION_BASELINE_MIGRATION_FILENAME
    );

    await expect(
      applyOneAccountDeletionMigration(
        { query },
        baselinePath,
        "SELECT fail;"
      )
    ).rejects.toThrow("baseline failed");

    const setCalls = query.mock.calls
      .map(([text]) => String(text))
      .filter((text) => text.includes("check_function_bodies"));
    expect(setCalls).toEqual([
      "SET check_function_bodies = off",
      "SET check_function_bodies = on",
    ]);
    expect(query.mock.calls.map(([text]) => String(text))).toContain("ROLLBACK");
  });

  it("does not disable check_function_bodies for later migrations", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const baselinePath = path.join(
      "supabase/migrations",
      PRODUCTION_BASELINE_MIGRATION_FILENAME
    );
    const laterPath =
      "supabase/migrations/20260830160000_account_deletion_nondestructive_database_stage_phase4c7b1e2c3b1.sql";

    await applyOneAccountDeletionMigration(
      { query },
      baselinePath,
      "SELECT baseline;"
    );
    await applyOneAccountDeletionMigration({ query }, laterPath, "SELECT later;");

    const calls = query.mock.calls.map(([text]) => String(text));
    expect(calls.filter((text) => text.includes("= off"))).toHaveLength(1);
    expect(calls.at(-1)).toBe("SELECT later;");
  });

  it("documents auth.jwt() stub as integration-harness-only", () => {
    expect(INTEGRATION_SUPABASE_AUTH_JWT_STUB_NOTE).toContain(
      "integration harness"
    );
    expect(INTEGRATION_SUPABASE_AUTH_JWT_STUB_SQL).toContain(
      "CREATE OR REPLACE FUNCTION auth.jwt()"
    );
    expect(INTEGRATION_SUPABASE_AUTH_JWT_STUB_SQL).toContain(
      "request.jwt.claims"
    );
    expect(INTEGRATION_SUPABASE_AUTH_JWT_STUB_SQL).not.toContain(
      "hypertobefree@gmail.com"
    );
    expect(INTEGRATION_SUPABASE_AUTH_JWT_STUB_SQL).not.toContain("SECURITY DEFINER");
  });

  it("documents postgres role bootstrap as integration-harness-only", () => {
    expect(INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_NOTE).toContain(
      "integration harness"
    );
    expect(INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_SQL).toContain(
      "WHERE rolname = 'postgres'"
    );
    expect(INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_SQL).toContain(
      "CREATE ROLE postgres NOLOGIN SUPERUSER"
    );
    expect(INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_SQL).not.toContain("ALTER ROLE");
    expect(INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_SQL).not.toContain("PASSWORD");
    expect(INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_SQL).not.toMatch(
      /GRANT.*TO (authenticated|anon|service_role)/i
    );
  });

  it("installs harness stubs during reset before baseline migration path", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const baselinePath = path.join(
      "supabase/migrations",
      PRODUCTION_BASELINE_MIGRATION_FILENAME
    );

    await resetAccountDeletionIntegrationSchema({ query });
    await applyOneAccountDeletionMigration({ query }, baselinePath, "SELECT baseline;");

    const calls = query.mock.calls.map(([text]) => String(text));
    const postgresIndex = calls.findIndex((text) =>
      text.includes("WHERE rolname = 'postgres'")
    );
    const bucketsIndex = calls.findIndex((text) =>
      text.includes("CREATE TABLE IF NOT EXISTS storage.buckets")
    );
    const jwtIndex = calls.findIndex((text) =>
      text.includes("CREATE OR REPLACE FUNCTION auth.jwt()")
    );
    const uidIndex = calls.findIndex((text) =>
      text.includes("CREATE OR REPLACE FUNCTION auth.uid()")
    );
    const foldernameIndex = calls.findIndex((text) =>
      text.includes("CREATE OR REPLACE FUNCTION storage.foldername(name text)")
    );
    const offIndex = calls.findIndex(
      (text) => text === "SET check_function_bodies = off"
    );

    expect(postgresIndex).toBeGreaterThanOrEqual(0);
    expect(bucketsIndex).toBeGreaterThan(postgresIndex);
    expect(jwtIndex).toBeGreaterThan(bucketsIndex);
    expect(uidIndex).toBeGreaterThan(jwtIndex);
    expect(foldernameIndex).toBeGreaterThan(uidIndex);
    expect(offIndex).toBeGreaterThan(foldernameIndex);
  });

  it("documents auth.uid() stub as integration-harness-only JWT sub derivation", () => {
    expect(INTEGRATION_SUPABASE_AUTH_UID_STUB_NOTE).toContain(
      "integration harness"
    );
    expect(INTEGRATION_SUPABASE_AUTH_UID_STUB_SQL).toContain(
      "CREATE OR REPLACE FUNCTION auth.uid()"
    );
    expect(INTEGRATION_SUPABASE_AUTH_UID_STUB_SQL).toContain("auth.jwt()");
    expect(INTEGRATION_SUPABASE_AUTH_UID_STUB_SQL).toContain("->> 'sub'");
    expect(INTEGRATION_SUPABASE_AUTH_UID_STUB_SQL).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    expect(INTEGRATION_SUPABASE_AUTH_UID_STUB_SQL).not.toContain("SECURITY DEFINER");
  });

  it("documents storage.foldername() stub as integration-harness-only Supabase semantics", () => {
    expect(INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_NOTE).toContain(
      "integration harness"
    );
    expect(INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_SQL).toContain(
      "CREATE OR REPLACE FUNCTION storage.foldername(name text)"
    );
    expect(INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_SQL).toContain(
      "string_to_array(name, '/')"
    );
    expect(INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_SQL).not.toContain(
      "SECURITY DEFINER"
    );
    expect(INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_SQL).not.toMatch(
      /INSERT INTO storage\.buckets/i
    );
  });

  it("defines auth.users stub columns required by production baseline trigger", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await resetAccountDeletionIntegrationSchema({ query });

    const schemaSql = String(
      query.mock.calls.find(([text]) =>
        String(text).includes("CREATE TABLE IF NOT EXISTS auth.users")
      )?.[0]
    );
    expect(schemaSql).toContain("id uuid PRIMARY KEY");
    expect(schemaSql).toContain("email text");
    expect(schemaSql).toContain("created_at timestamptz DEFAULT now()");
    expect(schemaSql).toContain("raw_user_meta_data jsonb DEFAULT '{}'::jsonb");
    expect(schemaSql).not.toContain("raw_app_meta_data");
  });

  it("defines storage.buckets stub columns required by production baseline", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await resetAccountDeletionIntegrationSchema({ query });

    const schemaSql = String(
      query.mock.calls.find(([text]) =>
        String(text).includes("CREATE TABLE IF NOT EXISTS storage.buckets")
      )?.[0]
    );
    expect(schemaSql).toContain("file_size_limit bigint");
    expect(schemaSql).toContain("allowed_mime_types text[]");
    expect(schemaSql).not.toMatch(/INSERT INTO storage\.buckets/i);
  });

  it("applies full migration list through applyAccountDeletionMigrations", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const migrations = listAccountDeletionMigrations();

    await applyAccountDeletionMigrations({ query });

    expect(path.basename(migrations[0]!)).toBe(
      PRODUCTION_BASELINE_MIGRATION_FILENAME
    );
    expect(String(query.mock.calls[0]?.[0])).toContain(
      "CREATE OR REPLACE FUNCTION auth.jwt()"
    );
    expect(
      query.mock.calls.some(
        ([text]) => String(text) === "SET check_function_bodies = off"
      )
    ).toBe(true);
    expect(
      query.mock.calls.some(([text]) => String(text) === "SET check_function_bodies = on")
    ).toBe(true);
    expect(query.mock.calls.length).toBeGreaterThan(migrations.length);
  });
});

describeLiveStorage("Supabase storage harness live schema and semantics", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: integrationDbUrl! });
    await client.connect();
    await client.query("DROP SCHEMA IF EXISTS storage CASCADE");
    await client.query("CREATE SCHEMA storage");
    await client.query(`
      CREATE TABLE IF NOT EXISTS storage.buckets (
        id text PRIMARY KEY,
        name text NOT NULL,
        public boolean DEFAULT false,
        file_size_limit bigint,
        allowed_mime_types text[]
      )
    `);
    await installSupabaseHarnessStubs(client);
  });

  afterAll(async () => {
    await client.end();
  });

  it("installs storage.foldername(text) before baseline would run", async () => {
    const { rows } = await client.query<{ proname: string }>(`
      SELECT proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'storage'
        AND p.proname = 'foldername'
    `);
    expect(rows).toHaveLength(1);
  });

  it("returns nested folder path segments for folder/subfolder/file.mp4", async () => {
    const { rows } = await client.query<{ folders: string[] }>(
      "SELECT storage.foldername('folder/subfolder/file.mp4') AS folders"
    );
    expect(rows[0]?.folders).toEqual(["folder", "subfolder"]);
  });

  it("returns single folder segment for folder/file.mp4", async () => {
    const { rows } = await client.query<{ folders: string[] }>(
      "SELECT storage.foldername('folder/file.mp4') AS folders"
    );
    expect(rows[0]?.folders).toEqual(["folder"]);
  });

  it("returns empty array for filename with no folder prefix", async () => {
    const { rows } = await client.query<{ folders: string[] | null }>(
      "SELECT storage.foldername('file.mp4') AS folders"
    );
    expect(rows[0]?.folders).toEqual([]);
  });

  it("creates file_size_limit as bigint-compatible column", async () => {
    const { rows } = await client.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
    }>(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'storage'
        AND table_name = 'buckets'
        AND column_name = 'file_size_limit'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data_type).toBe("bigint");
    expect(rows[0]?.udt_name).toBe("int8");
  });

  it("creates allowed_mime_types as text[] column", async () => {
    const { rows } = await client.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
    }>(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'storage'
        AND table_name = 'buckets'
        AND column_name = 'allowed_mime_types'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data_type).toBe("ARRAY");
    expect(rows[0]?.udt_name).toBe("_text");
  });
});

describeLivePostgresRole("Integration postgres role bootstrap live semantics", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: integrationDbUrl! });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  async function readPostgresRole() {
    const { rows } = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolcanlogin: boolean;
    }>(`
      SELECT rolname, rolsuper, rolcanlogin
      FROM pg_roles
      WHERE rolname = 'postgres'
    `);
    return rows[0] ?? null;
  }

  it("creates postgres role as NOLOGIN SUPERUSER when absent", async () => {
    await ensureIntegrationPostgresRole(client);
    const role = await readPostgresRole();
    expect(role).toMatchObject({
      rolname: "postgres",
      rolsuper: true,
      rolcanlogin: false,
    });
  });

  it("bootstrap is idempotent and does not alter an existing postgres role", async () => {
    const before = await readPostgresRole();
    expect(before).not.toBeNull();

    await ensureIntegrationPostgresRole(client);
    await ensureIntegrationPostgresRole(client);

    const after = await readPostgresRole();
    expect(after).toEqual(before);
  });

  it("does not store a password for the postgres role", async () => {
    const { rows } = await client.query<{ has_password: boolean }>(`
      SELECT rolpassword IS NOT NULL AS has_password
      FROM pg_authid
      WHERE rolname = 'postgres'
    `);
    expect(rows[0]?.has_password).toBe(false);
  });

  it("installs postgres role before schemas during reset bootstrap", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await resetAccountDeletionIntegrationSchema({ query });
    const calls = query.mock.calls.map(([text]) => String(text));
    const postgresIndex = calls.findIndex((text) =>
      text.includes("WHERE rolname = 'postgres'")
    );
    const bucketsIndex = calls.findIndex((text) =>
      text.includes("CREATE TABLE IF NOT EXISTS storage.buckets")
    );
    expect(postgresIndex).toBeGreaterThanOrEqual(0);
    expect(bucketsIndex).toBeGreaterThan(postgresIndex);
  });
});

describeLiveAuthUsers("Supabase auth.users stub live schema", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: integrationDbUrl! });
    await client.connect();
    await resetAccountDeletionIntegrationSchema(client);
    const baselinePath = path.join(
      "supabase/migrations",
      PRODUCTION_BASELINE_MIGRATION_FILENAME
    );
    await applyOneAccountDeletionMigration(
      client,
      baselinePath,
      readMigrationFile(baselinePath)
    );
  }, 300_000);

  afterAll(async () => {
    await client.end();
  });

  it("creates raw_user_meta_data as jsonb with empty-object default", async () => {
    const { rows } = await client.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
      column_default: string | null;
    }>(`
      SELECT column_name, data_type, udt_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'users'
        AND column_name = 'raw_user_meta_data'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data_type).toBe("jsonb");
    expect(rows[0]?.udt_name).toBe("jsonb");
    expect(rows[0]?.column_default).toContain("'{}'::jsonb");
  });

  it("defaults raw_user_meta_data to {} when omitted on insert", async () => {
    await client.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, 'auth-users-stub@test.local')`,
      [TEST_AUTH_USER_UUID]
    );

    const { rows } = await client.query<{ raw_user_meta_data: Record<string, unknown> }>(
      `SELECT raw_user_meta_data FROM auth.users WHERE id = $1`,
      [TEST_AUTH_USER_UUID]
    );
    expect(rows[0]?.raw_user_meta_data).toEqual({});

    await client.query(`DELETE FROM auth.users WHERE id = $1`, [TEST_AUTH_USER_UUID]);
  });

  it("allows baseline auth.users insert trigger to read raw_user_meta_data", async () => {
    await client.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, 'auth-trigger-stub@test.local')`,
      [TEST_AUTH_USER_UUID]
    );

    const profile = await client.query(
      `SELECT id, email FROM public.profiles WHERE id = $1`,
      [TEST_AUTH_USER_UUID]
    );
    expect(profile.rows).toHaveLength(1);
    expect(profile.rows[0]).toMatchObject({
      id: TEST_AUTH_USER_UUID,
      email: "auth-trigger-stub@test.local",
    });

    await client.query(`DELETE FROM auth.users WHERE id = $1`, [TEST_AUTH_USER_UUID]);
  });
});

describeLiveAuth("Supabase auth stub live semantics", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: integrationDbUrl! });
    await client.connect();
    await client.query("CREATE SCHEMA IF NOT EXISTS auth");
    await installSupabaseAuthStubs(client);
  });

  afterAll(async () => {
    await client.end();
  });

  it("returns empty object when request.jwt.claims is missing", async () => {
    const { rows } = await client.query<{ jwt: Record<string, unknown> }>(
      "SELECT auth.jwt() AS jwt"
    );
    expect(rows[0]?.jwt).toEqual({});
  });

  it("reads configured request.jwt.claims JSON", async () => {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      ['{"email":"integration@test.local","sub":"claim-subject"}']
    );
    const { rows } = await client.query<{ jwt: Record<string, unknown> }>(
      "SELECT auth.jwt() AS jwt"
    );
    expect(rows[0]?.jwt).toMatchObject({
      email: "integration@test.local",
      sub: "claim-subject",
    });
    await client.query("ROLLBACK");
  });

  it("returns NULL from auth.uid() when request.jwt.claims is missing", async () => {
    const { rows } = await client.query<{ uid: string | null }>(
      "SELECT auth.uid() AS uid"
    );
    expect(rows[0]?.uid).toBeNull();
  });

  it("returns NULL from auth.uid() when JWT claims omit sub", async () => {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      ['{"email":"integration@test.local"}']
    );
    const { rows } = await client.query<{ uid: string | null }>(
      "SELECT auth.uid() AS uid"
    );
    expect(rows[0]?.uid).toBeNull();
    await client.query("ROLLBACK");
  });

  it("returns exact UUID from auth.uid() when JWT sub is a valid UUID", async () => {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      [`{"sub":"${TEST_SUBJECT_UUID}"}`]
    );
    const { rows } = await client.query<{ uid: string }>(
      "SELECT auth.uid()::text AS uid"
    );
    expect(rows[0]?.uid).toBe(TEST_SUBJECT_UUID);
    await client.query("ROLLBACK");
  });
});
