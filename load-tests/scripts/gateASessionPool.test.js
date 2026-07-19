import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  gateA100LoadPhaseAuthRequests,
  gateA100PreflightAuthRequests,
  isAuthRateLimitedStatus,
  shouldAbortAuthImmediately,
} from "./gateAAuthPolicy.mjs";
import {
  buildPreauthSessionPoolFromCapturedSessions,
  readPreauthSessionFile,
  validatePreauthSessions,
  writePreauthSessionFile,
} from "./gateASessionPool.mjs";
import {
  GATE_A_SYNTHETIC_POOL_SIZE,
  mapVuToSessionIndex,
  vusPerSessionDistribution,
} from "./gateASessionMapping.mjs";
import { textContainsCredentialLeak } from "./gateAAuth.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const GATE_A_100_SCENARIO = resolve(ROOT, "load-tests/k6/scenarios/gate-a-100.js");
const READ_ONLY_BROWSE = resolve(ROOT, "load-tests/k6/scenarios/read-only-browse.js");
const RUN_GATE_A_100 = resolve(ROOT, "load-tests/scripts/run-gate-a-100.mjs");

describe("Gate A 100-user preauth policy", () => {
  it("requires exactly 10 preflight authentications and zero load-phase auths", () => {
    expect(gateA100PreflightAuthRequests()).toBe(10);
    expect(gateA100LoadPhaseAuthRequests()).toBe(0);
  });

  it("aborts immediately on HTTP 429 during auth", () => {
    expect(isAuthRateLimitedStatus(429)).toBe(true);
    expect(shouldAbortAuthImmediately(429)).toBe(true);
    expect(shouldAbortAuthImmediately(500)).toBe(false);
  });
});

describe("Gate A VU-to-session mapping", () => {
  it("maps 100 VUs deterministically across 10 cached sessions", () => {
    expect(mapVuToSessionIndex(1)).toBe(0);
    expect(mapVuToSessionIndex(10)).toBe(9);
    expect(mapVuToSessionIndex(11)).toBe(0);
    expect(mapVuToSessionIndex(100)).toBe(9);
  });

  it("assigns approximately 10 VUs per synthetic session", () => {
    expect(vusPerSessionDistribution(100)).toEqual(Array(GATE_A_SYNTHETIC_POOL_SIZE).fill(10));
  });

  it("keeps mapping stable for repeated VU ids", () => {
    for (let vu = 1; vu <= 100; vu += 1) {
      expect(mapVuToSessionIndex(vu)).toBe(mapVuToSessionIndex(vu));
    }
  });
});

describe("Gate A preauth session pool file handling", () => {
  it("accepts exactly 10 access-token sessions", () => {
    const sessions = Array.from({ length: 10 }, (_, index) => ({
      accessToken: `token-${index + 1}`,
    }));

    expect(validatePreauthSessions(sessions)).toEqual({
      valid: true,
      reason: null,
    });

    const pool = buildPreauthSessionPoolFromCapturedSessions(sessions);
    expect(pool.sessionCount).toBe(10);
    expect(pool.preflightAuthRequests).toBe(10);
    expect(pool.loadPhaseAuthRequests).toBe(0);
    expect(pool.auth429Count).toBe(0);
  });

  it("rejects missing session pools before load begins", () => {
    expect(validatePreauthSessions([])).toEqual({
      valid: false,
      reason: "session_count_mismatch",
    });
    expect(validatePreauthSessions(Array(9).fill({ accessToken: "token" }))).toEqual({
      valid: false,
      reason: "session_count_mismatch",
    });
    expect(
      validatePreauthSessions(
        Array.from({ length: 10 }, (_, index) =>
          index === 3 ? {} : { accessToken: `token-${index}` }
        )
      )
    ).toEqual({
      valid: false,
      reason: "missing_access_token",
    });
  });

  it("writes and reads a gitignored session file without credential-like logging", () => {
    const filePath = resolve(ROOT, "load-tests/k6/fixtures/sessions.pool.local.json");
    const sessions = Array.from({ length: 10 }, (_, index) => ({
      accessToken: `token-${index + 1}`,
    }));

    writePreauthSessionFile(filePath, sessions);
    const loaded = readPreauthSessionFile(filePath);
    expect(loaded).toHaveLength(10);
    expect(textContainsCredentialLeak(JSON.stringify(loaded))).toBe(false);
  });
});

describe("Gate A 100-user scenario source guards", () => {
  it("does not sign in or refresh tokens inside the iteration loop", () => {
    const source = readFileSync(GATE_A_100_SCENARIO, "utf8");
    expect(source).not.toMatch(/resolveSessionForVu/);
    expect(source).not.toMatch(/signInWithPassword/);
    expect(source).not.toMatch(/refresh_token/);
    expect(source).toMatch(/resolvePreauthSessionForVu/);
    expect(source).toMatch(/loadPreauthSessionPool/);
  });

  it("keeps the 100-user workload on the read-only browse mix", () => {
    const scenarioSource = readFileSync(GATE_A_100_SCENARIO, "utf8");
    const readOnlySource = readFileSync(READ_ONLY_BROWSE, "utf8");

    expect(scenarioSource).toMatch(/runReadOnlyMix/);
    expect(readOnlySource).toMatch(/browseFeed/);
    expect(readOnlySource).toMatch(/browsePrayer/);
    expect(readOnlySource).toMatch(/browseVideoFeedMetadata/);
    expect(readOnlySource).toMatch(/browseSearch/);
    expect(readOnlySource).not.toMatch(/postJson/);
    expect(readOnlySource).not.toMatch(/deleteJson/);
  });

  it("requires preauth sessions in the orchestrator before k6 starts", () => {
    const source = readFileSync(RUN_GATE_A_100, "utf8");
    expect(source).toMatch(/captureAuthSessions:\s*true/);
    expect(source).toMatch(/HTBF_PREAUTH_SESSIONS_FILE/);
    expect(source).toMatch(/auth429Count/);
    expect(source).not.toMatch(/HTBF_TEST_USER_POOL_FILE/);
  });
});

describe("Gate A credential-safe session diagnostics", () => {
  it("does not treat short token placeholders as credential leaks in boolean diagnostics", () => {
    expect(
      textContainsCredentialLeak(
        JSON.stringify({
          preflightAuthRequests: 10,
          loadPhaseAuthRequests: 0,
          sessionCount: 10,
        })
      )
    ).toBe(false);
  });
});
