#!/usr/bin/env node
/**
 * Delete ONLY Gate A synthetic staging records tagged with creation_mode='loadtest'
 * and loadtest_user_*@staging.htbf.test auth users.
 *
 * Dry-run is the default. Actual deletion requires HTBF_CLEANUP_DRY_RUN=0 and
 * HTBF_CONFIRM_CLEANUP=1.
 */

import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRequiredStagingEnv,
  GATE_A_CREATION_MODE,
  GATE_A_USER_EMAIL_PATTERN,
  loadStagingEnvFile,
  redactEnvSummary,
} from "./stagingGuards.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENV_FILE = resolve(ROOT, "load-tests/k6/.env.staging.local");

loadStagingEnvFile(ENV_FILE);

async function main() {
  const dryRun = process.env.HTBF_CLEANUP_DRY_RUN !== "0";

  if (!dryRun && process.env.HTBF_CONFIRM_CLEANUP !== "1") {
    throw new Error(
      "Refusing cleanup: set HTBF_CONFIRM_CLEANUP=1 together with HTBF_CLEANUP_DRY_RUN=0 to delete Gate A synthetic staging data."
    );
  }

  const env = assertRequiredStagingEnv();
  console.log(
    dryRun
      ? "Gate A staging cleanup — DRY RUN (no deletes will occur):"
      : "Gate A staging cleanup — LIVE DELETE:"
  );
  console.log(JSON.stringify(redactEnvSummary(env), null, 2));

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: loadtestStories, error: storyLookupError } = await admin
    .from("stories")
    .select("id")
    .eq("creation_mode", GATE_A_CREATION_MODE);

  if (storyLookupError) {
    throw new Error(`Could not lookup load-test stories: ${storyLookupError.message}`);
  }

  const storyIds = (loadtestStories ?? []).map((row) => row.id);

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    throw new Error(`Could not list auth users: ${listError.message}`);
  }

  const userIdsToDelete = listed.users
    .filter((user) => GATE_A_USER_EMAIL_PATTERN.test(user.email?.toLowerCase() ?? ""))
    .map((user) => ({ id: user.id, email: user.email }));

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          markedStoriesFound: storyIds.length,
          markedUsersFound: userIdsToDelete.length,
          nextStep:
            "To delete, run with HTBF_CLEANUP_DRY_RUN=0 HTBF_CONFIRM_CLEANUP=1",
        },
        null,
        2
      )
    );
    return;
  }

  if (storyIds.length > 0) {
    const { error: deleteStoriesError } = await admin
      .from("stories")
      .delete()
      .eq("creation_mode", GATE_A_CREATION_MODE);

    if (deleteStoriesError) {
      throw new Error(`Could not delete load-test stories: ${deleteStoriesError.message}`);
    }
  }

  let deletedUsers = 0;

  for (const user of userIdsToDelete) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      throw new Error(`Could not delete auth user ${user.email}: ${error.message}`);
    }

    deletedUsers += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: "live-delete",
        deletedStories: storyIds.length,
        deletedUsers,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
