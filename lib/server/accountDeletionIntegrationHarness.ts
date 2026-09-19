import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV =
  "ACCOUNT_DELETION_INTEGRATION_DB_URL" as const;

export const PRODUCTION_BASELINE_MIGRATION_FILENAME =
  "20260816183000_current_production_baseline.sql" as const;

export function isProductionBaselineMigration(filePath: string): boolean {
  return path.basename(filePath) === PRODUCTION_BASELINE_MIGRATION_FILENAME;
}

/** Installed only by the local account-deletion integration harness — not Production. */
export const INTEGRATION_SUPABASE_AUTH_JWT_STUB_NOTE =
  "Test-only auth.jwt() reads request.jwt.claims like Supabase/PostgREST; installed by integration harness bootstrap only.";

export const INTEGRATION_SUPABASE_AUTH_JWT_STUB_SQL = `
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;
`.trim();

export async function installSupabaseAuthJwtStub(
  client: PgQueryClient
): Promise<void> {
  await client.query(INTEGRATION_SUPABASE_AUTH_JWT_STUB_SQL);
}

/** Installed only by the local account-deletion integration harness — not Production. */
export const INTEGRATION_SUPABASE_AUTH_UID_STUB_NOTE =
  "Test-only auth.uid() derives JWT sub via auth.jwt(); installed by integration harness bootstrap only.";

export const INTEGRATION_SUPABASE_AUTH_UID_STUB_SQL = `
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
$$;
`.trim();

export async function installSupabaseAuthUidStub(
  client: PgQueryClient
): Promise<void> {
  await client.query(INTEGRATION_SUPABASE_AUTH_UID_STUB_SQL);
}

export async function installSupabaseAuthStubs(
  client: PgQueryClient
): Promise<void> {
  await installSupabaseAuthJwtStub(client);
  await installSupabaseAuthUidStub(client);
}

/** Installed only by the local account-deletion integration harness — not Production. */
export const INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_NOTE =
  "Test-only storage.foldername() matches Supabase Storage path parsing; installed by integration harness bootstrap only.";

export const INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_SQL = `
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql
AS $function$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts,1)-1];
END
$function$;
`.trim();

export async function installSupabaseStorageFoldernameStub(
  client: PgQueryClient
): Promise<void> {
  await client.query(INTEGRATION_SUPABASE_STORAGE_FOLDERNAME_STUB_SQL);
}

export async function installSupabaseHarnessStubs(
  client: PgQueryClient
): Promise<void> {
  await installSupabaseAuthStubs(client);
  await installSupabaseStorageFoldernameStub(client);
}

export function getAccountDeletionIntegrationDbUrl(): string | null {
  const url = process.env[ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV];
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

export function listAccountDeletionMigrations(): string[] {
  const migrationsDir = path.join(process.cwd(), "supabase/migrations");
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(migrationsDir, name));
}

export function readMigrationFile(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

export type PgQueryClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

async function rollbackOpenTransaction(client: PgQueryClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // No open transaction — safe to ignore before restoring session settings.
  }
}

export async function applyOneAccountDeletionMigration(
  client: PgQueryClient,
  filePath: string,
  sql: string
): Promise<void> {
  if (isProductionBaselineMigration(filePath)) {
    await installSupabaseHarnessStubs(client);
    await client.query("SET check_function_bodies = off");
    try {
      await client.query(sql);
    } catch (error) {
      await rollbackOpenTransaction(client);
      throw error;
    } finally {
      await client.query("SET check_function_bodies = on");
    }
    return;
  }

  try {
    await client.query(sql);
  } catch (error) {
    await rollbackOpenTransaction(client);
    throw error;
  }
}

export async function applyAccountDeletionMigrations(
  client: PgQueryClient
): Promise<void> {
  for (const filePath of listAccountDeletionMigrations()) {
    await applyOneAccountDeletionMigration(
      client,
      filePath,
      readMigrationFile(filePath)
    );
  }
}

export async function resetAccountDeletionIntegrationSchema(
  client: PgQueryClient
): Promise<void> {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("DROP SCHEMA IF EXISTS auth CASCADE");
  await client.query("DROP SCHEMA IF EXISTS storage CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.query("GRANT ALL ON SCHEMA public TO public");
  await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await ensureIntegrationDatabaseRoles(client);
  await ensureMinimalSupabaseSchemas(client);
  await installSupabaseHarnessStubs(client);
}

/** Installed only by the local account-deletion integration harness — not Production. */
export const INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_NOTE =
  "Test-only postgres role for local Homebrew clusters missing Supabase migration owners; integration harness bootstrap only.";

export const INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres'
  ) THEN
    CREATE ROLE postgres NOLOGIN SUPERUSER;
  END IF;
END
$$;
`.trim();

export async function ensureIntegrationPostgresRole(
  client: PgQueryClient
): Promise<void> {
  await client.query(INTEGRATION_POSTGRES_ROLE_BOOTSTRAP_SQL);
}

export async function ensureIntegrationDatabaseRoles(
  client: PgQueryClient
): Promise<void> {
  await ensureIntegrationPostgresRole(client);
  await client.query(`
    DO $$
    BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    DO $$
    BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

    DO $$
    BEGIN
      CREATE ROLE anon NOLOGIN;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

export async function ensureMinimalSupabaseSchemas(
  client: PgQueryClient
): Promise<void> {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text,
      created_at timestamptz DEFAULT now(),
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb
    );

    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text,
      name text,
      owner uuid,
      created_at timestamptz DEFAULT now()
    );
  `);
}

export async function installIntegrationFailureHook(
  client: PgQueryClient
): Promise<void> {
  await client.query(`
    CREATE OR REPLACE FUNCTION public.__account_deletion_test_fail_after_prayer()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF current_setting('htbf.account_deletion_test_fail_after_prayer', true) = '1' THEN
        RAISE EXCEPTION 'test_invariant_failed' USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS __account_deletion_test_fail_after_prayer
      ON public.prayer_video_responses;

    CREATE TRIGGER __account_deletion_test_fail_after_prayer
      BEFORE UPDATE ON public.prayer_video_responses
      FOR EACH ROW
      EXECUTE FUNCTION public.__account_deletion_test_fail_after_prayer();
  `);
}

export async function removeIntegrationFailureHook(
  client: PgQueryClient
): Promise<void> {
  await client.query(`
    DROP TRIGGER IF EXISTS __account_deletion_test_fail_after_prayer
      ON public.prayer_video_responses;
    DROP FUNCTION IF EXISTS public.__account_deletion_test_fail_after_prayer();
  `);
}
