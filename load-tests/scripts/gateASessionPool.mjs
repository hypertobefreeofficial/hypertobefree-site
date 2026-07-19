/**
 * Gate A pre-authenticated session pool for 100-user read-only runs.
 * Never logs emails, passwords, keys, tokens, user IDs, or URLs.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GATE_A_SYNTHETIC_POOL_SIZE,
  mapVuToSessionIndex,
} from "./gateASessionMapping.mjs";

export { GATE_A_SYNTHETIC_POOL_SIZE, mapVuToSessionIndex };

export function defaultPreauthSessionsFile(repoRoot) {
  return resolve(repoRoot, "load-tests/k6/fixtures/sessions.pool.local.json");
}

export function parseUserPoolRows(csvContent) {
  return csvContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("email,"))
    .map((line) => {
      const comma = line.indexOf(",");
      return {
        email: line.slice(0, comma).trim(),
        password: line.slice(comma + 1).trim(),
      };
    })
    .filter((row) => row.email && row.password);
}

export function validatePreauthSessions(sessions, expectedCount = GATE_A_SYNTHETIC_POOL_SIZE) {
  if (!Array.isArray(sessions)) {
    return { valid: false, reason: "sessions_not_array" };
  }
  if (sessions.length !== expectedCount) {
    return { valid: false, reason: "session_count_mismatch" };
  }
  for (const session of sessions) {
    if (!session?.accessToken || typeof session.accessToken !== "string") {
      return { valid: false, reason: "missing_access_token" };
    }
  }
  return { valid: true, reason: null };
}

export function writePreauthSessionFile(filePath, sessions) {
  const validation = validatePreauthSessions(sessions);
  if (!validation.valid) {
    throw new Error(`Refusing to write invalid preauth session pool: ${validation.reason}`);
  }

  const payload = JSON.stringify(
    sessions.map((session) => ({ accessToken: session.accessToken }))
  );

  writeFileSync(filePath, payload, "utf8");
}

export function readPreauthSessionFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error("Preauth session file is missing.");
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("Preauth session file is not valid JSON.");
  }

  const validation = validatePreauthSessions(parsed);
  if (!validation.valid) {
    throw new Error(`Preauth session file is invalid: ${validation.reason}`);
  }

  return parsed;
}

export function buildPreauthSessionPoolFromCapturedSessions(sessions) {
  const validation = validatePreauthSessions(sessions);
  if (!validation.valid) {
    throw new Error(`Captured preauth sessions are invalid: ${validation.reason}`);
  }

  return {
    sessionCount: sessions.length,
    preflightAuthRequests: sessions.length,
    loadPhaseAuthRequests: 0,
    auth429Count: 0,
    sessions: sessions.map((session) => ({ accessToken: session.accessToken })),
  };
}
