import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_AUTH_HARD_DELETE,
  classifyAuthAdminGetUserByIdResponse,
  executeAccountDeletionAuthDelete,
  isAuthAdminUserNotFoundError,
  type AccountDeletionAuthExecutorDeps,
} from "./accountDeletionAuthExecutor";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_USER_ID = "33333333-3333-4333-8333-333333333333";
const COMMIT_TOKEN = "44444444-4444-4444-8444-444444444444";
const FUTURE = "2030-01-01T00:00:00.000Z";

function claimSuccess(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    code: "claimed",
    request_id: REQUEST_ID,
    attempt_id: ATTEMPT_ID,
    target_user_id: TARGET_USER_ID,
    claim_token: "55555555-5555-4555-8555-555555555555",
    delete_commit_token: COMMIT_TOKEN,
    claim_lease_expires_at: FUTURE,
    delete_commit_expires_at: FUTURE,
    stage: "auth",
    ...overrides,
  };
}

function completeSuccess(outcome: "deleted" | "already_absent") {
  return {
    ok: true,
    code: "completed",
    request_id: REQUEST_ID,
    attempt_id: ATTEMPT_ID,
    target_user_id: TARGET_USER_ID,
    stage: "finalize",
    outcome,
  };
}

function enabledFlags(): Pick<
  AccountDeletionAuthExecutorDeps,
  "isGlobalExecutionEnabled" | "isAuthExecutionEnabled"
> {
  return {
    isGlobalExecutionEnabled: () => true,
    isAuthExecutionEnabled: () => true,
  };
}

function makeDeps(
  overrides: Partial<AccountDeletionAuthExecutorDeps> = {}
): AccountDeletionAuthExecutorDeps {
  const claimAuthExecution = vi.fn(async () => claimSuccess());
  const completeAuthExecution = vi.fn(async (input) =>
    completeSuccess(input.outcome)
  );
  const getUserById = vi.fn(async () => ({
    data: { user: { id: TARGET_USER_ID } },
    error: null,
  }));
  const deleteUser = vi.fn(async () => ({
    data: { user: {} },
    error: null,
  }));
  return {
    serviceRoleClient: {} as AccountDeletionAuthExecutorDeps["serviceRoleClient"],
    ...enabledFlags(),
    claimAuthExecution,
    completeAuthExecution,
    getUserById,
    deleteUser,
    ...overrides,
  };
}

function run(deps: AccountDeletionAuthExecutorDeps) {
  return executeAccountDeletionAuthDelete({
    serviceRoleClient: deps.serviceRoleClient,
    requestId: REQUEST_ID,
    attemptId: ATTEMPT_ID,
    deps,
  });
}

describe("executeAccountDeletionAuthDelete", () => {
  it("returns disabled when global execution flag is off", async () => {
    const deps = makeDeps({
      isGlobalExecutionEnabled: () => false,
      isAuthExecutionEnabled: () => true,
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "auth_execution_disabled" });
    expect(deps.claimAuthExecution).not.toHaveBeenCalled();
    expect(deps.getUserById).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("returns disabled when auth execution flag is off", async () => {
    const deps = makeDeps({
      isGlobalExecutionEnabled: () => true,
      isAuthExecutionEnabled: () => false,
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "auth_execution_disabled" });
    expect(deps.claimAuthExecution).not.toHaveBeenCalled();
  });

  it("rejects invalid request UUID", async () => {
    const deps = makeDeps();
    const result = await executeAccountDeletionAuthDelete({
      serviceRoleClient: deps.serviceRoleClient,
      requestId: "not-a-uuid",
      attemptId: ATTEMPT_ID,
      deps,
    });
    expect(result).toEqual({ ok: false, code: "invalid_arguments" });
    expect(deps.claimAuthExecution).not.toHaveBeenCalled();
  });

  it("rejects invalid attempt UUID", async () => {
    const deps = makeDeps();
    const result = await executeAccountDeletionAuthDelete({
      serviceRoleClient: deps.serviceRoleClient,
      requestId: REQUEST_ID,
      attemptId: "bad",
      deps,
    });
    expect(result).toEqual({ ok: false, code: "invalid_arguments" });
    expect(deps.claimAuthExecution).not.toHaveBeenCalled();
  });

  it("fails closed on malformed claim payload", async () => {
    const deps = makeDeps({
      claimAuthExecution: vi.fn(async () => ({
        ok: true,
        code: "claimed",
        stage: "auth",
      })),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "claim_invariant_failed" });
    expect(deps.getUserById).not.toHaveBeenCalled();
  });

  it("uses authoritative target from claim only", async () => {
    const deps = makeDeps();
    await run(deps);
    expect(deps.getUserById).toHaveBeenCalledTimes(2);
    expect(deps.getUserById).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(deps.deleteUser).toHaveBeenCalledWith(TARGET_USER_ID, false);
  });

  it("already-absent precheck: no deleteUser, complete once with already_absent", async () => {
    const deps = makeDeps({
      getUserById: vi.fn(async () => ({
        data: { user: null },
        error: { status: 404, code: "user_not_found", message: "secret" },
      })),
    });
    const result = await run(deps);
    expect(result).toEqual({
      ok: true,
      code: "auth_already_absent",
      requestId: REQUEST_ID,
      attemptId: ATTEMPT_ID,
      stage: "finalize",
    });
    expect(deps.deleteUser).not.toHaveBeenCalled();
    expect(deps.getUserById).toHaveBeenCalledTimes(1);
    expect(deps.completeAuthExecution).toHaveBeenCalledTimes(1);
    expect(deps.completeAuthExecution).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      attemptId: ATTEMPT_ID,
      deleteCommitToken: COMMIT_TOKEN,
      outcome: "already_absent",
    });
  });

  it("present user: hard delete once, postcheck absent, complete deleted", async () => {
    const deps = makeDeps({
      getUserById: vi
        .fn()
        .mockResolvedValueOnce({
          data: { user: { id: TARGET_USER_ID } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: { status: 404, code: "user_not_found" },
        }),
    });
    const result = await run(deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBe("auth_deleted");
      expect(result.stage).toBe("finalize");
    }
    expect(deps.deleteUser).toHaveBeenCalledTimes(1);
    expect(deps.deleteUser).toHaveBeenCalledWith(TARGET_USER_ID, false);
    expect(deps.completeAuthExecution).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deleted" })
    );
  });

  it("delete error with postcheck absent completes as already_absent when delete reports missing", async () => {
    const deps = makeDeps({
      getUserById: vi
        .fn()
        .mockResolvedValueOnce({
          data: { user: { id: TARGET_USER_ID } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: { status: 404, code: "user_not_found" },
        }),
      deleteUser: vi.fn(async () => ({
        data: { user: null },
        error: { status: 404, code: "user_not_found" },
      })),
    });
    const result = await run(deps);
    expect(result).toMatchObject({
      ok: true,
      code: "auth_already_absent",
      stage: "finalize",
    });
    expect(deps.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("delete error with postcheck absent completes deleted when absence proven", async () => {
    const deps = makeDeps({
      deleteUser: vi.fn(async () => ({
        data: { user: null },
        error: { status: 500, code: "unexpected_failure" },
      })),
      getUserById: vi
        .fn()
        .mockResolvedValueOnce({
          data: { user: { id: TARGET_USER_ID } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: { status: 404, code: "user_not_found" },
        }),
    });
    const result = await run(deps);
    expect(result).toMatchObject({ ok: true, code: "auth_deleted" });
    expect(deps.completeAuthExecution).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deleted" })
    );
  });

  it("delete error with postcheck still present fails verification", async () => {
    const deps = makeDeps({
      deleteUser: vi.fn(async () => ({
        data: { user: null },
        error: { status: 500, code: "unexpected_failure", message: "boom" },
      })),
      getUserById: vi
        .fn()
        .mockResolvedValueOnce({
          data: { user: { id: TARGET_USER_ID } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user: { id: TARGET_USER_ID } },
          error: null,
        }),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "auth_verification_failed" });
    expect(deps.completeAuthExecution).not.toHaveBeenCalled();
  });

  it("ambiguous postcheck returns retryable postcheck failure", async () => {
    const deps = makeDeps({
      getUserById: vi
        .fn()
        .mockResolvedValueOnce({
          data: { user: { id: TARGET_USER_ID } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: { status: 503, code: "unexpected_failure" },
        }),
    });
    const result = await run(deps);
    expect(result).toEqual({
      ok: false,
      code: "auth_postcheck_failed",
      retryable: true,
    });
    expect(deps.completeAuthExecution).not.toHaveBeenCalled();
  });

  it("ambiguous precheck does not call deleteUser", async () => {
    const deps = makeDeps({
      getUserById: vi.fn(async () => ({
        data: { user: null },
        error: { status: 503, code: "unexpected_failure" },
      })),
    });
    const result = await run(deps);
    expect(result).toEqual({
      ok: false,
      code: "auth_precheck_failed",
      retryable: true,
    });
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects completion when target_user_id mismatches claim authority", async () => {
    const deps = makeDeps({
      getUserById: vi.fn(async () => ({
        data: { user: null },
        error: { status: 404, code: "user_not_found" },
      })),
      completeAuthExecution: vi.fn(async (input) => ({
        ...completeSuccess(input.outcome),
        target_user_id: "99999999-9999-4999-8999-999999999999",
      })),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "complete_invariant_failed" });
    expect(deps.completeAuthExecution).toHaveBeenCalledTimes(1);
  });

  it("wrong completion response fails invariant without leaking tokens", async () => {
    const deps = makeDeps({
      getUserById: vi
        .fn()
        .mockResolvedValueOnce({
          data: { user: { id: TARGET_USER_ID } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: { status: 404, code: "user_not_found" },
        }),
      completeAuthExecution: vi.fn(async () => ({
        ok: true,
        code: "completed",
        request_id: REQUEST_ID,
        attempt_id: ATTEMPT_ID,
        stage: "auth",
        outcome: "deleted",
        delete_commit_token: COMMIT_TOKEN,
        claim_token: "leak-me",
      })),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "complete_invariant_failed" });
    expect(JSON.stringify(result)).not.toContain(COMMIT_TOKEN);
    expect(JSON.stringify(result)).not.toContain("leak-me");
  });

  it("enforces bounded RPC and auth call counts on happy path", async () => {
    const deps = makeDeps({
      getUserById: vi
        .fn()
        .mockResolvedValueOnce({
          data: { user: { id: TARGET_USER_ID } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: { status: 404, code: "user_not_found" },
        }),
    });
    await run(deps);
    expect(deps.claimAuthExecution).toHaveBeenCalledTimes(1);
    expect(deps.getUserById).toHaveBeenCalledTimes(2);
    expect(deps.deleteUser).toHaveBeenCalledTimes(1);
    expect(deps.completeAuthExecution).toHaveBeenCalledTimes(1);
  });

  it("claim transport failure is retryable and sanitized", async () => {
    const deps = makeDeps({
      claimAuthExecution: vi.fn(async () => ({ ok: false, code: "rpc_error" })),
    });
    const result = await run(deps);
    expect(result).toEqual({
      ok: false,
      code: "claim_rpc_failed",
      retryable: true,
    });
    expect(JSON.stringify(result)).not.toContain(COMMIT_TOKEN);
  });

  it("rejects claim when response request_id mismatches caller", async () => {
    const deps = makeDeps({
      claimAuthExecution: vi.fn(async () =>
        claimSuccess({ request_id: "99999999-9999-4999-8999-999999999999" })
      ),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "claim_invariant_failed" });
    expect(deps.getUserById).not.toHaveBeenCalled();
  });

  it("rejects claim when response attempt_id mismatches caller", async () => {
    const deps = makeDeps({
      claimAuthExecution: vi.fn(async () =>
        claimSuccess({ attempt_id: "99999999-9999-4999-8999-999999999999" })
      ),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "claim_invariant_failed" });
    expect(deps.getUserById).not.toHaveBeenCalled();
  });

  it("rejects malformed target_user_id from claim", async () => {
    const deps = makeDeps({
      claimAuthExecution: vi.fn(async () =>
        claimSuccess({ target_user_id: "not-a-uuid" })
      ),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "claim_invariant_failed" });
    expect(deps.getUserById).not.toHaveBeenCalled();
  });

  it("rejects claim missing commit token without Auth calls", async () => {
    const deps = makeDeps({
      claimAuthExecution: vi.fn(async () => ({
        ...claimSuccess(),
        delete_commit_token: undefined,
      })),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "claim_invariant_failed" });
    expect(deps.getUserById).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects expired commit authority on already_claimed without Auth calls", async () => {
    const deps = makeDeps({
      claimAuthExecution: vi.fn(async () =>
        claimSuccess({
          code: "already_claimed",
          delete_commit_expires_at: "2020-01-01T00:00:00.000Z",
          claim_lease_expires_at: "2020-01-01T00:00:00.000Z",
        })
      ),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "claim_invariant_failed" });
    expect(deps.getUserById).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("delete success with postcheck still present fails without completion", async () => {
    const deps = makeDeps({
      getUserById: vi.fn(async () => ({
        data: { user: { id: TARGET_USER_ID } },
        error: null,
      })),
    });
    const result = await run(deps);
    expect(result).toEqual({ ok: false, code: "auth_verification_failed" });
    expect(deps.completeAuthExecution).not.toHaveBeenCalled();
  });

  it("uses hard-delete constant false for deleteUser", async () => {
    expect(ACCOUNT_DELETION_AUTH_HARD_DELETE).toBe(false);
    const deps = makeDeps({
      getUserById: vi
        .fn()
        .mockResolvedValueOnce({
          data: { user: { id: TARGET_USER_ID } },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: { status: 404, code: "user_not_found" },
        }),
    });
    await run(deps);
    expect(deps.deleteUser).toHaveBeenCalledWith(
      TARGET_USER_ID,
      ACCOUNT_DELETION_AUTH_HARD_DELETE
    );
    expect(deps.deleteUser).toHaveBeenCalledWith(TARGET_USER_ID, false);
  });

  it("maps claim_conflict to auth_claim_in_progress", async () => {
    const deps = makeDeps({
      claimAuthExecution: vi.fn(async () => ({
        ok: false,
        code: "claim_conflict",
      })),
    });
    const result = await run(deps);
    expect(result).toEqual({
      ok: false,
      code: "auth_claim_in_progress",
      retryable: true,
    });
    expect(deps.getUserById).not.toHaveBeenCalled();
  });

  it("does not expose provider error payloads in failure results", async () => {
    const deps = makeDeps({
      getUserById: vi.fn(async () => ({
        data: { user: null },
        error: {
          status: 503,
          code: "unexpected_failure",
          message: "raw provider secret",
        },
      })),
    });
    const result = await run(deps);
    expect(result).toMatchObject({
      ok: false,
      code: "auth_precheck_failed",
      retryable: true,
    });
    expect(JSON.stringify(result)).not.toContain("raw provider secret");
  });
});

describe("classifyAuthAdminGetUserByIdResponse", () => {
  it("treats 404 and user_not_found as authoritative absence", () => {
    expect(
      classifyAuthAdminGetUserByIdResponse(
        { user: null },
        { status: 404, code: "user_not_found" }
      ).status
    ).toBe("absent");
    expect(
      classifyAuthAdminGetUserByIdResponse(
        { user: null },
        { code: "user_not_found" }
      ).status
    ).toBe("absent");
    expect(isAuthAdminUserNotFoundError({ status: 404 })).toBe(true);
  });

  it("treats other 4xx as non-retryable provider errors", () => {
    const result = classifyAuthAdminGetUserByIdResponse(
      { user: null },
      { status: 400, code: "validation_failed" }
    );
    expect(result).toEqual({ status: "provider_error", retryable: false });
  });

  it("treats 5xx as retryable provider errors", () => {
    expect(
      classifyAuthAdminGetUserByIdResponse(
        { user: null },
        { status: 503, code: "unexpected_failure" }
      )
    ).toEqual({ status: "provider_error", retryable: true });
  });

  it("treats network-style errors without status as retryable", () => {
    expect(
      classifyAuthAdminGetUserByIdResponse(
        { user: null },
        { message: "fetch failed" }
      )
    ).toEqual({ status: "provider_error", retryable: true });
  });

  it("does not treat error=null user=null as absence", () => {
    expect(
      classifyAuthAdminGetUserByIdResponse({ user: null }, null)
    ).toEqual({ status: "provider_error", retryable: true });
  });

  it("treats malformed null data as retryable provider error", () => {
    expect(classifyAuthAdminGetUserByIdResponse(null, null)).toEqual({
      status: "provider_error",
      retryable: true,
    });
  });

  it("treats populated user as present", () => {
    expect(
      classifyAuthAdminGetUserByIdResponse({ user: { id: "x" } }, null)
    ).toEqual({ status: "present" });
  });
});
