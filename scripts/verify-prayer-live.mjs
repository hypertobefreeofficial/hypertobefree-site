/**
 * Prayer migration live verification (read-only + safe anon checks).
 * Does not commit credentials. Run: node scripts/verify-prayer-live.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx);
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const results = [];

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
}
function fail(name, detail = "") {
  results.push({ name, status: "FAIL", detail });
}
function skip(name, detail = "") {
  results.push({ name, status: "SKIP", detail });
}
function warn(name, detail = "") {
  results.push({ name, status: "WARN", detail });
}

if (!url || !anon) {
  fail("Supabase configured", "NEXT_PUBLIC_SUPABASE_URL or ANON_KEY missing");
  console.log(JSON.stringify(results, null, 2));
  process.exit(1);
}

const supabase = createClient(url, anon);

async function main() {
  // 1) Schema: geo columns readable on stories
  const geoSelect = await supabase
    .from("stories")
    .select(
      "id, story_type, public_lat, public_lng, public_location_label, location_visibility, prayer_status, status"
    )
    .eq("status", "approved")
    .ilike("story_type", "%prayer%")
    .limit(5);

  if (geoSelect.error) {
    if (/public_lat|column/i.test(geoSelect.error.message)) {
      fail("Geo columns on stories", geoSelect.error.message);
    } else {
      fail("Load approved prayers", geoSelect.error.message);
    }
  } else {
    pass("Geo columns on stories", `sample count ${geoSelect.data?.length ?? 0}`);
    const withCoords = (geoSelect.data ?? []).filter(
      (r) => r.public_lat != null && r.public_lng != null
    );
    if (withCoords.length > 0) {
      pass("Stored public coordinates present", `${withCoords.length} in sample`);
    } else {
      warn(
        "Stored public coordinates present",
        "No coords in first 5 approved prayers; backfill may still be needed"
      );
    }
  }

  // 2) prayer_follows table + RLS (anon should not read others)
  const followsAnon = await supabase.from("prayer_follows").select("story_id").limit(1);
  if (followsAnon.error && /relation|does not exist/i.test(followsAnon.error.message)) {
    fail("prayer_follows exists", followsAnon.error.message);
  } else if (followsAnon.error) {
    pass("prayer_follows RLS blocks anon", followsAnon.error.message.slice(0, 80));
  } else {
    pass("prayer_follows exists", `anon select returned ${followsAnon.data?.length ?? 0} rows`);
  }

  // 3) prayer_written_responses
  const written = await supabase
    .from("prayer_written_responses")
    .select("id, story_id, body, status")
    .eq("status", "visible")
    .limit(3);
  if (written.error && /relation|does not exist/i.test(written.error.message)) {
    fail("prayer_written_responses exists", written.error.message);
  } else if (written.error) {
    warn("prayer_written_responses read", written.error.message);
  } else {
    pass("prayer_written_responses readable", `visible count sample ${written.data?.length ?? 0}`);
  }

  // 4) Logged-out insert should fail
  const anonFollow = await supabase.from("prayer_follows").insert({
    user_id: "00000000-0000-0000-0000-000000000001",
    story_id: "00000000-0000-0000-0000-000000000002",
  });
  if (anonFollow.error) {
    pass("Logged-out follow insert blocked", anonFollow.error.message.slice(0, 100));
  } else {
    fail("Logged-out follow insert blocked", "insert succeeded unexpectedly");
  }

  const anonWritten = await supabase.from("prayer_written_responses").insert({
    story_id: "00000000-0000-0000-0000-000000000002",
    author_user_id: "00000000-0000-0000-0000-000000000001",
    body: "test",
    status: "visible",
  });
  if (anonWritten.error) {
    pass("Logged-out written prayer blocked", anonWritten.error.message.slice(0, 100));
  } else {
    fail("Logged-out written prayer blocked", "insert succeeded unexpectedly");
  }

  const anonReaction = await supabase.from("story_reactions").insert({
    story_id: "00000000-0000-0000-0000-000000000002",
    user_id: "00000000-0000-0000-0000-000000000001",
    reaction_type: "praying",
  });
  if (anonReaction.error) {
    pass("Logged-out I Prayed blocked", anonReaction.error.message.slice(0, 100));
  } else {
    fail("Logged-out I Prayed blocked", "insert succeeded unexpectedly");
  }

  // 5) Duplicate reaction protection (needs a real story + we'd need auth - skip with note)
  skip(
    "Double I Prayed stores one reaction",
    "Requires authenticated session in browser; verify manually or with test account"
  );

  // 6) Radius search data availability
  const radiusPool = await supabase
    .from("stories")
    .select("id, public_lat, public_lng, location_visibility, story_type")
    .eq("status", "approved")
    .not("public_lat", "is", null)
    .not("public_lng", "is", null)
    .ilike("story_type", "%prayer%")
    .limit(20);

  if (radiusPool.error) {
    fail("Radius search pool", radiusPool.error.message);
  } else {
    const n = radiusPool.data?.length ?? 0;
    if (n > 0) pass("Radius search pool", `${n} prayers with stored coords`);
    else warn("Radius search pool", "0 prayers with stored coords yet");
  }

  // 7) saved_content exists
  const saved = await supabase.from("saved_content").select("story_id").limit(1);
  if (saved.error && /relation/i.test(saved.error.message)) {
    fail("saved_content table", saved.error.message);
  } else {
    pass("saved_content table reachable", saved.error ? "RLS blocked (expected)" : "ok");
  }

  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter((r) => r.status === "FAIL").length;
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  fail("Script error", String(err));
  console.log(JSON.stringify(results, null, 2));
  process.exit(1);
});
