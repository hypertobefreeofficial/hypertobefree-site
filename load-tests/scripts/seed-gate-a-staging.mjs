#!/usr/bin/env node
/**
 * Seed synthetic Gate A staging data (htbf-staging only).
 * Requires HTBF_SUPABASE_SERVICE_ROLE_KEY in load-tests/k6/.env.staging.local
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRequiredStagingEnv,
  assertSyntheticUserEmail,
  GATE_A_CREATION_MODE,
  GATE_A_TEXT_MARKER,
  loadStagingEnvFile,
  redactEnvSummary,
} from "./stagingGuards.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const ENV_FILE = resolve(ROOT, "load-tests/k6/.env.staging.local");
const USER_POOL_FILE = resolve(ROOT, "load-tests/k6/fixtures/users.pool.local.csv");

const USER_COUNT = 10;
const FEED_STORY_COUNT = 35;
const PRAYER_STORY_COUNT = 22;

loadStagingEnvFile(ENV_FILE);

function randomPassword() {
  return `Lt-${randomBytes(18).toString("base64url")}`;
}

function buildUserEmail(index) {
  return `loadtest_user_${String(index).padStart(4, "0")}@staging.htbf.test`;
}

function storyPayload({ userId, index, type }) {
  const createdAt = new Date(Date.now() - index * 60_000).toISOString();
  const base = {
    user_id: userId,
    name: `Gate A User ${String(index).padStart(2, "0")}`,
    location: "Staging City",
    status: "approved",
    creation_mode: GATE_A_CREATION_MODE,
    created_at: createdAt,
    story_text: `${GATE_A_TEXT_MARKER} Synthetic ${type} record ${index} for Gate A smoke testing.`,
  };

  if (type === "prayer") {
    return {
      ...base,
      story_type: "Prayer Request",
      prayer_status: "active",
    };
  }

  if (type === "video") {
    return {
      ...base,
      story_type: "Testimony",
      story_text: `${GATE_A_TEXT_MARKER} Video metadata-only testimony ${index}.`,
      video_url: `loadtest/metadata/video-${index}.mp4`,
      thumbnail_url: `loadtest/metadata/thumb-${index}.jpg`,
      prayer_status: "active",
    };
  }

  if (type === "image") {
    return {
      ...base,
      story_type: "Praise Report",
      image_url: `loadtest/metadata/image-${index}.jpg`,
      prayer_status: "active",
    };
  }

  return {
    ...base,
    story_type: "Testimony",
    prayer_status: "active",
  };
}

async function main() {
  const env = assertRequiredStagingEnv();
  console.log("Gate A staging seed — environment summary:");
  console.log(JSON.stringify(redactEnvSummary(env), null, 2));

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userRows = [];
  const userIds = [];

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listError) {
    throw new Error(`Could not list auth users: ${listError.message}`);
  }

  for (let index = 1; index <= USER_COUNT; index += 1) {
    const email = buildUserEmail(index);
    assertSyntheticUserEmail(email);
    const password = randomPassword();

    const existing = listed.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );

    let userId = existing?.id;

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: `Gate A ${String(index).padStart(2, "0")}`,
          creation_mode: GATE_A_CREATION_MODE,
        },
      });

      if (error) {
        throw new Error(`Could not create auth user ${email}: ${error.message}`);
      }

      userId = data.user?.id;
    } else {
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        password,
      });
      if (updateError) {
        throw new Error(`Could not refresh password for ${email}: ${updateError.message}`);
      }
    }

    if (!userId) {
      throw new Error(`Missing user id for ${email}`);
    }

    userIds.push(userId);
    userRows.push({ email, password });

    await admin.from("profiles").upsert({
      id: userId,
      email,
      display_name: `Gate A ${String(index).padStart(2, "0")}`,
      username: `gatea_${String(index).padStart(2, "0")}`,
      profile_status: "active",
      role: "user",
      profile_completed: true,
      updated_at: new Date().toISOString(),
    });
  }

  mkdirSync(dirname(USER_POOL_FILE), { recursive: true });
  writeFileSync(
    USER_POOL_FILE,
    ["email,password", ...userRows.map((row) => `${row.email},${row.password}`)].join(
      "\n"
    ) + "\n",
    { mode: 0o600 }
  );

  const { count: existingStoryCount, error: existingStoryError } = await admin
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("creation_mode", GATE_A_CREATION_MODE);

  if (existingStoryError) {
    throw new Error(`Could not count existing load-test stories: ${existingStoryError.message}`);
  }

  let createdStories = 0;
  const existingCount = existingStoryCount ?? 0;

  if (existingCount >= FEED_STORY_COUNT) {
    console.log(
      `Skipping story seed: found ${existingCount} existing creation_mode='${GATE_A_CREATION_MODE}' stories.`
    );
  } else {
    const remaining = FEED_STORY_COUNT - existingCount;
    const payloads = [];

    for (let offset = 0; offset < remaining; offset += 1) {
      const index = existingCount + offset + 1;
      const userId = userIds[(index - 1) % userIds.length];
      let type = "text";
      if (index <= PRAYER_STORY_COUNT) type = "prayer";
      else if (index % 5 === 0) type = "video";
      else if (index % 3 === 0) type = "image";

      payloads.push(storyPayload({ userId, index, type }));
    }

    const { data, error } = await admin.from("stories").insert(payloads).select("id");
    if (error) {
      throw new Error(`Could not insert synthetic stories: ${error.message}`);
    }

    createdStories = data?.length ?? 0;
  }

  const { count: prayerCount } = await admin
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("creation_mode", GATE_A_CREATION_MODE)
    .ilike("story_type", "%prayer%");

  const { count: finalStoryCount } = await admin
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("creation_mode", GATE_A_CREATION_MODE);

  console.log(
    JSON.stringify(
      {
        usersPrepared: userRows.length,
        storiesCreatedThisRun: createdStories,
        totalLoadtestStories: finalStoryCount ?? existingCount + createdStories,
        loadtestPrayerStories: prayerCount ?? 0,
        userPoolFile: "load-tests/k6/fixtures/users.pool.local.csv",
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
