import http from "k6/http";
import { check } from "k6";

const tokenCache = {};

export function signInWithPassword(supabaseUrl, anonKey, email, password) {
  const cacheKey = `${email}`;
  if (tokenCache[cacheKey]) {
    return tokenCache[cacheKey];
  }

  const response = http.post(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      tags: { name: "auth_sign_in" },
    }
  );

  check(response, {
    "auth status is 200": (r) => r.status === 200,
    "auth returns access token": (r) => Boolean(r.json("access_token")),
  });

  if (response.status !== 200) {
    throw new Error(`Authentication failed for ${email}: HTTP ${response.status}`);
  }

  const session = {
    accessToken: response.json("access_token"),
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

  const raw = open(users.poolFile);
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error(`User pool file is empty: ${users.poolFile}`);
  }

  const index = (vuId - 1) % lines.length;
  const [email, password] = lines[index].split(",").map((part) => part.trim());

  if (!email || !password) {
    throw new Error(`Invalid user pool row at index ${index}`);
  }

  return signInWithPassword(supabaseUrl, anonKey, email, password);
}
