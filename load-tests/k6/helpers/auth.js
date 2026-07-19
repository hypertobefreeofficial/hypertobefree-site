import http from "k6/http";
import { check, fail } from "k6";
import { Counter } from "k6/metrics";
import { SharedArray } from "k6/data";
import {
  buildAuthSignInHeaders,
  maxAuthAttempts,
  shouldAbortAuthImmediately,
  shouldRetryAuth,
} from "../../scripts/gateAAuthPolicy.mjs";

export const authRequestCount = new Counter("htbf_auth_requests");

const tokenCache = {};

const userPool = new SharedArray("htbf_gate_a_user_pool", function loadPool() {
  const poolFile = (__ENV.HTBF_TEST_USER_POOL_FILE || "").trim();
  if (!poolFile) return [];

  const raw = open(poolFile);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("email,"))
    .map((line) => {
      const comma = line.indexOf(",");
      const email = line.slice(0, comma).trim();
      const password = line.slice(comma + 1).trim();
      return { email, password };
    })
    .filter((row) => row.email && row.password);
});

export function signInWithPassword(supabaseUrl, anonKey, email, password) {
  const cacheKey = `${email}`;
  if (tokenCache[cacheKey]) {
    return tokenCache[cacheKey];
  }

  authRequestCount.add(1);

  const url = `${supabaseUrl}/auth/v1/token?grant_type=password`;
  const body = JSON.stringify({ email, password });
  const headers = buildAuthSignInHeaders(anonKey);
  let response = null;

  for (let attempt = 1; attempt <= maxAuthAttempts(); attempt += 1) {
    response = http.post(url, body, {
      headers,
      tags: { name: "auth_sign_in" },
    });

    if (shouldAbortAuthImmediately(response.status)) {
      fail(
        `Authentication aborted for synthetic user: HTTP ${response.status}`
      );
    }

    if (!shouldRetryAuth(response.status, attempt)) {
      break;
    }
  }

  check(response, {
    "auth status is 200": (r) => r.status === 200,
    "auth returns access token": (r) => Boolean(r.json("access_token")),
  });

  if (response.status !== 200) {
    fail(`Authentication failed for synthetic user: HTTP ${response.status}`);
  }

  const accessToken = response.json("access_token");
  if (!accessToken) {
    fail("Authentication failed: missing access token");
  }

  const session = {
    accessToken,
    refreshToken: response.json("refresh_token"),
    userId: response.json("user.id"),
    email,
  };

  tokenCache[cacheKey] = session;
  return session;
}

export function resolveSessionForVu(supabaseUrl, anonKey, users, vuId) {
  if (users.mode === "single") {
    return signInWithPassword(
      supabaseUrl,
      anonKey,
      users.email,
      users.password
    );
  }

  if (userPool.length === 0) {
    fail("User pool is empty");
  }

  const index = (vuId - 1) % userPool.length;
  const row = userPool[index];

  if (!row?.email || !row?.password) {
    fail(`Invalid user pool row at index ${index}`);
  }

  return signInWithPassword(supabaseUrl, anonKey, row.email, row.password);
}

export function __resetAuthCacheForTests() {
  for (const key of Object.keys(tokenCache)) {
    delete tokenCache[key];
  }
}
