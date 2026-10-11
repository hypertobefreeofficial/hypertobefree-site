import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_PROFILE_MEDIA_STATES,
  isAccountDeletionPhysicalProfileMediaExecutionEnabled,
  parseAccountDeletionProfileMediaClaim,
  parseAccountDeletionProfileMediaDeleteAuthority,
  parseAccountDeletionProfileMediaProgress,
} from "./accountDeletionProfileMediaPolicy";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";
import { isAccountDeletionProfileExecutionEnabled } from "./accountDeletionProfileStagePolicy";
import { isAccountDeletionStorageExecutionEnabled } from "./accountDeletionStorageExecutionPolicy";

const NONEXACT_FLAG_VALUES = ["TRUE", "1", "yes", " true ", "", undefined] as const;

const FLAG_HELPERS = [
  [
    "HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED",
    isAccountDeletionExecutionEnabled,
  ],
  [
    "HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED",
    isAccountDeletionProfileExecutionEnabled,
  ],
  [
    "HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED",
    isAccountDeletionStorageExecutionEnabled,
  ],
] as const;

describe("accountDeletionProfileMediaPolicy", () => {
  it("requires global, profile, and storage flags to be exact true", () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
      HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
      HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
    };
    expect(isAccountDeletionPhysicalProfileMediaExecutionEnabled(env)).toBe(true);
    for (const [flag] of FLAG_HELPERS) {
      expect(
        isAccountDeletionPhysicalProfileMediaExecutionEnabled({
          ...env,
          [flag]: "TRUE",
        })
      ).toBe(false);
    }
    expect(
      isAccountDeletionPhysicalProfileMediaExecutionEnabled({
        NODE_ENV: "test",
      })
    ).toBe(false);
  });

  for (const [flag, helper] of FLAG_HELPERS) {
    it(`${flag} enables only for the exact string true`, () => {
      expect(helper({ NODE_ENV: "test", [flag]: "true" })).toBe(true);
      for (const value of NONEXACT_FLAG_VALUES) {
        const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
        if (value !== undefined) env[flag] = value;
        expect(helper(env), `${flag}=${String(value)}`).toBe(false);
      }
    });
  }

  it("physical profile deletion rejects every nonexact value on every flag", () => {
    const exact: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
      HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
      HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
    };
    expect(isAccountDeletionPhysicalProfileMediaExecutionEnabled(exact)).toBe(true);

    for (const [flag] of FLAG_HELPERS) {
      for (const value of NONEXACT_FLAG_VALUES) {
        const env = { ...exact };
        if (value === undefined) delete env[flag];
        else env[flag] = value;
        expect(
          isAccountDeletionPhysicalProfileMediaExecutionEnabled(env),
          `${flag}=${String(value)}`
        ).toBe(false);
      }
    }
  });

  it("exposes only the DEFER_PROFILE execution states", () => {
    expect(ACCOUNT_DELETION_PROFILE_MEDIA_STATES).toEqual([
      "deferred_profile",
      "deleting",
      "deleted",
      "missing",
      "failed_retryable",
      "failed_terminal",
    ]);
    expect(ACCOUNT_DELETION_PROFILE_MEDIA_STATES).not.toContain("pending" as never);
    expect(ACCOUNT_DELETION_PROFILE_MEDIA_STATES).not.toContain(
      "blocked_on_hold" as never
    );
  });

  it("parses bounded claim authority and rejects malformed payloads", () => {
    expect(
      parseAccountDeletionProfileMediaClaim({
        ok: true,
        code: "claimed",
        result_id: "result",
        claim_token: "claim",
        claim_lease_expires_at: "2026-10-10T00:00:00Z",
        reclaimed: true,
        object_path: "must-not-be-copied",
      })
    ).toEqual({
      resultId: "result",
      claimToken: "claim",
      claimExpiresAt: "2026-10-10T00:00:00Z",
      reclaimed: true,
    });
    expect(parseAccountDeletionProfileMediaClaim({ ok: true, code: "claimed" })).toBeNull();
  });

  it("accepts delete authority only for the exact profile bucket", () => {
    const payload = {
      ok: true,
      code: "authorized",
      result_id: "result",
      bucket: "profile-avatars",
      object_path: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/avatar.png",
      delete_commit_token: "commit",
      delete_commit_expires_at: "2026-10-10T00:00:00Z",
    };
    expect(parseAccountDeletionProfileMediaDeleteAuthority(payload)?.bucket).toBe(
      "profile-avatars"
    );
    expect(
      parseAccountDeletionProfileMediaDeleteAuthority({
        ...payload,
        bucket: "journey-private-media",
      })
    ).toBeNull();
  });

  it("parses only bounded progress counts", () => {
    const payload = {
      ok: true,
      total: 1,
      result_count: 1,
      deferred_profile: 1,
      deleting: 0,
      deleted: 0,
      missing: 0,
      failed_retryable: 0,
      failed_terminal: 0,
      active_hold_count: 0,
      actionable_count: 1,
      mismatch_count: 0,
      completion_blocked: true,
      object_path: "not returned by parser",
    };
    expect(parseAccountDeletionProfileMediaProgress(payload)).toEqual({
      total: 1,
      resultCount: 1,
      deferredProfile: 1,
      deleting: 0,
      deleted: 0,
      missing: 0,
      failedRetryable: 0,
      failedTerminal: 0,
      activeHoldCount: 0,
      actionableCount: 1,
      mismatchCount: 0,
      completionBlocked: true,
    });
    expect(
      parseAccountDeletionProfileMediaProgress({ ...payload, total: "1" })
    ).toBeNull();
  });
});
