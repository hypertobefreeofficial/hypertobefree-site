#!/usr/bin/env node
/**
 * One-time Gate A synthetic-user auth repair diagnostic.
 * Loads only load-tests/k6/.env.staging.local — never prints credentials.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRequiredStagingEnv,
  assertStagingAnonKeyAccepted,
  loadStagingEnvFile,
} from "./stagingGuards.mjs";
import {
  createGateAAdminClient,
  createGateAAnonClient,
  describeAuthUserState,
  findAuthUsersByEmail,
  listAllAuthUsers,
  readUserPoolFirstEntry,
  sanitizeLogPayload,
  signInSyntheticUserWithOfficialClient,
  syncOneSyntheticUserPassword,
  validateSyntheticPoolEntry,
} from "./gateAAuth.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENV_FILE = resolve(ROOT, "load-tests/k6/.env.staging.local");

if (!loadStagingEnvFile(ENV_FILE)) {
  console.error("Missing staging environment file.");
  process.exit(1);
}

async function main() {
  const env = assertRequiredStagingEnv();
  await assertStagingAnonKeyAccepted(env.supabaseUrl, env.anonKey);
  const poolFile = resolve(
    ROOT,
    (process.env.HTBF_TEST_USER_POOL_FILE || "./load-tests/k6/fixtures/users.pool.local.csv").replace(
      /^\.\//,
      ""
    )
  );

  if (!existsSync(poolFile)) {
    console.error("Missing synthetic user pool file.");
    process.exit(1);
  }

  const poolEntry = readUserPoolFirstEntry(poolFile);
  const poolChecks = validateSyntheticPoolEntry(poolEntry);

  const admin = createGateAAdminClient(env.supabaseUrl, env.serviceRoleKey);
  const anon = createGateAAnonClient(env.supabaseUrl, env.anonKey);

  const users = await listAllAuthUsers(admin);
  const matches = findAuthUsersByEmail(users, poolEntry.email);

  if (matches.length > 1) {
    console.error("Ambiguous auth user match for synthetic pool entry.");
    process.exit(1);
  }

  const authState = describeAuthUserState(matches[0]);

  const syncResult = await syncOneSyntheticUserPassword(
    admin,
    poolEntry.email,
    poolEntry.password
  );

  const signInResult = await signInSyntheticUserWithOfficialClient(
    anon,
    poolEntry.email,
    poolEntry.password
  );

  console.log(
    JSON.stringify(
      sanitizeLogPayload({
        poolChecks,
        preSyncAuthState: authState,
        syncResult,
        signInResult,
      }),
      null,
      2
    )
  );

  if (!signInResult.sessionReceived || !signInResult.accessTokenReceived) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/credential|password|token|api key|eyJ/i.test(message)) {
    console.error("Gate A auth repair failed.");
  } else {
    console.error(message);
  }
  process.exit(1);
});
