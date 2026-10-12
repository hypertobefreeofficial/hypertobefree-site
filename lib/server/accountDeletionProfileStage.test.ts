import { describe, expect, it, vi } from "vitest";
import { prepareAccountDeletionProfileStage } from "./accountDeletionProfileStage";
import {
  ACCOUNT_DELETION_PROFILE_EXECUTION_ENV_FLAG,
  accountDeletionScrubbedProfileEmail,
  accountDeletionScrubbedProfileUsername,
  accountDeletionProfileUsernameIsDeletionTombstoneNamespace,
  isAccountDeletionProfileExecutionEnabled,
} from "./accountDeletionProfileStagePolicy";

const REQUEST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ATTEMPT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_TARGET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORIGINAL_EMAIL = "user@example.test";

describe("accountDeletionProfileStagePolicy", () => {
  const envWith = (profile: string | undefined) => ({
    HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "false",
    HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "false",
    [ACCOUNT_DELETION_PROFILE_EXECUTION_ENV_FLAG]: profile,
  });

  it("P-A-PROFILE-SCRUB: deterministic tombstone email format", () => {
    expect(accountDeletionScrubbedProfileEmail(TARGET)).toBe(
      "account-deletion+aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@deleted.invalid"
    );
    expect(accountDeletionScrubbedProfileEmail(TARGET)).not.toBe(ORIGINAL_EMAIL);
    expect(accountDeletionScrubbedProfileEmail(TARGET)).not.toContain(".local");
  });

  it("P-A-PROFILE-SCRUB: distinct targets and idempotent tombstone", () => {
    const first = accountDeletionScrubbedProfileEmail(TARGET);
    const second = accountDeletionScrubbedProfileEmail(TARGET);
    const other = accountDeletionScrubbedProfileEmail(OTHER_TARGET);
    expect(first).toBe(second);
    expect(other).toBe(
      "account-deletion+bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb@deleted.invalid"
    );
    expect(first).not.toBe(other);
  });

  it("P-A-PROFILE-SCRUB: tombstone fits profiles.email text NOT NULL shape", () => {
    const tombstone = accountDeletionScrubbedProfileEmail(TARGET);
    expect(tombstone.length).toBeGreaterThan(0);
    expect(tombstone.length).toBeLessThanOrEqual(320);
    expect(tombstone).toMatch(
      /^account-deletion\+[0-9a-f-]{36}@deleted\.invalid$/i
    );
  });

  it("P-A-PROFILE-SCRUB: deterministic tombstone username format", () => {
    expect(accountDeletionScrubbedProfileUsername(TARGET)).toBe(
      "del_aaaaaaaaaaaa4aaa8aaa"
    );
    expect(accountDeletionScrubbedProfileUsername(TARGET)).toMatch(
      /^del_[a-f0-9]{20}$/
    );
    expect(accountDeletionScrubbedProfileUsername(TARGET).length).toBeLessThanOrEqual(24);
    expect(
      accountDeletionProfileUsernameIsDeletionTombstoneNamespace(
        accountDeletionScrubbedProfileUsername(TARGET)
      )
    ).toBe(true);
    expect(accountDeletionProfileUsernameIsDeletionTombstoneNamespace("del_extra")).toBe(
      false
    );
    expect(accountDeletionProfileUsernameIsDeletionTombstoneNamespace("profile_pii_user")).toBe(
      false
    );
  });

  it("P-A-FLAG: exact true only enables profile execution policy helper", () => {
    expect(isAccountDeletionProfileExecutionEnabled(envWith("true"))).toBe(true);
    expect(isAccountDeletionProfileExecutionEnabled(envWith(undefined))).toBe(false);
    expect(isAccountDeletionProfileExecutionEnabled(envWith("false"))).toBe(false);
    expect(isAccountDeletionProfileExecutionEnabled(envWith("TRUE"))).toBe(false);
    expect(isAccountDeletionProfileExecutionEnabled(envWith("1"))).toBe(false);
  });
});

describe("prepareAccountDeletionProfileStage wrapper", () => {
  it("rejects invalid UUID arguments without RPC", async () => {
    const rpc = vi.fn();
    const result = await prepareAccountDeletionProfileStage({
      serviceRoleClient: { rpc } as never,
      requestId: "not-a-uuid",
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invalid_arguments" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps successful prepared payload", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        code: "prepared",
        request_id: REQUEST,
        attempt_id: ATTEMPT,
        target_user_id: TARGET,
        stage: "profile",
        profile_rows_affected: { inbox_messages_recipient_owned: 2 },
        cleanup_snapshot: {
          avatar_url_severed: true,
          identity_scrubbed: true,
          deferred_profile_result_count: 1,
        },
      },
      error: null,
    }));
    const result = await prepareAccountDeletionProfileStage({
      serviceRoleClient: { rpc } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toBe("prepared");
    expect(result.cleanupSnapshot.deferredProfileResultCount).toBe(1);
    expect(rpc).toHaveBeenCalledWith("prepare_account_deletion_profile_stage", {
      p_request_id: REQUEST,
      p_attempt_id: ATTEMPT,
    });
  });

  it("does not leak raw RPC error text", async () => {
    const result = await prepareAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: null,
          error: { message: "secret db detail" },
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "rpc_error" });
  });
});

describe("P-A-NO-SURFACE static guards", () => {
  it("execute handler and orchestrator do not import profile stage module", async () => {
    const { readFileSync } = await import("node:fs");
    const handler = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );
    const orchestrator = readFileSync(
      "lib/server/accountDeletionExecutionOrchestrator.ts",
      "utf8"
    );
    const route = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
      "utf8"
    );
    expect(handler).not.toContain("accountDeletionProfileStage");
    expect(orchestrator).toContain("prepareAccountDeletionProfileStage");
    expect(route).not.toContain("prepare_account_deletion_profile_stage");
    expect(handler).not.toContain("prepareAccountDeletionProfileStage");
    expect(route).not.toContain("prepareAccountDeletionProfileStage");
  });
});
