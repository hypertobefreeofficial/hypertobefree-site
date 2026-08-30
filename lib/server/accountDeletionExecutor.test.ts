import { describe, expect, it, vi } from "vitest";
import { ACCOUNT_DELETION_STATUS } from "../accountCenter/accountDeletionLifecycle";
import {
  BLOCKED_ADMIN_ACCOUNT_CODE,
  BLOCKED_OWNER_ACCOUNT_CODE,
  ACCOUNT_DELETION_EXECUTION_ENV_FLAG,
  buildAccountDeletionExecutionAuditEvent,
  isAccountDeletionExecutionEnabled,
  sanitizeAccountDeletionExecutionErrorMessage,
  httpStatusForAccountDeletionExecutionError,
} from "./accountDeletionExecutionPolicy";
import {
  validateExecutionEligibility,
  validatePrivilegedTarget,
  validateManifestForExecution,
  prepareAccountDeletionExecution,
  createDefaultExecutionLockUpdater,
  acquireExecutionLock,
  type AccountDeletionExecutionDeps,
  type AccountDeletionExecutionRequestRow,
  ACCOUNT_DELETION_EXECUTION_LOCK_DESIGN_NOTE,
} from "./accountDeletionExecutor";
import { readFileSync } from "node:fs";

function approvedRequest(
  overrides: Partial<AccountDeletionExecutionRequestRow> = {}
): AccountDeletionExecutionRequestRow {
  return {
    id: "req-approved",
    user_id: "target-user",
    email: "target@example.com",
    status: ACCOUNT_DELETION_STATUS.APPROVED,
    target_user_id_snapshot: "target-user",
    execution_started_at: null,
    ...overrides,
  };
}

function buildDeps(
  overrides: Partial<AccountDeletionExecutionDeps> = {}
): AccountDeletionExecutionDeps {
  return {
    isExecutionEnabled: () => false,
    verifyAdmin: vi.fn(async () => true),
    verifyAdminAal2: vi.fn(async () => ({ ok: true as const })),
    loadDeletionRequest: vi.fn(async () => approvedRequest()),
    loadProfile: vi.fn(async () => ({
      id: "target-user",
      is_owner: false,
      is_admin: false,
    })),
    buildManifest: vi.fn(async () => ({
      ok: true as const,
      manifest: {
        identity: { requestId: "req-approved", targetUserId: "target-user" },
        blocked: false,
        blockCode: null,
        warnings: [],
      },
    })),
    tryAcquireExecutionLock: vi.fn(async () => ({
      ok: true as const,
      request: approvedRequest({
        status: ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
      }),
    })),
    ...overrides,
  };
}

describe("accountDeletionExecutionPolicy", () => {
  it("defaults execution to disabled without server flag", () => {
    const env = { ...process.env };
    delete env[ACCOUNT_DELETION_EXECUTION_ENV_FLAG];
    expect(isAccountDeletionExecutionEnabled(env)).toBe(false);
    expect(isAccountDeletionExecutionEnabled({ ...env, [ACCOUNT_DELETION_EXECUTION_ENV_FLAG]: "false" })).toBe(false);
    expect(isAccountDeletionExecutionEnabled({ ...env, [ACCOUNT_DELETION_EXECUTION_ENV_FLAG]: "true" })).toBe(true);
  });

  it("does not expose execution flag via NEXT_PUBLIC", () => {
    expect(readFileSync("lib/server/accountDeletionExecutionPolicy.ts", "utf8")).not.toContain(
      "NEXT_PUBLIC_"
    );
  });

  it("builds audit events without secrets", () => {
    const event = buildAccountDeletionExecutionAuditEvent({
      actorUserId: "admin-1",
      targetUserId: "target-1",
      requestId: "req-1",
      result: "prepared_not_executed",
      requestStatus: "approved",
      stageReached: "prepare_execution",
    });

    expect(event.action).toBe("account_deletion_execution");
    expect(JSON.stringify(event)).not.toMatch(/refresh_token|service.role|totp/i);
  });

  it("maps sanitized errors to HTTP statuses", () => {
    expect(sanitizeAccountDeletionExecutionErrorMessage("execution_disabled")).toBe(
      "account_deletion_execution_disabled"
    );
    expect(httpStatusForAccountDeletionExecutionError("execution_disabled")).toBe(503);
    expect(httpStatusForAccountDeletionExecutionError("mfa_step_up_required")).toBe(403);
    expect(httpStatusForAccountDeletionExecutionError("already_deleted")).toBe(200);
  });
});

describe("validateExecutionEligibility", () => {
  it("approves only approved requests with resolvable targets", () => {
    const result = validateExecutionEligibility(approvedRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targetUserId).toBe("target-user");
  });

  it("derives target from snapshot when user_id is null", () => {
    const result = validateExecutionEligibility(
      approvedRequest({
        user_id: null,
        target_user_id_snapshot: "snapshot-user",
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targetUserId).toBe("snapshot-user");
  });

  it("rejects missing request and target", () => {
    expect(validateExecutionEligibility(null).code).toBe("request_not_found");
    expect(
      validateExecutionEligibility(
        approvedRequest({ user_id: null, target_user_id_snapshot: null })
      ).code
    ).toBe("target_not_found");
  });

  it.each([
    ACCOUNT_DELETION_STATUS.SUBMITTED,
    ACCOUNT_DELETION_STATUS.REVIEWING,
    ACCOUNT_DELETION_STATUS.REJECTED,
    ACCOUNT_DELETION_STATUS.CANCELLED,
    ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED,
    "completed",
    ACCOUNT_DELETION_STATUS.FAILED,
  ])("denies non-executable status %s", (status) => {
    expect(
      validateExecutionEligibility(approvedRequest({ status })).code
    ).toBe("request_not_approved");
  });

  it("returns idempotent already_deleted", () => {
    expect(
      validateExecutionEligibility(
        approvedRequest({ status: ACCOUNT_DELETION_STATUS.DELETED })
      ).code
    ).toBe("already_deleted");
  });

  it("returns execution_in_progress for concurrent attempts", () => {
    expect(
      validateExecutionEligibility(
        approvedRequest({ status: ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS })
      ).code
    ).toBe("execution_in_progress");
  });
});

describe("validatePrivilegedTarget", () => {
  it("blocks owner and admin targets in phase 1C", () => {
    expect(
      validatePrivilegedTarget({ id: "u1", is_owner: true, is_admin: false }).code
    ).toBe("blocked_owner");
    expect(
      validatePrivilegedTarget({ id: "u2", is_owner: false, is_admin: true }).code
    ).toBe("blocked_admin");
    expect(validatePrivilegedTarget({ id: "u3", is_owner: false, is_admin: false }).ok).toBe(
      true
    );
  });
});

describe("validateManifestForExecution", () => {
  it("requires fresh server-side manifest and blocks privileged codes", () => {
    expect(
      validateManifestForExecution({ ok: false, code: "request_not_found" }).code
    ).toBe("manifest_failed");

    expect(
      validateManifestForExecution({
        ok: true,
        manifest: {
          identity: { requestId: "r1", targetUserId: "t1" },
          blocked: true,
          blockCode: BLOCKED_OWNER_ACCOUNT_CODE,
          warnings: [],
        },
      }).code
    ).toBe("manifest_blocked");

    expect(
      validateManifestForExecution({
        ok: true,
        manifest: {
          identity: { requestId: "r1", targetUserId: "t1" },
          blocked: true,
          blockCode: BLOCKED_ADMIN_ACCOUNT_CODE,
          warnings: [],
        },
      }).code
    ).toBe("manifest_blocked");
  });
});

describe("prepareAccountDeletionExecution", () => {
  it("completes preparation for eligible approved requests", async () => {
    const deps = buildDeps();
    const result = await prepareAccountDeletionExecution({
      requestId: "req-approved",
      actorUserId: "admin-1",
      deps,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.destructiveStages.every((s) => s.status === "NOT_IMPLEMENTED")).toBe(
      true
    );
    expect(deps.buildManifest).toHaveBeenCalledWith("req-approved");
    expect(deps.tryAcquireExecutionLock).not.toHaveBeenCalled();
  });

  it("does not mutate approved fixture status during preparation", async () => {
    const request = approvedRequest();
    const deps = buildDeps({
      loadDeletionRequest: vi.fn(async () => request),
    });

    await prepareAccountDeletionExecution({
      requestId: "req-approved",
      actorUserId: "admin-1",
      deps,
    });

    expect(request.status).toBe(ACCOUNT_DELETION_STATUS.APPROVED);
  });
});

describe("execution lock design", () => {
  it("uses conditional update for atomic approved → deletion_in_progress", async () => {
    const updateEq = vi.fn().mockReturnThis();
    const updateSelect = vi.fn().mockReturnThis();
    const updateMaybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: approvedRequest({
          status: ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
        }),
        error: null,
      });

    const selectEq = vi.fn().mockReturnThis();
    const selectMaybeSingle = vi.fn().mockResolvedValue({
      data: approvedRequest({
        status: ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
      }),
      error: null,
    });

    const serviceRoleClient = {
      from: vi.fn((table: string) => {
        expect(table).toBe("account_deletion_requests");
        return {
          update: vi.fn(() => ({
            eq: updateEq,
            select: updateSelect,
            maybeSingle: updateMaybeSingle,
          })),
          select: vi.fn(() => ({
            eq: selectEq,
            maybeSingle: selectMaybeSingle,
          })),
        };
      }),
    };

    const tryAcquire = createDefaultExecutionLockUpdater(
      serviceRoleClient as never
    );
    const lock = await tryAcquire("req-approved");

    expect(updateEq).toHaveBeenCalledWith("id", "req-approved");
    expect(updateEq).toHaveBeenCalledWith("status", ACCOUNT_DELETION_STATUS.APPROVED);
    expect(lock.ok).toBe(false);
    if (lock.ok) return;
    expect(lock.code).toBe("execution_in_progress");
    expect(ACCOUNT_DELETION_EXECUTION_LOCK_DESIGN_NOTE).toContain("conditional UPDATE");
  });

  it("prevents duplicate lock acquisition conceptually", async () => {
    const deps = buildDeps({
      tryAcquireExecutionLock: vi.fn(async () => ({
        ok: false as const,
        code: "execution_in_progress" as const,
        request: approvedRequest({
          status: ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
        }),
      })),
    });

    const first = await acquireExecutionLock("req-approved", deps);
    const second = await acquireExecutionLock("req-approved", deps);

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(deps.tryAcquireExecutionLock).toHaveBeenCalledTimes(2);
  });
});

describe("no destructive runtime in executor skeleton", () => {
  it("does not call auth.admin.deleteUser, storage.remove, or session revocation", () => {
    const source = readFileSync("lib/server/accountDeletionExecutor.ts", "utf8");
    expect(source).not.toContain("deleteUser");
    expect(source).not.toContain(".remove(");
    expect(source).not.toContain("signOut");
    expect(source).not.toContain("DELETE FROM");
  });
});
