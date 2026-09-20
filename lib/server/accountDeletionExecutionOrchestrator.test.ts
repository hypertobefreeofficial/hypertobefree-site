import { describe, expect, it, vi } from "vitest";
import {
  runAccountDeletionExecutionOrchestrator,
  type AccountDeletionExecutionOrchestratorDeps,
} from "./accountDeletionExecutionOrchestrator";
import {
  isSchemaExecutionReadyFromLiveProbe,
  parseAccountDeletionSchemaProbePayload,
} from "./accountDeletionSchemaProbe";

const REQUEST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function acquiredContext(stage = "lock_acquired") {
  return {
    ok: true as const,
    code: "acquired" as const,
    context: {
      requestId: REQUEST,
      attemptId: ATTEMPT,
      targetUserId: TARGET,
      attemptStage: stage,
      attemptStatus: "active",
    },
  };
}

function sessionSuccess(code: "sessions_revoked" | "already_sessions_revoked" | "later_stage_reached", stage: string) {
  return { ok: true as const, code, stage };
}

function inventorySuccess() {
  return {
    ok: true as const,
    code: "advanced" as const,
    requestId: REQUEST,
    attemptId: ATTEMPT,
    stage: "inventory",
  };
}

function databaseSuccess(code: "completed" | "already_completed" = "completed") {
  return {
    ok: true as const,
    code,
    requestId: REQUEST,
    attemptId: ATTEMPT,
    targetUserId: TARGET,
    databaseRowsAffected: {},
  };
}

function preflightReady() {
  return {
    ok: true as const,
    code: "preflight_ready" as const,
    requestId: REQUEST,
    targetUserId: TARGET,
  };
}

function createDeps(
  overrides: Partial<AccountDeletionExecutionOrchestratorDeps> = {}
): AccountDeletionExecutionOrchestratorDeps {
  return {
    verifySchemaReadiness: vi.fn(async () => true),
    runPreflight: vi.fn(async () => preflightReady()),
    acquire: vi.fn(async () => acquiredContext()),
    runSessionPhase: vi.fn(async () => sessionSuccess("sessions_revoked", "sessions_revoked")),
    advanceToInventory: vi.fn(async () => inventorySuccess()),
    captureStorageManifest: vi.fn(async () => ({
      ok: true as const,
      code: "finalized",
      requestId: REQUEST,
      attemptId: ATTEMPT,
      targetUserId: TARGET,
      objectCount: 0,
      fingerprint: "a".repeat(64),
      blockedCount: 0,
      deletePrivateCount: 0,
      hasBlockUnresolved: false,
    })),
    executeDatabaseStage: vi.fn(async () => databaseSuccess()),
    ...overrides,
  };
}

describe("runAccountDeletionExecutionOrchestrator", () => {
  it("EO-A: acquisition → sessions → inventory → database_completed", async () => {
    const deps = createDeps();
    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(result).toEqual({
      ok: true,
      code: "database_completed",
      requestId: REQUEST,
      attemptId: ATTEMPT,
      targetUserId: TARGET,
    });
    expect(deps.acquire).toHaveBeenCalledWith({ requestId: REQUEST, initiatedBy: OWNER });
    expect(deps.runSessionPhase).toHaveBeenCalledOnce();
    expect(deps.advanceToInventory).toHaveBeenCalledOnce();
    expect(deps.captureStorageManifest).toHaveBeenCalledOnce();
    expect(deps.executeDatabaseStage).toHaveBeenCalledOnce();
  });

  it("EO-B: already acquired at lock_acquired resumes session phase", async () => {
    const deps = createDeps({
      acquire: vi.fn(async () => ({
        ok: true,
        code: "already_acquired",
        context: {
          requestId: REQUEST,
          attemptId: ATTEMPT,
          targetUserId: TARGET,
          attemptStage: "lock_acquired",
          attemptStatus: "active",
        },
      })),
    });

    await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(deps.runSessionPhase).toHaveBeenCalledOnce();
  });

  it("EO-C/D/E: session resume paths delegate to inventory and 3B.1", async () => {
    const pendingResume = createDeps({
      runSessionPhase: vi.fn(async () => sessionSuccess("sessions_revoked", "sessions_revoked")),
    });
    await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps: pendingResume,
    });
    expect(pendingResume.advanceToInventory).toHaveBeenCalled();

    const revokedResume = createDeps({
      runSessionPhase: vi.fn(async () =>
        sessionSuccess("already_sessions_revoked", "sessions_revoked")
      ),
    });
    await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps: revokedResume,
    });
    expect(revokedResume.advanceToInventory).toHaveBeenCalled();

    const inventoryResume = createDeps({
      runSessionPhase: vi.fn(async () =>
        sessionSuccess("later_stage_reached", "inventory")
      ),
      advanceToInventory: vi.fn(),
    });
    await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps: inventoryResume,
    });
    expect(inventoryResume.advanceToInventory).not.toHaveBeenCalled();
    expect(inventoryResume.captureStorageManifest).toHaveBeenCalledOnce();
    expect(inventoryResume.executeDatabaseStage).toHaveBeenCalled();
  });

  it("EO-F: database_completed idempotent success", async () => {
    const deps = createDeps({
      runSessionPhase: vi.fn(async () =>
        sessionSuccess("later_stage_reached", "database_completed")
      ),
      advanceToInventory: vi.fn(),
      captureStorageManifest: vi.fn(),
      executeDatabaseStage: vi.fn(async () => databaseSuccess("already_completed")),
    });

    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(result).toMatchObject({ ok: true, code: "already_completed" });
    expect(deps.captureStorageManifest).not.toHaveBeenCalled();
    expect(deps.advanceToInventory).not.toHaveBeenCalled();
  });

  it("EO-G: readiness false → no acquisition", async () => {
    const acquire = vi.fn();
    const deps = createDeps({
      verifySchemaReadiness: vi.fn(async () => false),
      acquire,
    });

    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(result).toEqual({ ok: false, code: "schema_not_ready" });
    expect(acquire).not.toHaveBeenCalled();
  });

  it("uses production parser: mixed ready prerequisites → acquisition", async () => {
    const acquire = vi.fn(async () => acquiredContext());
    const mixedReady = isSchemaExecutionReadyFromLiveProbe(
      parseAccountDeletionSchemaProbePayload({
        ready: true,
        prerequisites: [
          { id: "legacy", satisfied: true, detail: "ok" },
          { id: "newer", ready: true, detail: "ok" },
        ],
      })
    );
    expect(mixedReady).toBe(true);

    const deps = createDeps({
      verifySchemaReadiness: vi.fn(async () => mixedReady),
      acquire,
    });

    await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(acquire).toHaveBeenCalled();
  });

  it("uses production parser: failed prerequisite → schema_not_ready", async () => {
    const acquire = vi.fn();
    const notReady = isSchemaExecutionReadyFromLiveProbe(
      parseAccountDeletionSchemaProbePayload({
        ready: true,
        prerequisites: [{ id: "bad", ready: false, detail: "missing rpc" }],
      })
    );
    expect(notReady).toBe(false);

    const deps = createDeps({
      verifySchemaReadiness: vi.fn(async () => notReady),
      acquire,
    });

    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(result).toEqual({ ok: false, code: "schema_not_ready" });
    expect(acquire).not.toHaveBeenCalled();
  });

  it("EO-H: acquisition failure → stop", async () => {
    const deps = createDeps({
      acquire: vi.fn(async () => ({
        ok: false as const,
        code: "request_not_approved" as const,
      })),
    });

    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(result).toEqual({ ok: false, code: "request_not_approved" });
    expect(deps.runSessionPhase).not.toHaveBeenCalled();
  });

  it("EO-I/J: session target / pairing failures stop pipeline", async () => {
    const targetMismatch = createDeps({
      runSessionPhase: vi.fn(async () => ({
        ok: false as const,
        code: "target_mismatch" as const,
      })),
    });
    expect(
      await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST,
        initiatedBy: OWNER,
        deps: targetMismatch,
      })
    ).toMatchObject({ ok: false, code: "target_mismatch" });
    expect(targetMismatch.executeDatabaseStage).not.toHaveBeenCalled();

    const pairingMismatch = createDeps({
      runSessionPhase: vi.fn(async () => ({
        ok: false as const,
        code: "attempt_request_mismatch" as const,
      })),
    });
    expect(
      await runAccountDeletionExecutionOrchestrator({
        requestId: REQUEST,
        initiatedBy: OWNER,
        deps: pairingMismatch,
      })
    ).toMatchObject({ ok: false, code: "attempt_request_mismatch" });
  });

  it("EO-K: session failure → no inventory / 3B.1", async () => {
    const deps = createDeps({
      runSessionPhase: vi.fn(async () => ({
        ok: false as const,
        code: "session_revocation_failed" as const,
        retryable: true,
      })),
    });

    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "session_revocation_failed",
      retryable: true,
    });
    expect(deps.advanceToInventory).not.toHaveBeenCalled();
    expect(deps.executeDatabaseStage).not.toHaveBeenCalled();
  });

  it("EO-L: inventory transition failure → no 3B.1", async () => {
    const deps = createDeps({
      advanceToInventory: vi.fn(async () => ({
        ok: false as const,
        code: "rpc_error" as const,
      })),
    });

    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "inventory_transition_failed",
      retryable: true,
    });
    expect(deps.executeDatabaseStage).not.toHaveBeenCalled();
  });

  it("EO-M: 3B.1 failure → stop", async () => {
    const deps = createDeps({
      executeDatabaseStage: vi.fn(async () => ({
        ok: false as const,
        code: "rpc_error" as const,
      })),
    });

    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "database_stage_failed",
      retryable: true,
    });
  });

  it("EO-N: malformed inventory payload → fail closed", async () => {
    const deps = createDeps({
      advanceToInventory: vi.fn(async () => ({
        ok: true as const,
        code: "advanced" as const,
        requestId: REQUEST,
        attemptId: ATTEMPT,
        stage: "sessions_revoked",
      })),
    });

    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "inventory_transition_failed",
      retryable: true,
    });
  });

  it("EO-O: duplicate execute uses same attempt context from acquisition", async () => {
    const acquire = vi
      .fn()
      .mockResolvedValueOnce(acquiredContext())
      .mockResolvedValueOnce({
        ok: true,
        code: "already_acquired",
        context: {
          requestId: REQUEST,
          attemptId: ATTEMPT,
          targetUserId: TARGET,
          attemptStage: "sessions_pending",
          attemptStatus: "active",
        },
      });
    const deps = createDeps({ acquire });

    await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });
    await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(deps.runSessionPhase).toHaveBeenCalledTimes(2);
  });

  it("EO-PF-A: readiness + preflight_ready → acquisition proceeds", async () => {
    const deps = createDeps();
    await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });
    expect(deps.runPreflight).toHaveBeenCalledWith({ requestId: REQUEST });
    expect(deps.acquire).toHaveBeenCalledOnce();
  });

  it("EO-PF-B: blocked_owner → acquire NOT called", async () => {
    const deps = createDeps({
      runPreflight: vi.fn(async () => ({
        ok: false as const,
        code: "blocked_owner" as const,
      })),
    });
    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });
    expect(result).toEqual({ ok: false, code: "blocked_owner" });
    expect(deps.acquire).not.toHaveBeenCalled();
    expect(deps.runSessionPhase).not.toHaveBeenCalled();
    expect(deps.advanceToInventory).not.toHaveBeenCalled();
    expect(deps.executeDatabaseStage).not.toHaveBeenCalled();
  });

  it("EO-PF-C: blocked_admin → acquire NOT called", async () => {
    const deps = createDeps({
      runPreflight: vi.fn(async () => ({
        ok: false as const,
        code: "blocked_admin" as const,
      })),
    });
    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });
    expect(result).toEqual({ ok: false, code: "blocked_admin" });
    expect(deps.acquire).not.toHaveBeenCalled();
    expect(deps.runSessionPhase).not.toHaveBeenCalled();
    expect(deps.advanceToInventory).not.toHaveBeenCalled();
    expect(deps.executeDatabaseStage).not.toHaveBeenCalled();
  });

  it("EO-PF-D: unsupported_story_lifecycle → acquire NOT called", async () => {
    const deps = createDeps({
      runPreflight: vi.fn(async () => ({
        ok: false as const,
        code: "unsupported_story_lifecycle" as const,
      })),
    });
    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });
    expect(result).toEqual({ ok: false, code: "execution_preflight_blocked" });
    expect(deps.acquire).not.toHaveBeenCalled();
    expect(deps.runSessionPhase).not.toHaveBeenCalled();
    expect(deps.advanceToInventory).not.toHaveBeenCalled();
    expect(deps.executeDatabaseStage).not.toHaveBeenCalled();
  });

  it("EO-PF-E: preflight lookup failure → acquire NOT called", async () => {
    const deps = createDeps({
      runPreflight: vi.fn(async () => ({
        ok: false as const,
        code: "preflight_lookup_failed" as const,
      })),
    });
    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });
    expect(result).toEqual({ ok: false, code: "preflight_lookup_failed" });
    expect(deps.acquire).not.toHaveBeenCalled();
  });

  it("EO-PF-F: request_not_approved → acquire NOT called", async () => {
    const deps = createDeps({
      runPreflight: vi.fn(async () => ({
        ok: false as const,
        code: "request_not_approved" as const,
      })),
    });
    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });
    expect(result).toEqual({ ok: false, code: "request_not_approved" });
    expect(deps.acquire).not.toHaveBeenCalled();
  });

  it("EO-PF-G: valid preflight still runs session/inventory/3B.1 chain", async () => {
    const deps = createDeps();
    const result = await runAccountDeletionExecutionOrchestrator({
      requestId: REQUEST,
      initiatedBy: OWNER,
      deps,
    });
    expect(result.ok).toBe(true);
    expect(deps.runPreflight).toHaveBeenCalledOnce();
    expect(deps.runSessionPhase).toHaveBeenCalledOnce();
    expect(deps.advanceToInventory).toHaveBeenCalledOnce();
    expect(deps.captureStorageManifest).toHaveBeenCalledOnce();
    expect(deps.executeDatabaseStage).toHaveBeenCalledOnce();
  });

  it("EO-P: no storage/profile/Auth deletion in orchestrator source", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "lib/server/accountDeletionExecutionOrchestrator.ts",
      "utf8"
    );
    expect(source).not.toContain("deleteUser");
    expect(source).not.toContain("cleanup_storage");
    expect(source).not.toMatch(/status.*deleted/);
  });
});
