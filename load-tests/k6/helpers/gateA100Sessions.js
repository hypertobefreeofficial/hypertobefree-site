import { fail } from "k6";
import { SharedArray } from "k6/data";
import {
  GATE_A_SYNTHETIC_POOL_SIZE,
  mapVuToSessionIndex,
} from "../../scripts/gateASessionMapping.mjs";

export { GATE_A_SYNTHETIC_POOL_SIZE, mapVuToSessionIndex };

export function loadPreauthSessionPool() {
  return new SharedArray("htbf_gate_a_preauth_sessions", function loadSessions() {
    const filePath = (__ENV.HTBF_PREAUTH_SESSIONS_FILE || "").trim();
    if (!filePath) {
      fail("Missing HTBF_PREAUTH_SESSIONS_FILE for Gate A 100-user run.");
    }

    let parsed;
    try {
      parsed = JSON.parse(open(filePath));
    } catch {
      fail("Preauth session file is not valid JSON.");
    }

    if (!Array.isArray(parsed) || parsed.length !== GATE_A_SYNTHETIC_POOL_SIZE) {
      fail(
        `Preauth session pool must contain exactly ${GATE_A_SYNTHETIC_POOL_SIZE} sessions.`
      );
    }

    for (let index = 0; index < parsed.length; index += 1) {
      if (!parsed[index]?.accessToken) {
        fail(`Preauth session at index ${index} is missing an access token.`);
      }
    }

    return parsed.map((session) => ({ accessToken: session.accessToken }));
  });
}

export function assertPreauthSessionPoolReady(sessionPool) {
  if (!sessionPool || sessionPool.length !== GATE_A_SYNTHETIC_POOL_SIZE) {
    fail(
      `Preauth session pool must contain exactly ${GATE_A_SYNTHETIC_POOL_SIZE} sessions before load begins.`
    );
  }
}

export function resolvePreauthSessionForVu(sessionPool, vuId) {
  const index = mapVuToSessionIndex(vuId, sessionPool.length);
  const session = sessionPool[index];
  if (!session?.accessToken) {
    fail(`Missing preauth session for VU ${vuId} at pool index ${index}.`);
  }
  return session;
}
