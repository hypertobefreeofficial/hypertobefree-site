import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AccountDeletionProfileMediaObjectExecutorResult } from "./accountDeletionProfileMediaObjectExecutor";
import {
  ACCOUNT_DELETION_PROFILE_MEDIA_STAGE_RUNNER_BATCH_SIZE,
  PROFILE_MEDIA_CLAIM_AUTHORIZE_CONTINUE_DETAILS,
  PROFILE_MEDIA_CLAIM_AUTHORIZE_STOP_DETAILS,
  clampProfileMediaRunnerBatchSize,
  mapProfileMediaStatusFromProgress,
  parseAccountDeletionProfileMediaSelectorResult,
  parseAccountDeletionReadinessProbe,
  shouldContinueProfileMediaExecutorResult,
} from "./accountDeletionProfileMediaStageRunnerPolicy";
import {
  isAccountDeletionPhysicalProfileMediaExecutionEnabled,
  type AccountDeletionProfileMediaProgress,
} from "./accountDeletionProfileMediaPolicy";
import { runAccountDeletionProfileMediaTick } from "./accountDeletionProfileMediaStageRunner";
import { profileMediaExecutionDisabledCode } from "./accountDeletionProfileMediaStageRunnerPolicy";

const REQUEST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ATTEMPT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const ID4 = "44444444-4444-4444-8444-444444444444";
const ID5 = "55555555-5555-4555-8555-555555555555";
const ID6 = "66666666-6666-4666-8666-666666666666";

function progress(
  overrides: Partial<AccountDeletionProfileMediaProgress> = {}
): AccountDeletionProfileMediaProgress {
  return {
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
    ...overrides,
  };
}

function snapshotPayload(p: AccountDeletionProfileMediaProgress) {
  return {
    ok: true,
    total: p.total,
    result_count: p.resultCount,
    deferred_profile: p.deferredProfile,
    deleting: p.deleting,
    deleted: p.deleted,
    missing: p.missing,
    failed_retryable: p.failedRetryable,
    failed_terminal: p.failedTerminal,
    active_hold_count: p.activeHoldCount,
    actionable_count: p.actionableCount,
    mismatch_count: p.mismatchCount,
    completion_blocked: p.completionBlocked,
  };
}

type MockOptions = {
  readiness?: boolean;
  requestStatus?: string;
  attempt?: Record<string, unknown> | null;
  request?: Record<string, unknown> | null;
  progressSequence?: AccountDeletionProfileMediaProgress[];
  selector?: unknown;
  selectorError?: boolean;
  readinessError?: boolean;
  snapshotErrorAt?: number;
  env?: NodeJS.ProcessEnv;
  executeProfileMediaObject?: ReturnType<typeof vi.fn>;
};

function buildDeps(options: MockOptions = {}) {
  let snapshotIndex = 0;
  const progressSeq = options.progressSequence ?? [progress()];
  const executeProfileMediaObject =
    options.executeProfileMediaObject ??
    vi.fn(async (): Promise<AccountDeletionProfileMediaObjectExecutorResult> => ({
      ok: true,
      code: "deleted",
      executionState: "deleted",
    }));

  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === "verify_account_deletion_profile_media_runner_ready") {
      if (options.readinessError) {
        return { data: null, error: { message: "rpc failed" } };
      }
      return {
        data: { ready: options.readiness ?? true },
        error: null,
      };
    }
    if (name === "account_deletion_profile_media_progress_snapshot") {
      if (
        options.snapshotErrorAt !== undefined &&
        snapshotIndex >= options.snapshotErrorAt
      ) {
        return { data: null, error: { message: "snapshot failed" } };
      }
      const p = progressSeq[Math.min(snapshotIndex, progressSeq.length - 1)]!;
      snapshotIndex += 1;
      return { data: snapshotPayload(p), error: null };
    }
    if (
      name === "select_account_deletion_profile_media_actionable_result_ids"
    ) {
      if (options.selectorError) {
        return { data: null, error: { message: "selector transport" } };
      }
      return { data: options.selector, error: null };
    }
    return { data: null, error: { message: "unexpected rpc" } };
  });

  const supabase = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "account_deletion_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data:
                  options.request === null
                    ? null
                    : {
                        id: REQUEST,
                        status: options.requestStatus ?? "deletion_in_progress",
                        user_id: TARGET,
                        ...options.request,
                      },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "account_deletion_execution_attempts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data:
                  options.attempt === null
                    ? null
                    : {
                        id: ATTEMPT,
                        deletion_request_id: REQUEST,
                        target_user_id: TARGET,
                        status: "active",
                        stage: "profile",
                        storage_manifest_status: "finalized",
                        ...options.attempt,
                      },
                error: null,
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };

  const env: NodeJS.ProcessEnv = {
    HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
    HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
    HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
    ...options.env,
  };

  const deps = {
    serviceRoleClient: supabase as never,
    verifyRunnerReadiness: async () =>
      options.readinessError ? false : (options.readiness ?? true),
    isPhysicalProfileMediaExecutionEnabled: () =>
      isAccountDeletionPhysicalProfileMediaExecutionEnabled(env),
    executeProfileMediaObject,
    batchSize: options.env?.BATCH_SIZE
      ? Number(options.env.BATCH_SIZE)
      : undefined,
  };

  return { deps, executeProfileMediaObject, env, rpc };
}

async function runWithMocks(options: MockOptions = {}) {
  const { deps, env, rpc, executeProfileMediaObject } = buildDeps(options);
  const prior = {
    g: process.env.HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED,
    p: process.env.HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED,
    s: process.env.HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED,
  };
  process.env.HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED =
    env.HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED;
  process.env.HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED =
    env.HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED;
  process.env.HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED =
    env.HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED;
  try {
    const result = await runAccountDeletionProfileMediaTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps,
    });
    return { result, rpc, executeProfileMediaObject };
  } finally {
    process.env.HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED = prior.g;
    process.env.HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED = prior.p;
    process.env.HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED = prior.s;
  }
}

function selected(ids: string[]) {
  return { ok: true, code: "selected", result_ids: ids, selected_count: ids.length };
}

describe("accountDeletionProfileMediaStageRunnerPolicy", () => {
  it("readiness probe accepts ready true only", () => {
    expect(parseAccountDeletionReadinessProbe({ ready: true })).toBe(true);
    expect(parseAccountDeletionReadinessProbe({ ready: false })).toBe(false);
    expect(parseAccountDeletionReadinessProbe(null)).toBe(false);
  });

  it("clamps batch size to 5", () => {
    expect(clampProfileMediaRunnerBatchSize(undefined)).toBe(5);
    expect(clampProfileMediaRunnerBatchSize(99)).toBe(5);
    expect(clampProfileMediaRunnerBatchSize(0)).toBe(1);
  });

  it("maps progress precedence including zero-avatar completion", () => {
    expect(
      mapProfileMediaStatusFromProgress(
        progress({ total: 0, resultCount: 0, actionableCount: 0, completionBlocked: false })
      )
    ).toBe("profile_media_completed");
    expect(
      mapProfileMediaStatusFromProgress(progress({ mismatchCount: 1 }))
    ).toBe("profile_media_precondition_failed");
    expect(
      mapProfileMediaStatusFromProgress(progress({ failedTerminal: 1, actionableCount: 0 }))
    ).toBe("profile_media_blocked");
    expect(
      mapProfileMediaStatusFromProgress(progress({ activeHoldCount: 1, actionableCount: 0 }))
    ).toBe("profile_media_blocked");
    expect(
      mapProfileMediaStatusFromProgress(progress({ deleting: 1, actionableCount: 0 }))
    ).toBe("profile_media_in_progress");
  });

  it("selector parser fail-closed", () => {
    expect(parseAccountDeletionProfileMediaSelectorResult(null)).toEqual({ ok: false });
    expect(
      parseAccountDeletionProfileMediaSelectorResult({
        ok: false,
        code: "denied",
      })
    ).toEqual({ ok: false });
    expect(
      parseAccountDeletionProfileMediaSelectorResult({
        ok: true,
        code: "selected",
        result_ids: [ID1],
        selected_count: 2,
      })
    ).toEqual({ ok: false });
    expect(
      parseAccountDeletionProfileMediaSelectorResult({
        ok: true,
        code: "selected",
        result_ids: [ID1, ID1],
        selected_count: 2,
      })
    ).toEqual({ ok: false });
    expect(
      parseAccountDeletionProfileMediaSelectorResult({
        ok: true,
        code: "selected",
        result_ids: [ID1, ID2, ID3, ID4, ID5, ID6],
        selected_count: 6,
      })
    ).toEqual({ ok: false });
    expect(
      parseAccountDeletionProfileMediaSelectorResult(selected([ID1, ID2]))
    ).toEqual({ ok: true, resultIds: [ID1, ID2] });
  });

  it("classifies executor continue and stop results", () => {
    for (const code of ["deleted", "missing", "already_terminal"] as const) {
      expect(
        shouldContinueProfileMediaExecutorResult({
          ok: true,
          code,
          executionState: code,
        })
      ).toBe(true);
    }
    expect(
      shouldContinueProfileMediaExecutorResult({
        ok: false,
        code: "delete_authority_expired",
        retryable: true,
      })
    ).toBe(true);
    expect(
      shouldContinueProfileMediaExecutorResult({
        ok: false,
        code: "delete_authority_expired",
        retryable: false,
      })
    ).toBe(false);
    expect(
      shouldContinueProfileMediaExecutorResult({
        ok: false,
        code: "delete_authority_expired",
      })
    ).toBe(false);
    expect(
      shouldContinueProfileMediaExecutorResult({
        ok: false,
        code: "execution_disabled",
      })
    ).toBe(false);
    for (const code of [
      "storage_existence_check_failed",
      "storage_postdelete_verification_failed",
      "storage_remove_failed",
    ] as const) {
      expect(
        shouldContinueProfileMediaExecutorResult({
          ok: false,
          code,
          retryable: true,
        })
      ).toBe(true);
      expect(
        shouldContinueProfileMediaExecutorResult({
          ok: false,
          code,
          retryable: false,
        })
      ).toBe(false);
      expect(
        shouldContinueProfileMediaExecutorResult({
          ok: false,
          code,
        })
      ).toBe(false);
    }
    for (const detail of PROFILE_MEDIA_CLAIM_AUTHORIZE_CONTINUE_DETAILS) {
      expect(
        shouldContinueProfileMediaExecutorResult({
          ok: false,
          code: "claim_failed",
          detail,
        })
      ).toBe(true);
    }
    for (const detail of PROFILE_MEDIA_CLAIM_AUTHORIZE_STOP_DETAILS) {
      expect(
        shouldContinueProfileMediaExecutorResult({
          ok: false,
          code: "authorize_failed",
          detail,
        })
      ).toBe(false);
    }
    expect(
      shouldContinueProfileMediaExecutorResult({
        ok: false,
        code: "claim_failed",
        detail: "unknown_detail",
      })
    ).toBe(false);
  });
});

describe("runAccountDeletionProfileMediaTick", () => {
  it("rejects invalid UUID inputs", async () => {
    const { deps } = buildDeps();
    const result = await runAccountDeletionProfileMediaTick({
      requestId: "bad",
      attemptId: ATTEMPT,
      deps,
    });
    expect(result).toEqual({ ok: false, code: "precondition_failed" });
  });

  it("requires runner readiness", async () => {
    const { result, rpc } = await runWithMocks({ readiness: false });
    expect(result.code).toBe("precondition_failed");
    expect(rpc).not.toHaveBeenCalledWith(
      "select_account_deletion_profile_media_actionable_result_ids",
      expect.anything()
    );
  });

  it("zero-avatar completion skips selector, flags, and executor", async () => {
    const { result, executeProfileMediaObject, rpc } = await runWithMocks({
      progressSequence: [
        progress({
          total: 0,
          resultCount: 0,
          deferredProfile: 0,
          actionableCount: 0,
          completionBlocked: false,
        }),
      ],
      env: { HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "false" },
    });
    expect(result).toMatchObject({
      ok: true,
      code: "profile_media_completed",
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "select_account_deletion_profile_media_actionable_result_ids",
      expect.anything()
    );
    expect(executeProfileMediaObject).not.toHaveBeenCalled();
  });

  it.each([
    ["mismatch", progress({ mismatchCount: 1, actionableCount: 0 })],
    ["failed terminal", progress({ failedTerminal: 1, actionableCount: 0 })],
    ["active hold", progress({ activeHoldCount: 1, actionableCount: 0 })],
  ])("initial blocker %s avoids selector", async (_label, snap) => {
    const { rpc } = await runWithMocks({ progressSequence: [snap] });
    expect(rpc).not.toHaveBeenCalledWith(
      "select_account_deletion_profile_media_actionable_result_ids",
      expect.anything()
    );
  });

  it.each([
    ["global", { HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "false" }, "execution_disabled"],
    [
      "profile",
      { HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "false" },
      "profile_execution_disabled",
    ],
    [
      "storage",
      { HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "false" },
      "profile_storage_execution_disabled",
    ],
  ])("%s flag off returns disabled code", async (_label, envPatch, code) => {
    const { result, rpc } = await runWithMocks({
      env: {
        HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
        ...envPatch,
      },
    });
    expect(result.code).toBe(code);
    expect(rpc).not.toHaveBeenCalledWith(
      "select_account_deletion_profile_media_actionable_result_ids",
      expect.anything()
    );
  });

  it("exact triple true enables selector path", async () => {
    const { rpc } = await runWithMocks({
      selector: selected([ID1]),
      progressSequence: [progress(), progress()],
      env: {
        HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
      },
    });
    expect(rpc).toHaveBeenCalledWith(
      "select_account_deletion_profile_media_actionable_result_ids",
      expect.objectContaining({ p_limit: 5 })
    );
  });

  it.each(["TRUE", "1", " yes", "true "])(
    "rejects non-exact env true %j",
    async (value) => {
      const { result } = await runWithMocks({
        env: {
          HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: value,
          HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
          HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
        },
      });
      expect(result.code).toBe("execution_disabled");
    }
  );

  it("deleting-only state returns in progress without selector", async () => {
    const { result, rpc } = await runWithMocks({
      progressSequence: [
        progress({ actionableCount: 0, deleting: 1, deferredProfile: 0 }),
      ],
    });
    expect(result.code).toBe("profile_media_in_progress");
    expect(rpc).not.toHaveBeenCalledWith(
      "select_account_deletion_profile_media_actionable_result_ids",
      expect.anything()
    );
  });

  it.each([
    ["wrong request status", { requestStatus: "approved" }],
    ["missing attempt", { attempt: null }],
    ["wrong stage", { attempt: { stage: "storage" } }],
    ["manifest not finalized", { attempt: { storage_manifest_status: "pending" } }],
    ["target mismatch", { request: { user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } }],
  ])("lifecycle %s → precondition_failed", async (_label, patch) => {
    const { result } = await runWithMocks(patch);
    expect(result.code).toBe("precondition_failed");
  });

  it("calls selector once with limit 5 and executes sequentially", async () => {
    const { result, executeProfileMediaObject, rpc } = await runWithMocks({
      selector: selected([ID1, ID2, ID3]),
      progressSequence: [progress(), progress()],
    });
    expect(rpc).toHaveBeenCalledWith(
      "select_account_deletion_profile_media_actionable_result_ids",
      {
        p_request_id: REQUEST,
        p_attempt_id: ATTEMPT,
        p_limit: ACCOUNT_DELETION_PROFILE_MEDIA_STAGE_RUNNER_BATCH_SIZE,
      }
    );
    expect(executeProfileMediaObject).toHaveBeenCalledTimes(3);
    expect(executeProfileMediaObject.mock.calls[0]?.[0].resultId).toBe(ID1);
    expect(executeProfileMediaObject.mock.calls[1]?.[0].resultId).toBe(ID2);
    expect(result.selectedCount).toBe(3);
    expect(result.processedCount).toBe(3);
    expect(JSON.stringify(result)).not.toContain(ID1);
  });

  it("never calls selector twice in one tick", async () => {
    const { rpc } = await runWithMocks({
      selector: selected([ID1, ID2, ID3, ID4, ID5]),
      progressSequence: [progress(), progress()],
    });
    expect(
      rpc.mock.calls.filter(
        (c) =>
          c[0] === "select_account_deletion_profile_media_actionable_result_ids"
      )
    ).toHaveLength(1);
  });

  it("caps executor invocations at five", async () => {
    const executeProfileMediaObject = vi.fn(async () => ({
      ok: true,
      code: "already_terminal",
      executionState: "deleted",
    })) as MockOptions["executeProfileMediaObject"];
    const { executeProfileMediaObject: exec } = await runWithMocks({
      executeProfileMediaObject,
      selector: selected([ID1, ID2, ID3, ID4, ID5]),
      progressSequence: [progress(), progress()],
    });
    expect(exec).toHaveBeenCalledTimes(5);
    expect(executeProfileMediaObject).toHaveBeenCalledTimes(5);
  });

  it("zero selected IDs still resnapshots once", async () => {
    const { result, executeProfileMediaObject, rpc } = await runWithMocks({
      selector: selected([]),
      progressSequence: [
        progress({ actionableCount: 2 }),
        progress({ actionableCount: 0, deleting: 1 }),
      ],
    });
    expect(executeProfileMediaObject).not.toHaveBeenCalled();
    expect(
      rpc.mock.calls.filter(
        (c) => c[0] === "account_deletion_profile_media_progress_snapshot"
      )
    ).toHaveLength(2);
    expect(result.code).toBe("profile_media_in_progress");
  });

  it("stops batch on profile_media_reference_active", async () => {
    const executeProfileMediaObject = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "authorize_failed",
        detail: "profile_media_reference_active",
      } satisfies AccountDeletionProfileMediaObjectExecutorResult);
    const { result } = await runWithMocks({
      executeProfileMediaObject,
      selector: selected([ID1, ID2]),
      progressSequence: [progress(), progress({ activeHoldCount: 0 })],
    });
    expect(executeProfileMediaObject).toHaveBeenCalledTimes(1);
    expect(result.code).toBe("profile_media_blocked");
  });

  it("preserves mid-batch execution_disabled from executor", async () => {
    const executeProfileMediaObject = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "execution_disabled",
      } satisfies AccountDeletionProfileMediaObjectExecutorResult);
    const { result } = await runWithMocks({
      executeProfileMediaObject,
      selector: selected([ID1, ID2]),
      progressSequence: [progress(), progress()],
    });
    expect(result.code).toBe("execution_disabled");
    expect(executeProfileMediaObject).toHaveBeenCalledTimes(1);
  });

  it.each([
    "storage_existence_check_failed",
    "storage_postdelete_verification_failed",
    "storage_remove_failed",
  ] as const)(
    "continues batch for %s when retryable is true",
    async (code) => {
      const executeProfileMediaObject = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          code,
          retryable: true,
        } satisfies AccountDeletionProfileMediaObjectExecutorResult)
        .mockResolvedValueOnce({
          ok: true,
          code: "deleted",
          executionState: "deleted",
        });
      const { result, rpc } = await runWithMocks({
        executeProfileMediaObject,
        selector: selected([ID1, ID2]),
        progressSequence: [progress(), progress()],
      });
      expect(executeProfileMediaObject).toHaveBeenCalledTimes(2);
      expect(
        rpc.mock.calls.filter(
          (c) => c[0] === "account_deletion_profile_media_progress_snapshot"
        )
      ).toHaveLength(2);
      expect(JSON.stringify(result)).not.toContain(ID2);
      expect(result).not.toHaveProperty("detail");
    }
  );

  it.each([
    "storage_existence_check_failed",
    "storage_postdelete_verification_failed",
    "storage_remove_failed",
  ] as const)("stops batch for %s when retryable is false", async (code) => {
    const executeProfileMediaObject = vi.fn().mockResolvedValueOnce({
      ok: false,
      code,
      retryable: false,
    } satisfies AccountDeletionProfileMediaObjectExecutorResult);
    const { result, rpc } = await runWithMocks({
      executeProfileMediaObject,
      selector: selected([ID1, ID2, ID3]),
      progressSequence: [progress(), progress()],
    });
    expect(executeProfileMediaObject).toHaveBeenCalledTimes(1);
    expect(
      rpc.mock.calls.filter(
        (c) => c[0] === "account_deletion_profile_media_progress_snapshot"
      )
    ).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain(ID2);
    expect(JSON.stringify(result)).not.toContain(ID3);
    expect(result).not.toHaveProperty("detail");
  });

  it.each([
    "storage_existence_check_failed",
    "storage_postdelete_verification_failed",
    "storage_remove_failed",
  ] as const)(
    "stops batch for %s when retryable is omitted",
    async (code) => {
      const executeProfileMediaObject = vi.fn().mockResolvedValueOnce({
        ok: false,
        code,
      } satisfies AccountDeletionProfileMediaObjectExecutorResult);
      const { result, rpc } = await runWithMocks({
        executeProfileMediaObject,
        selector: selected([ID1, ID2]),
        progressSequence: [progress(), progress()],
      });
      expect(executeProfileMediaObject).toHaveBeenCalledTimes(1);
      expect(
        rpc.mock.calls.filter(
          (c) => c[0] === "account_deletion_profile_media_progress_snapshot"
        )
      ).toHaveLength(2);
      expect(JSON.stringify(result)).not.toContain(ID2);
      expect(result).not.toHaveProperty("detail");
    }
  );

  it.each([
    ["execution_disabled", "execution_disabled"],
    ["profile_execution_disabled", "profile_execution_disabled"],
    [
      "profile_storage_execution_disabled",
      "profile_storage_execution_disabled",
    ],
  ] as const)(
    "stops batch and returns %s without leaking detail",
    async (_label, code) => {
      const executeProfileMediaObject = vi.fn().mockResolvedValueOnce({
        ok: false,
        code,
      } satisfies AccountDeletionProfileMediaObjectExecutorResult);
      const { result, rpc } = await runWithMocks({
        executeProfileMediaObject,
        selector: selected([ID1, ID2, ID3]),
        progressSequence: [progress(), progress()],
      });
      expect(executeProfileMediaObject).toHaveBeenCalledTimes(1);
      expect(result.code).toBe(code);
      expect(
        rpc.mock.calls.filter(
          (c) => c[0] === "account_deletion_profile_media_progress_snapshot"
        )
      ).toHaveLength(2);
      expect(JSON.stringify(result)).not.toContain(ID2);
      expect(result).not.toHaveProperty("detail");
    }
  );

  it("continues after delete_authority_expired", async () => {
    const executeProfileMediaObject = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "delete_authority_expired",
        retryable: true,
      } satisfies AccountDeletionProfileMediaObjectExecutorResult)
      .mockResolvedValueOnce({
        ok: true,
        code: "deleted",
        executionState: "deleted",
      });
    const { result } = await runWithMocks({
      executeProfileMediaObject,
      selector: selected([ID1, ID2]),
      progressSequence: [progress(), progress()],
    });
    expect(executeProfileMediaObject).toHaveBeenCalledTimes(2);
    expect(result.processedCount).toBe(2);
  });

  it.each([
    ["complete_failed", { ok: false, code: "complete_failed" }],
    ["internal_error", { ok: false, code: "internal_error" }],
    ["invalid_arguments", { ok: false, code: "invalid_arguments" }],
    [
      "claim rpc_error",
      { ok: false, code: "claim_failed", detail: "rpc_error" },
    ],
  ] as const)("stops batch on %s", async (_label, payload) => {
    const executeProfileMediaObject = vi
      .fn()
      .mockResolvedValueOnce(
        payload as AccountDeletionProfileMediaObjectExecutorResult
      );
    await runWithMocks({
      executeProfileMediaObject,
      selector: selected([ID1, ID2]),
      progressSequence: [progress(), progress()],
    });
    expect(executeProfileMediaObject).toHaveBeenCalledTimes(1);
  });

  it("stops batch when executor throws", async () => {
    const executeProfileMediaObject = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"));
    const { result } = await runWithMocks({
      executeProfileMediaObject,
      selector: selected([ID1, ID2]),
      progressSequence: [progress(), progress()],
    });
    expect(executeProfileMediaObject).toHaveBeenCalledTimes(1);
    expect(result.processedCount ?? 0).toBe(0);
  });

  it("malformed selector payload returns precondition_failed", async () => {
    const { result } = await runWithMocks({
      selector: {
        ok: true,
        code: "selected",
        result_ids: ["not-a-uuid"],
        selected_count: 1,
      },
    });
    expect(result.code).toBe("precondition_failed");
  });

  it("selector transport error returns precondition_failed", async () => {
    const { result } = await runWithMocks({ selectorError: true });
    expect(result.code).toBe("precondition_failed");
  });

  it("final snapshot failure returns precondition_failed", async () => {
    const { result } = await runWithMocks({
      selector: selected([ID1]),
      snapshotErrorAt: 1,
    });
    expect(result.code).toBe("precondition_failed");
  });

  it("profileMediaExecutionDisabledCode precedence", () => {
    expect(
      profileMediaExecutionDisabledCode({
        HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "false",
        HTBF_ACCOUNT_DELETION_PROFILE_EXECUTION_ENABLED: "true",
        HTBF_ACCOUNT_DELETION_STORAGE_EXECUTION_ENABLED: "true",
      })
    ).toBe("execution_disabled");
  });

  it("source guards: server-only, bounded, no drain", () => {
    const source = readFileSync(
      "lib/server/accountDeletionProfileMediaStageRunner.ts",
      "utf8"
    );
    expect(source).toContain('import "server-only"');
    expect(source).not.toContain("profile_completed");
    expect(source).not.toMatch(/Promise\.all/);
    expect(source).not.toMatch(/\bwhile\s*\(/);
    expect(source).not.toMatch(/auth\.admin\.deleteUser/);
    expect(source).not.toContain(".remove(");
  });
});
