/**
 * Database-backed integration tests for mark_my_prayer_answered authorization.
 *
 * Requires a safe development Supabase project with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY          (setup/cleanup + trusted-path test only)
 *   PLAYWRIGHT_OWNER_EMAIL
 *   PLAYWRIGHT_OWNER_PASSWORD
 *   PLAYWRIGHT_RESPONDER_EMAIL
 *   PLAYWRIGHT_RESPONDER_PASSWORD
 *
 * Optional local target:
 *   COMMUNITY_FEED_AUTH_DATABASE_URL or DATABASE_URL
 *
 * Refuses likely-production projects unless COMMUNITY_FEED_AUTH_ALLOW_PRODUCTION=1.
 *
 * Usage:
 *   npm run test:community-feed-auth
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { resolve } from "path";

const TEST_MARKER = "[COMMUNITY-FEED-AUTH-TEST]";

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ownerEmail = process.env.PLAYWRIGHT_OWNER_EMAIL?.trim();
const ownerPassword = process.env.PLAYWRIGHT_OWNER_PASSWORD?.trim();
const responderEmail = process.env.PLAYWRIGHT_RESPONDER_EMAIL?.trim();
const responderPassword = process.env.PLAYWRIGHT_RESPONDER_PASSWORD?.trim();

const missing = [];
if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
if (!ownerEmail) missing.push("PLAYWRIGHT_OWNER_EMAIL");
if (!ownerPassword) missing.push("PLAYWRIGHT_OWNER_PASSWORD");
if (!responderEmail) missing.push("PLAYWRIGHT_RESPONDER_EMAIL");
if (!responderPassword) missing.push("PLAYWRIGHT_RESPONDER_PASSWORD");

if (missing.length > 0) {
  console.error(
    `Skipping community feed auth integration tests — missing: ${missing.join(", ")}`
  );
  process.exit(2);
}

if (process.env.COMMUNITY_FEED_AUTH_ALLOW_PRODUCTION === "1") {
  console.error(
    "Refusing to run with COMMUNITY_FEED_AUTH_ALLOW_PRODUCTION=1 during this correction pass."
  );
  process.exit(2);
}

const looksProduction =
  /supabase\.co/i.test(supabaseUrl) &&
  !/localhost|127\.0\.0\.1|staging|dev|preview|test/i.test(supabaseUrl);

if (looksProduction) {
  console.error(
    "Refusing likely-production Supabase URL. Use a local or development project."
  );
  process.exit(2);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdStoryIds = [];
const results = [];

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, status: "FAIL", detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function signInClient(email, password) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "no session"}`);
  }
  return client;
}

async function ensureMigrationPresent() {
  const { error } = await admin.rpc("mark_my_prayer_answered", {
    p_story_id: randomUUID(),
    p_answered_text: "probe",
  });

  if (
    error &&
    /function.*mark_my_prayer_answered|could not find/i.test(error.message)
  ) {
    throw new Error(
      "mark_my_prayer_answered RPC is missing. Apply supabase/migrations/20260719_mark_prayer_answered_authorization.sql to your local/dev database first."
    );
  }
}

async function createStory(overrides) {
  const id = randomUUID();
  const row = {
    id,
    user_id: overrides.userId,
    name: "Auth Test User",
    story_type: overrides.storyType ?? "Prayer Request",
    story_text: `${TEST_MARKER} ${overrides.label ?? "eligible"}`,
    status: overrides.status ?? "approved",
    prayer_status: overrides.prayerStatus ?? "active",
    answered_at: overrides.answeredAt ?? null,
    answered_text: overrides.answeredText ?? null,
    removed_at: overrides.removedAt ?? null,
    created_at: new Date().toISOString(),
  };

  const { error } = await admin.from("stories").insert(row);
  if (error) throw new Error(`Could not create test story: ${error.message}`);
  createdStoryIds.push(id);
  return id;
}

async function readStory(id) {
  const { data, error } = await admin
    .from("stories")
    .select(
      "id, user_id, story_type, status, prayer_status, answered_at, answered_text, removed_at, story_text"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function callSharedHelper(client, storyId, answeredText, authUserId, story) {
  const clean = answeredText.trim();
  if (!clean) {
    return { ok: false, message: "Please add a short answered prayer update before marking this answered." };
  }

  const { data, error } = await client.rpc("mark_my_prayer_answered", {
    p_story_id: storyId,
    p_answered_text: clean,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.prayer_status || row.prayer_status !== "answered") {
    return { ok: false, message: "missing answered state" };
  }

  return { ok: true, story: row, authUserId, storyForValidation: story };
}

async function cleanupStories() {
  if (createdStoryIds.length === 0) return;
  await admin.from("stories").delete().in("id", createdStoryIds);
}

async function run() {
  console.log(
    `Target: ${supabaseUrl.replace(/https:\/\/([^.]+).*/, "https://$1…")}`
  );

  await ensureMigrationPresent();
  pass("Migration RPC present");

  const ownerClient = await signInClient(ownerEmail, ownerPassword);
  const {
    data: { user: ownerUser },
  } = await ownerClient.auth.getUser();
  if (!ownerUser?.id) throw new Error("Owner user id unavailable");
  pass("Owner authenticated");

  const responderClient = await signInClient(responderEmail, responderPassword);
  pass("Responder authenticated");

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  pass("Anonymous client ready");

  const eligibleId = await createStory({
    userId: ownerUser.id,
    label: "eligible-active",
  });
  const helperEligibleId = await createStory({
    userId: ownerUser.id,
    label: "shared-helper-eligible",
  });
  const removedId = await createStory({
    userId: ownerUser.id,
    label: "removed",
    removedAt: new Date().toISOString(),
  });
  const rejectedId = await createStory({
    userId: ownerUser.id,
    label: "rejected",
    status: "rejected",
  });
  const pendingId = await createStory({
    userId: ownerUser.id,
    label: "pending",
    status: "pending",
  });
  const nonPrayerId = await createStory({
    userId: ownerUser.id,
    label: "non-prayer",
    storyType: "Testimony",
  });
  const alreadyAnsweredId = await createStory({
    userId: ownerUser.id,
    label: "already-answered",
    prayerStatus: "answered",
    answeredAt: new Date().toISOString(),
    answeredText: "Previously answered.",
  });
  const unrelatedTextId = await createStory({
    userId: ownerUser.id,
    label: "unrelated-update",
    storyType: "Testimony",
  });
  const serviceRoleStoryId = await createStory({
    userId: ownerUser.id,
    label: "service-role-trusted",
  });

  const answerText = "  Integration test answered update.  ";
  const expectedAnswer = answerText.trim();

  const ownerSuccess = await ownerClient.rpc("mark_my_prayer_answered", {
    p_story_id: eligibleId,
    p_answered_text: answerText,
  });

  if (ownerSuccess.error) {
    fail("Owner RPC marks eligible prayer answered", ownerSuccess.error.message);
  } else {
    pass("Owner RPC marks eligible prayer answered");
    const row = await readStory(eligibleId);
    if (row?.prayer_status === "answered") pass("Owner writes prayer_status = answered");
    else fail("Owner writes prayer_status = answered", row?.prayer_status ?? "null");
    if (row?.answered_at) pass("Owner writes answered_at");
    else fail("Owner writes answered_at");
    if (row?.answered_text === expectedAnswer) pass("Owner writes trimmed answered_text");
    else fail("Owner writes trimmed answered_text", row?.answered_text ?? "null");
    if (
      ownerSuccess.data &&
      (Array.isArray(ownerSuccess.data) ? ownerSuccess.data[0] : ownerSuccess.data)
        ?.answered_text === expectedAnswer
    ) {
      pass("RPC returns authoritative answered state");
    } else {
      fail("RPC returns authoritative answered state");
    }
  }

  const helperStory = await readStory(helperEligibleId);
  const helperResult = await callSharedHelper(
    ownerClient,
    helperEligibleId,
    "Shared helper answered update.",
    ownerUser.id,
    helperStory
  );
  if (helperResult.ok) {
    pass("Shared helper succeeds for owner (FreedomFeed/My Requests path)");
    const helperRow = await readStory(helperEligibleId);
    if (helperRow?.answered_text === "Shared helper answered update.") {
      pass("Shared helper uses RPC-compatible answered_text write");
    } else {
      fail("Shared helper uses RPC-compatible answered_text write");
    }
  } else {
    fail("Shared helper succeeds for owner (FreedomFeed/My Requests path)", helperResult.message);
  }

  const nonOwner = await responderClient.rpc("mark_my_prayer_answered", {
    p_story_id: eligibleId,
    p_answered_text: "Intrusion attempt",
  });
  if (nonOwner.error) pass("Non-owner RPC fails");
  else fail("Non-owner RPC fails", "unexpected success");

  const anonymous = await anonClient.rpc("mark_my_prayer_answered", {
    p_story_id: eligibleId,
    p_answered_text: "Anonymous attempt",
  });
  if (anonymous.error) pass("Anonymous RPC fails");
  else fail("Anonymous RPC fails", "unexpected success");

  const ownerDirect = await ownerClient
    .from("stories")
    .update({ prayer_status: "answered", answered_text: "Direct bypass" })
    .eq("id", eligibleId);
  if (ownerDirect.error) pass("Owner direct prayer_status update fails");
  else fail("Owner direct prayer_status update fails", "unexpected success");

  const nonOwnerDirect = await responderClient
    .from("stories")
    .update({ prayer_status: "answered", answered_text: "Direct bypass" })
    .eq("id", eligibleId);
  if (nonOwnerDirect.error) pass("Non-owner direct update fails");
  else fail("Non-owner direct update fails", "unexpected success");

  const anonDirect = await anonClient
    .from("stories")
    .update({ prayer_status: "answered", answered_text: "Direct bypass" })
    .eq("id", eligibleId);
  if (anonDirect.error) pass("Anonymous direct update fails");
  else fail("Anonymous direct update fails", "unexpected success");

  for (const [label, id] of [
    ["removed", removedId],
    ["rejected", rejectedId],
    ["pending", pendingId],
    ["non-prayer", nonPrayerId],
    ["already answered", alreadyAnsweredId],
  ]) {
    const before = await readStory(id);
    const attempt = await ownerClient.rpc("mark_my_prayer_answered", {
      p_story_id: id,
      p_answered_text: "Should not apply",
    });
    const after = await readStory(id);
    if (attempt.error) pass(`${label} cannot be marked answered`);
    else fail(`${label} cannot be marked answered`, "unexpected success");
    if (
      before?.prayer_status === after?.prayer_status &&
      before?.answered_text === after?.answered_text
    ) {
      pass(`${label} failure leaves row unchanged`);
    } else {
      fail(`${label} failure leaves row unchanged`);
    }
  }

  for (const [label, payload] of [
    ["empty answer text", ""],
    ["whitespace-only answer text", "   "],
    ["over-max answer text", "x".repeat(2001)],
  ]) {
    const id = await createStory({
      userId: ownerUser.id,
      label: `validation-${label}`,
    });
    const attempt = await ownerClient.rpc("mark_my_prayer_answered", {
      p_story_id: id,
      p_answered_text: payload,
    });
    if (attempt.error) pass(`${label} fails`);
    else fail(`${label} fails`, "unexpected success");
  }

  const unknownId = randomUUID();
  const unknown = await ownerClient.rpc("mark_my_prayer_answered", {
    p_story_id: unknownId,
    p_answered_text: "Missing story",
  });
  if (unknown.error) pass("Unknown story ID fails safely");
  else fail("Unknown story ID fails safely", "unexpected success");

  const repeat = await ownerClient.rpc("mark_my_prayer_answered", {
    p_story_id: eligibleId,
    p_answered_text: "Second attempt",
  });
  if (repeat.error) pass("Already answered prayer cannot be answered again");
  else fail("Already answered prayer cannot be answered again", "unexpected success");

  const unrelatedUpdate = await ownerClient
    .from("stories")
    .update({ story_text: `${TEST_MARKER} updated caption` })
    .eq("id", unrelatedTextId)
    .select("story_text")
    .maybeSingle();
  if (unrelatedUpdate.error) {
    fail("Unrelated story_text update still allowed", unrelatedUpdate.error.message);
  } else {
    pass("Unrelated story_text update still allowed");
  }

  const secondEligibleId = await createStory({
    userId: ownerUser.id,
    label: "isolation-second",
  });
  const firstIsolation = await ownerClient.rpc("mark_my_prayer_answered", {
    p_story_id: secondEligibleId,
    p_answered_text: "Isolation check one",
  });
  const directAfterRpc = await ownerClient
    .from("stories")
    .update({ answered_text: "Should fail on next request" })
    .eq("id", secondEligibleId);
  if (firstIsolation.error) fail("Isolation RPC success", firstIsolation.error.message);
  if (directAfterRpc.error) {
    pass("Transaction-local bypass flag is not available to the next request");
  } else {
    fail(
      "Transaction-local bypass flag is not available to the next request",
      "direct update succeeded"
    );
  }

  const serviceRoleUpdate = await admin
    .from("stories")
    .update({
      prayer_status: "answered",
      answered_at: new Date().toISOString(),
      answered_text: "Trusted service-role update.",
    })
    .eq("id", serviceRoleStoryId)
    .select("prayer_status, answered_text")
    .maybeSingle();

  if (serviceRoleUpdate.error) {
    fail("Trusted service-role update succeeds", serviceRoleUpdate.error.message);
  } else if (
    serviceRoleUpdate.data?.prayer_status === "answered" &&
    serviceRoleUpdate.data?.answered_text === "Trusted service-role update."
  ) {
    pass("Trusted service-role update succeeds");
  } else {
    fail("Trusted service-role update succeeds", "unexpected row state");
  }
}

run()
  .catch((error) => {
    fail("Unhandled test error", error instanceof Error ? error.message : String(error));
  })
  .finally(async () => {
    try {
      await cleanupStories();
    } catch (error) {
      console.warn(
        "Cleanup warning:",
        error instanceof Error ? error.message : error
      );
    }

    const failed = results.filter((entry) => entry.status === "FAIL");
    console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length > 0 ? 1 : 0);
  });
