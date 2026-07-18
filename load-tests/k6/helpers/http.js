import http from "k6/http";
import { check, fail } from "k6";
import { Trend } from "k6/metrics";

export const feedDuration = new Trend("htbf_feed_duration", true);
export const prayerDuration = new Trend("htbf_prayer_duration", true);
export const searchDuration = new Trend("htbf_search_duration", true);
export const mutationDuration = new Trend("htbf_mutation_duration", true);

const DEFAULT_HEADERS = {
  Accept: "application/json",
};

export function supabaseHeaders(anonKey, accessToken) {
  return {
    ...DEFAULT_HEADERS,
    apikey: anonKey,
    Authorization: `Bearer ${accessToken || anonKey}`,
    "Content-Type": "application/json",
  };
}

export function getJson(url, headers, tags) {
  const started = Date.now();
  const response = http.get(url, { headers, tags });
  const elapsed = Date.now() - started;

  if (tags?.surface === "feed") feedDuration.add(elapsed);
  if (tags?.surface === "prayer") prayerDuration.add(elapsed);
  if (tags?.surface === "search") searchDuration.add(elapsed);
  if (tags?.surface === "mutation") mutationDuration.add(elapsed);

  check(response, {
    [`${tags?.name || "request"} status < 400`]: (r) => r.status > 0 && r.status < 400,
  });

  return response;
}

export function postJson(url, body, headers, tags) {
  const started = Date.now();
  const response = http.post(url, JSON.stringify(body), { headers, tags });
  const elapsed = Date.now() - started;
  mutationDuration.add(elapsed);

  check(response, {
    [`${tags?.name || "post"} status < 500`]: (r) => r.status > 0 && r.status < 500,
  });

  return response;
}

export function deleteJson(url, headers, tags) {
  const started = Date.now();
  const response = http.del(url, null, { headers, tags });
  mutationDuration.add(Date.now() - started);
  return response;
}

export function abortOnHighErrorRate() {
  if (__ENV.HTBF_ABORT_ON_ERROR !== "1") return;

  const failed = http.req_failed;
  if (failed && failed.rate > 0.05) {
    fail(`Aborting: HTTP failure rate ${(failed.rate * 100).toFixed(2)}% exceeds 5%`);
  }
}

export function thinkTime(minSeconds = 2, maxSeconds = 6) {
  const minMs = minSeconds * 1000;
  const maxMs = maxSeconds * 1000;
  const delay = minMs + Math.random() * (maxMs - minMs);
  return delay / 1000;
}
