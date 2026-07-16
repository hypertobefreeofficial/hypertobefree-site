/**
 * Apply the God Did It authorization migration to a safe development database.
 *
 * Requires one of:
 *   DATABASE_URL
 *   COMMUNITY_FEED_AUTH_DATABASE_URL
 *
 * Refuses likely-production URLs unless COMMUNITY_FEED_AUTH_ALLOW_PRODUCTION=1.
 *
 * Usage:
 *   node scripts/apply-community-feed-auth-migration.mjs
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvLocal();

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260719_mark_prayer_answered_authorization.sql"
);
const databaseUrl =
  process.env.COMMUNITY_FEED_AUTH_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error(
    "Missing DATABASE_URL or COMMUNITY_FEED_AUTH_DATABASE_URL. Apply the migration manually in the Supabase SQL editor, then run npm run test:community-feed-auth."
  );
  process.exit(2);
}

const looksProduction =
  /supabase\.co/i.test(databaseUrl) &&
  !/localhost|127\.0\.0\.1|staging|dev|preview|test/i.test(databaseUrl);

if (
  looksProduction &&
  process.env.COMMUNITY_FEED_AUTH_ALLOW_PRODUCTION !== "1"
) {
  console.error(
    "Refusing likely-production DATABASE_URL without COMMUNITY_FEED_AUTH_ALLOW_PRODUCTION=1"
  );
  process.exit(2);
}

const sql = readFileSync(migrationPath, "utf8");

async function applyWithPg() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

function applyWithPsql() {
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql failed");
  }
}

async function verifyApplied(clientFactory) {
  const client = await clientFactory();
  try {
    const fn = await client.query(
      `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
              pg_catalog.array_to_string(p.proconfig, ', ') AS config
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'mark_my_prayer_answered'`
    );
    if (fn.rowCount !== 1) {
      throw new Error("mark_my_prayer_answered not found after apply");
    }

    const trigger = await client.query(
      `SELECT tgname FROM pg_trigger
       WHERE tgname = 'stories_protect_prayer_answered_fields' AND NOT tgisinternal`
    );
    if (trigger.rowCount !== 1) {
      throw new Error("stories_protect_prayer_answered_fields trigger missing");
    }

    const allowFn = await client.query(
      `SELECT p.proname
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'allow_prayer_answered_field_write'`
    );
    if (allowFn.rowCount !== 1) {
      throw new Error("allow_prayer_answered_field_write helper missing");
    }

    console.log("Verified RPC:", fn.rows[0].proname, fn.rows[0].args);
    console.log("Verified search_path config:", fn.rows[0].config || "(default)");
    console.log("Verified trigger: stories_protect_prayer_answered_fields");
    console.log("Verified trust helper: allow_prayer_answered_field_write");
  } finally {
    await client.end();
  }
}

try {
  try {
    await applyWithPg();
    console.log("Migration applied via pg.");
    await verifyApplied(async () => {
      const { Client } = await import("pg");
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      return client;
    });
  } catch (pgError) {
    console.warn("pg apply unavailable:", pgError.message);
    applyWithPsql();
    console.log("Migration applied via psql.");
    await verifyApplied(async () => {
      const { Client } = await import("pg");
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      return client;
    });
  }
} catch (error) {
  console.error(
    "Could not apply migration automatically:",
    error instanceof Error ? error.message : error
  );
  console.error(
    "Apply manually with the Supabase SQL editor:",
    migrationPath
  );
  process.exit(1);
}
