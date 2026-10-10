import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runAccountDeletionStorageStageTick } from "./accountDeletionStorageStageRunner";
import { ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE } from "./accountDeletionStorageStageRunnerPolicy";

const REQUEST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ATTEMPT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type RpcHandler = (name: string, args: Record<string, unknown>) => unknown;

function buildMockClient(options: {
  stage?: string;
  rpc?: RpcHandler;
  actionableIds?: string[];
}) {
  const stage = options.stage ?? "database_completed";
  const rpcImpl =
    options.rpc ??
    ((name: string) => {
      if (name === "account_deletion_storage_execution_progress_snapshot") {
        return {
          ok: true,
          counts: {
            total: 0,
            pending: 0,
            failed_retryable: 0,
            deleting: 0,
            deleted: 0,
            missing: 0,
            preserved: 0,
            deferred_profile: 0,
            blocked: 0,
            blocked_on_hold: 0,
            failed_terminal: 0,
          },
        };
      }
      if (
        name === "initialize_account_deletion_storage_execution_results" ||
        name === "advance_account_deletion_attempt_to_storage" ||
        name === "advance_account_deletion_attempt_to_storage_completed" ||
        name === "account_deletion_storage_execution_refresh_hold_eligibility"
      ) {
        return { ok: true, code: "advanced" };
      }
      return { ok: true };
    });

  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => ({
      data: rpcImpl(name, args),
      error: null,
    })),
    from: vi.fn((table: string) => {
      if (table === "account_deletion_execution_attempts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: ATTEMPT,
                  deletion_request_id: REQUEST,
                  status: "active",
                  stage,
                  storage_manifest_status: "finalized",
                  target_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "account_deletion_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: REQUEST,
                  status: "deletion_in_progress",
                  user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "account_deletion_storage_execution_results") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  order: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(async (n: number) => ({
                        data: (options.actionableIds ?? [])
                          .slice(0, n)
                          .map((id) => ({
                            id,
                            object_path: `p/${id.slice(0, 8)}.mp4`,
                          })),
                        error: null,
                      })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("accountDeletionStorageStageRunner", () => {
  it("1: database_completed → init + advance to storage on tick", async () => {
    const client = buildMockClient({ stage: "database_completed" });
    const result = await runAccountDeletionStorageStageTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps: {
        serviceRoleClient: client as never,
        verifyRunnerReadiness: async () => true,
        isPhysicalStorageExecutionEnabled: () => false,
      },
    });
    expect(result.code).toBe("storage_completed");
    expect(client.rpc).toHaveBeenCalledWith(
      "initialize_account_deletion_storage_execution_results",
      expect.any(Object)
    );
    expect(client.rpc).toHaveBeenCalledWith(
      "advance_account_deletion_attempt_to_storage",
      expect.any(Object)
    );
  });

  it("2: resume at storage skips init/advance-in", async () => {
    const client = buildMockClient({ stage: "storage" });
    await runAccountDeletionStorageStageTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps: {
        serviceRoleClient: client as never,
        verifyRunnerReadiness: async () => true,
        isPhysicalStorageExecutionEnabled: () => false,
      },
    });
    expect(client.rpc).not.toHaveBeenCalledWith(
      "initialize_account_deletion_storage_execution_results",
      expect.any(Object)
    );
    expect(client.rpc).not.toHaveBeenCalledWith(
      "advance_account_deletion_attempt_to_storage",
      expect.any(Object)
    );
  });

  it("3: already storage_completed → already_completed", async () => {
    const client = buildMockClient({ stage: "storage_completed" });
    const result = await runAccountDeletionStorageStageTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps: {
        serviceRoleClient: client as never,
        verifyRunnerReadiness: async () => true,
      },
    });
    expect(result).toMatchObject({ ok: true, code: "already_completed" });
  });

  it("4: invalid stage rejected", async () => {
    const client = buildMockClient({ stage: "inventory" });
    const result = await runAccountDeletionStorageStageTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps: {
        serviceRoleClient: client as never,
        verifyRunnerReadiness: async () => true,
      },
    });
    expect(result.code).toBe("precondition_failed");
  });

  it("5: flags OFF + pending work → disabled", async () => {
    const client = buildMockClient({
      stage: "storage",
      rpc: (name) => {
        if (name === "account_deletion_storage_execution_progress_snapshot") {
          return {
            ok: true,
            counts: {
              total: 1,
              pending: 1,
              failed_retryable: 0,
              deleting: 0,
              deleted: 0,
              missing: 0,
              preserved: 0,
              deferred_profile: 0,
              blocked: 0,
              blocked_on_hold: 0,
              failed_terminal: 0,
            },
          };
        }
        return { ok: true };
      },
    });
    const execute = vi.fn();
    const result = await runAccountDeletionStorageStageTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps: {
        serviceRoleClient: client as never,
        verifyRunnerReadiness: async () => true,
        isPhysicalStorageExecutionEnabled: () => false,
        executeStorageObject: execute,
      },
    });
    expect(result.code).toBe("disabled");
    expect(execute).not.toHaveBeenCalled();
  });

  it("7-8: pending and failed_retryable selected when flags ON", async () => {
    const execute = vi.fn(async () => ({ ok: true, code: "deleted", executionState: "deleted" }));
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    let snapshotCalls = 0;
    const client = buildMockClient({
      stage: "storage",
      actionableIds: ids,
      rpc: (name) => {
        if (name === "account_deletion_storage_execution_progress_snapshot") {
          snapshotCalls += 1;
          if (snapshotCalls === 1) {
            return {
              ok: true,
              counts: {
                total: 2,
                pending: 1,
                failed_retryable: 1,
                deleting: 0,
                deleted: 0,
                missing: 0,
                preserved: 0,
                deferred_profile: 0,
                blocked: 0,
                blocked_on_hold: 0,
                failed_terminal: 0,
              },
            };
          }
          return {
            ok: true,
            counts: {
              total: 2,
              pending: 0,
              failed_retryable: 0,
              deleting: 2,
              deleted: 0,
              missing: 0,
              preserved: 0,
              deferred_profile: 0,
              blocked: 0,
              blocked_on_hold: 0,
              failed_terminal: 0,
            },
          };
        }
        if (name === "advance_account_deletion_attempt_to_storage_completed") {
          return { ok: false, code: "storage_execution_not_terminal" };
        }
        return { ok: true };
      },
    });

    const result = await runAccountDeletionStorageStageTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps: {
        serviceRoleClient: client as never,
        verifyRunnerReadiness: async () => true,
        isPhysicalStorageExecutionEnabled: () => true,
        executeStorageObject: execute,
        batchSize: 50,
      },
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0]).toEqual({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      resultId: ids[0],
    });
    expect(result.code).toBe("in_progress");
  });

  it("9: deleting returns in_progress without selecting deleting rows", async () => {
    const execute = vi.fn();
    const client = buildMockClient({
      stage: "storage",
      rpc: (name) => {
        if (name === "account_deletion_storage_execution_progress_snapshot") {
          return {
            ok: true,
            counts: {
              total: 1,
              pending: 0,
              failed_retryable: 0,
              deleting: 1,
              deleted: 0,
              missing: 0,
              preserved: 0,
              deferred_profile: 0,
              blocked: 0,
              blocked_on_hold: 0,
              failed_terminal: 0,
            },
          };
        }
        return { ok: true };
      },
    });
    const result = await runAccountDeletionStorageStageTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps: {
        serviceRoleClient: client as never,
        verifyRunnerReadiness: async () => true,
        isPhysicalStorageExecutionEnabled: () => true,
        executeStorageObject: execute,
      },
    });
    expect(result.code).toBe("in_progress");
    expect(execute).not.toHaveBeenCalled();
  });

  it("10-12: hard blockers prevent execution", async () => {
    const execute = vi.fn();
    for (const key of ["blocked", "blocked_on_hold", "failed_terminal"] as const) {
      const counts = {
        total: 1,
        pending: 0,
        failed_retryable: 0,
        deleting: 0,
        deleted: 0,
        missing: 0,
        preserved: 0,
        deferred_profile: 0,
        blocked: 0,
        blocked_on_hold: 0,
        failed_terminal: 0,
      };
      counts[key] = 1;
      const client = buildMockClient({
        stage: "storage",
        rpc: (name) =>
          name === "account_deletion_storage_execution_progress_snapshot"
            ? { ok: true, counts }
            : { ok: true },
      });
      const result = await runAccountDeletionStorageStageTick({
        requestId: REQUEST,
        attemptId: ATTEMPT,
        deps: {
          serviceRoleClient: client as never,
          verifyRunnerReadiness: async () => true,
          isPhysicalStorageExecutionEnabled: () => true,
          executeStorageObject: execute,
        },
      });
      expect(result.code).toBe("blocked");
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it("15: respects batch limit (one tick)", async () => {
    const execute = vi.fn(async () => ({ ok: true, code: "deleted", executionState: "deleted" }));
    const ids = Array.from({ length: 3 }, (_, i) =>
      `${i}1111111-1111-4111-8111-111111111111`.slice(0, 36)
    );
    const client = buildMockClient({
      stage: "storage",
      actionableIds: ids,
      rpc: (name) => {
        if (name === "account_deletion_storage_execution_progress_snapshot") {
          return {
            ok: true,
            counts: {
              total: 3,
              pending: 3,
              failed_retryable: 0,
              deleting: 0,
              deleted: 0,
              missing: 0,
              preserved: 0,
              deferred_profile: 0,
              blocked: 0,
              blocked_on_hold: 0,
              failed_terminal: 0,
            },
          };
        }
        return { ok: true, code: "storage_execution_not_terminal" };
      },
    });

    await runAccountDeletionStorageStageTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps: {
        serviceRoleClient: client as never,
        verifyRunnerReadiness: async () => true,
        isPhysicalStorageExecutionEnabled: () => true,
        executeStorageObject: execute,
        batchSize: 2,
      },
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("21: completion uses DB RPC not app-only snapshot", async () => {
    const client = buildMockClient({ stage: "storage" });
    await runAccountDeletionStorageStageTick({
      requestId: REQUEST,
      attemptId: ATTEMPT,
      deps: {
        serviceRoleClient: client as never,
        verifyRunnerReadiness: async () => true,
        isPhysicalStorageExecutionEnabled: () => false,
      },
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "advance_account_deletion_attempt_to_storage_completed",
      expect.objectContaining({
        p_request_id: REQUEST,
        p_attempt_id: ATTEMPT,
      })
    );
  });

  it("R-SURFACE: runner module not referenced by app/orchestrator paths", () => {
    const runnerPath = path.join(
      import.meta.dirname,
      "accountDeletionStorageStageRunner.ts"
    );
    const source = readFileSync(runnerPath, "utf8");
    expect(source).toContain('import "server-only"');
    expect(source).not.toMatch(/from\s+["']@\/app\//);
    expect(source).not.toContain("accountDeletionExecutionOrchestrator");
    expect(ACCOUNT_DELETION_STORAGE_STAGE_RUNNER_BATCH_SIZE).toBe(50);
  });
});
