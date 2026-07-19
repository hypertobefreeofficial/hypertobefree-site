import { sleep } from "k6";
import { randomSeed, randomItem } from "k6";
import {
  deleteJson,
  getJson,
  postJson,
  supabaseHeaders,
  thinkTime,
} from "../helpers/http.js";
import { LOAD_TEST_MARKER } from "../helpers/env.js";

const REACTION_TYPES = ["amen", "praise_god", "encouraged", "praying"];

export function pickSeedStoryId(supabaseUrl, anonKey, accessToken) {
  const headers = supabaseHeaders(anonKey, accessToken);
  const query =
    `${supabaseUrl}/rest/v1/stories?select=id` +
    "&status=eq.approved&creation_mode=eq.loadtest&limit=25";

  const response = getJson(query, headers, {
    name: "mutation_seed_story_lookup",
    surface: "mutation",
  });

  const rows = response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      "No load-test seed stories found. Seed staging content tagged with creation_mode=loadtest before mutation scenarios."
    );
  }

  randomSeed(__VU);
  return randomItem(rows).id;
}

export function toggleFeedReaction(supabaseUrl, anonKey, session) {
  const headers = supabaseHeaders(anonKey, session.accessToken);
  const storyId = pickSeedStoryId(supabaseUrl, anonKey, session.accessToken);
  const reactionType = randomItem(REACTION_TYPES);

  const existingQuery =
    `${supabaseUrl}/rest/v1/story_reactions?select=id` +
    `&story_id=eq.${storyId}&user_id=eq.${session.userId}&reaction_type=eq.${reactionType}`;

  const existing = getJson(existingQuery, headers, {
    name: "reaction_lookup",
    surface: "mutation",
  });

  const rows = existing.json();
  if (Array.isArray(rows) && rows.length > 0) {
    deleteJson(
      `${supabaseUrl}/rest/v1/story_reactions?id=eq.${rows[0].id}`,
      headers,
      { name: "reaction_delete", surface: "mutation" }
    );
  } else {
    postJson(
      `${supabaseUrl}/rest/v1/story_reactions`,
      {
        story_id: storyId,
        user_id: session.userId,
        reaction_type: reactionType,
      },
      headers,
      { name: "reaction_insert", surface: "mutation" }
    );
  }

  sleep(thinkTime(1, 3));
}

export function togglePrayingReaction(supabaseUrl, anonKey, session) {
  const headers = supabaseHeaders(anonKey, session.accessToken);
  const storyId = pickSeedStoryId(supabaseUrl, anonKey, session.accessToken);

  postJson(
    `${supabaseUrl}/rest/v1/story_reactions`,
    {
      story_id: storyId,
      user_id: session.userId,
      reaction_type: "praying",
    },
    headers,
    { name: "praying_insert", surface: "mutation" }
  );

  sleep(thinkTime(1, 3));
}

export function toggleSaveOrFollow(supabaseUrl, anonKey, session) {
  const headers = supabaseHeaders(anonKey, session.accessToken);
  const storyId = pickSeedStoryId(supabaseUrl, anonKey, session.accessToken);

  if (__VU % 2 === 0) {
    postJson(
      `${supabaseUrl}/rest/v1/saved_content`,
      {
        user_id: session.userId,
        story_id: storyId,
        notes: LOAD_TEST_MARKER,
      },
      headers,
      { name: "save_insert", surface: "mutation" }
    );
  } else {
    postJson(
      `${supabaseUrl}/rest/v1/prayer_follows`,
      {
        user_id: session.userId,
        story_id: storyId,
      },
      headers,
      { name: "follow_insert", surface: "mutation" }
    );
  }

  sleep(thinkTime(1, 3));
}

export function submitDedicatedReport(baseUrl, accessToken) {
  const targetStoryId = __ENV.HTBF_REPORT_TARGET_STORY_ID;
  if (!targetStoryId) {
    throw new Error(
      "Refusing report test: HTBF_REPORT_TARGET_STORY_ID must point to dedicated load-test content."
    );
  }

  postJson(
    `${baseUrl}/api/submit-content-report`,
    {
      story_id: targetStoryId,
      reason: "other",
      details: `${LOAD_TEST_MARKER} synthetic report`,
    },
    {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    { name: "content_report", surface: "mutation" }
  );

  sleep(thinkTime(2, 4));
}

export function runAuthenticatedMix(baseUrl, supabaseUrl, anonKey, session, roll) {
  if (roll < 0.08) return toggleFeedReaction(supabaseUrl, anonKey, session);
  if (roll < 0.13) return togglePrayingReaction(supabaseUrl, anonKey, session);
  if (roll < 0.16) return toggleSaveOrFollow(supabaseUrl, anonKey, session);
  if (roll < 0.18) return submitDedicatedReport(baseUrl, session.accessToken);
  return toggleFeedReaction(supabaseUrl, anonKey, session);
}
