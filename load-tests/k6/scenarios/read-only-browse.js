import { sleep } from "k6";
import {
  getJson,
  supabaseHeaders,
  thinkTime,
} from "../helpers/http.js";

const STORY_SELECT =
  "id,user_id,name,location,story_type,story_text,image_url,video_url,thumbnail_url,status,created_at,prayer_status,answered_at,answered_text,removed_at";
const PRAYER_SELECT =
  "id,user_id,name,location,story_type,story_text,image_url,video_url,thumbnail_url,status,prayer_status,created_at,topics,public_lat,public_lng";
const SEARCH_SELECT =
  "id,user_id,name,location,story_type,story_text,video_url,thumbnail_url,status,created_at";

export function browseFeed(supabaseUrl, anonKey, accessToken) {
  const headers = supabaseHeaders(anonKey, accessToken);
  const query =
    `${supabaseUrl}/rest/v1/stories?select=${encodeURIComponent(STORY_SELECT)}` +
    "&status=eq.approved&removed_at=is.null&order=created_at.desc,id.desc&limit=40";

  getJson(query, headers, { name: "feed_initial", surface: "feed" });
  sleep(thinkTime(3, 8));
}

export function browsePrayer(supabaseUrl, anonKey, accessToken) {
  const headers = supabaseHeaders(anonKey, accessToken);
  const query =
    `${supabaseUrl}/rest/v1/stories?select=${encodeURIComponent(PRAYER_SELECT)}` +
    "&status=eq.approved&removed_at=is.null&order=created_at.desc,id.desc&limit=80";

  getJson(query, headers, { name: "prayer_initial", surface: "prayer" });
  sleep(thinkTime(3, 8));
}

export function browseVideoFeedMetadata(supabaseUrl, anonKey, accessToken) {
  const headers = supabaseHeaders(anonKey, accessToken);
  const query =
    `${supabaseUrl}/rest/v1/stories?select=${encodeURIComponent(STORY_SELECT)}` +
    "&status=eq.approved&video_url=not.is.null&order=created_at.desc&limit=30";

  const response = getJson(query, headers, {
    name: "video_feed_metadata",
    surface: "video_feed",
  });

  const rows = response.json();
  if (Array.isArray(rows) && rows.length > 0) {
    const storyIds = rows.slice(0, 15).map((row) => row.id).join(",");
    const reactionsQuery =
      `${supabaseUrl}/rest/v1/story_reactions?select=story_id,user_id,reaction_type` +
      `&story_id=in.(${storyIds})`;
    getJson(reactionsQuery, headers, {
      name: "video_feed_reaction_counts_read",
      surface: "video_feed_reactions_read",
    });
  }

  sleep(thinkTime(3, 8));
}

export function browseSearch(supabaseUrl, anonKey, accessToken) {
  const headers = supabaseHeaders(anonKey, accessToken);
  const query =
    `${supabaseUrl}/rest/v1/stories?select=${encodeURIComponent(SEARCH_SELECT)}` +
    "&status=eq.approved&order=created_at.desc,id.desc&limit=120";

  getJson(query, headers, { name: "search_page", surface: "search" });
  sleep(thinkTime(2, 5));
}

export function runReadOnlyMix(supabaseUrl, anonKey, accessToken, roll) {
  if (roll < 0.35) return browseFeed(supabaseUrl, anonKey, accessToken);
  if (roll < 0.55) return browsePrayer(supabaseUrl, anonKey, accessToken);
  if (roll < 0.7) return browseVideoFeedMetadata(supabaseUrl, anonKey, accessToken);
  return browseSearch(supabaseUrl, anonKey, accessToken);
}
