/**
 * Live PostgreSQL catalog proof: no unexpected FOREIGN KEY references public.profiles.
 * Required hardening for Phase 3B.4C (repo migration search alone is insufficient).
 */

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";
import { isDedicatedVanillaIntegrationDb } from "./accountDeletionProfileStage.integrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration =
  dbUrl && isDedicatedVanillaIntegrationDb(dbUrl) ? describe : describe.skip;

type ProfileFkRow = {
  constraint_name: string;
  child_schema: string;
  child_table: string;
  child_columns: string;
  referenced_schema: string;
  referenced_table: string;
  referenced_columns: string;
  on_delete: string;
  on_update: string;
};

const PROFILE_FK_CATALOG_SQL = `
SELECT
  c.conname AS constraint_name,
  child_ns.nspname AS child_schema,
  child_rel.relname AS child_table,
  (
    SELECT string_agg(child_att.attname, ', ' ORDER BY ord.ordinality)
    FROM unnest(c.conkey) WITH ORDINALITY AS ord(attnum, ordinality)
    JOIN pg_attribute AS child_att
      ON child_att.attrelid = c.conrelid
     AND child_att.attnum = ord.attnum
  ) AS child_columns,
  ref_ns.nspname AS referenced_schema,
  ref_rel.relname AS referenced_table,
  (
    SELECT string_agg(ref_att.attname, ', ' ORDER BY ord.ordinality)
    FROM unnest(c.confkey) WITH ORDINALITY AS ord(attnum, ordinality)
    JOIN pg_attribute AS ref_att
      ON ref_att.attrelid = c.confrelid
     AND ref_att.attnum = ord.attnum
  ) AS referenced_columns,
  CASE c.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE c.confdeltype::text
  END AS on_delete,
  CASE c.confupdtype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE c.confupdtype::text
  END AS on_update
FROM pg_constraint AS c
JOIN pg_class AS child_rel ON child_rel.oid = c.conrelid
JOIN pg_namespace AS child_ns ON child_ns.oid = child_rel.relnamespace
JOIN pg_class AS ref_rel ON ref_rel.oid = c.confrelid
JOIN pg_namespace AS ref_ns ON ref_ns.oid = ref_rel.relnamespace
WHERE c.contype = 'f'
  AND ref_ns.nspname = 'public'
  AND ref_rel.relname = 'profiles'
ORDER BY child_ns.nspname, child_rel.relname, c.conname;
`.trim();

/** FKs that would delete or null shared/public rows when a profile shell is removed. */
function isUnsafeProfileDeleteFk(row: ProfileFkRow): boolean {
  if (row.on_delete === "CASCADE") {
    return true;
  }
  if (row.on_delete === "SET NULL" || row.on_delete === "SET DEFAULT") {
    const child = `${row.child_schema}.${row.child_table}`;
    const publicContentTables = new Set([
      "public.stories",
      "public.prayer_requests",
      "public.story_video_replies",
    ]);
    if (publicContentTables.has(child)) {
      return true;
    }
  }
  return false;
}

describeIntegration("account deletion profile completion — live FK catalog", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: dbUrl });
    await client.connect();
    await resetAccountDeletionIntegrationSchema(client);
    await applyAccountDeletionMigrations(client);
  }, 120_000);

  afterAll(async () => {
    await client?.end();
  });

  it("lists every FK referencing public.profiles from pg_catalog", async () => {
    const { rows } = await client.query<ProfileFkRow>(PROFILE_FK_CATALOG_SQL);
    const unsafe = rows.filter(isUnsafeProfileDeleteFk);

    if (unsafe.length > 0) {
      const detail = unsafe
        .map(
          (row) =>
            `${row.child_schema}.${row.child_table}(${row.child_columns}) → ` +
            `${row.referenced_schema}.${row.referenced_table}(${row.referenced_columns}) ` +
            `ON DELETE ${row.on_delete} [${row.constraint_name}]`
        )
        .join("\n");
      throw new Error(
        `BLOCK FOR DESIGN: unexpected profile FK would make profile-shell DELETE unsafe:\n${detail}`
      );
    }

    expect(rows).toEqual([]);
  });
});
