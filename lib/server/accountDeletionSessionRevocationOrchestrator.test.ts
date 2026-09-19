import { describe, expect, it, vi } from "vitest";
import {
  runAccountDeletionSessionRevocationPhase,
  type AccountDeletionSessionRevocationOrchestratorDeps,
  type AccountDeletionTrustedSessionExecutionContext,
} from "./accountDeletionSessionRevocationOrchestrator";

const REQUEST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const CONTEXT: AccountDeletionTrustedSessionExecutionContext = {
  requestId: REQUEST,
  attemptId: ATTEMPT,
  targetUserId: TARGET,
};

function activeSnapshot(stage: string) {
  return {
    attemptStage: stage,
    attemptStatus: "active",
    attemptTargetUserId: TARGET,
    attemptRequestId: REQUEST,
    requestStatus: "deletion_in_progress",
    requestResolvedTargetUserId: TARGET,
  };
}

function successPending() {
  return {
    ok: true as const,
    code: "advanced" as const,
    requestId: REQUEST,
    attemptId: ATTEMPT,
    stage: "sessions_pending",
  };
}

function successRevoked(code: "advanced" | "already_at_stage" = "advanced") {
  return {
    ok: true as const,
    code,
    requestId: REQUEST,
    attemptId: ATTEMPT,
    stage: "sessions_revoked",
  };
}

function createDeps(
  overrides: Partial<AccountDeletionSessionRevocationOrchestratorDeps> = {}
): AccountDeletionSessionRevocationOrchestratorDeps {
  return {
    loadExecutionSnapshot: vi.fn(async () => ({
      ok: true as const,
      snapshot: activeSnapshot("lock_acquired"),
    })),
    advanceToSessionsPending: vi.fn(async () => successPending()),
    advanceToSessionsRevoked: vi.fn(async () => successRevoked()),
    recordSessionRevocationFailure: vi.fn(async () => ({ ok: true as const })),
    revokeTargetSessions: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("runAccountDeletionSessionRevocationPhase", () => {
  it("SR-A: lock_acquired → pending → signOut → revoked", async () => {
    const deps = createDeps();
    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: true, code: "sessions_revoked", stage: "sessions_revoked" });
    expect(deps.advanceToSessionsPending).toHaveBeenCalledOnce();
    expect(deps.revokeTargetSessions).toHaveBeenCalledOnce();
    expect(deps.advanceToSessionsRevoked).toHaveBeenCalledOnce();
    expect(deps.recordSessionRevocationFailure).not.toHaveBeenCalled();
  });

  it("SR-B: already sessions_pending → signOut → revoked", async () => {
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: activeSnapshot("sessions_pending"),
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result.ok).toBe(true);
    expect(deps.advanceToSessionsPending).not.toHaveBeenCalled();
    expect(deps.revokeTargetSessions).toHaveBeenCalledOnce();
  });

  it("SR-C: signOut failure → failure recorded → remains pending", async () => {
    const deps = createDeps({
      revokeTargetSessions: vi.fn(async () => ({ ok: false as const })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({
      ok: false,
      code: "session_revocation_failed",
      retryable: true,
    });
    expect(deps.recordSessionRevocationFailure).toHaveBeenCalledOnce();
    expect(deps.advanceToSessionsRevoked).not.toHaveBeenCalled();
  });

  it("SR-D: signOut success + revoked transition failure → fail closed", async () => {
    const deps = createDeps({
      advanceToSessionsRevoked: vi.fn(async () => ({
        ok: false as const,
        code: "rpc_error" as const,
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: false, code: "transition_failed", retryable: true });
  });

  it("SR-E: failure recording fails after signOut failure", async () => {
    const deps = createDeps({
      revokeTargetSessions: vi.fn(async () => ({ ok: false as const })),
      recordSessionRevocationFailure: vi.fn(async () => ({ ok: false as const })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({
      ok: false,
      code: "failure_recording_failed",
      retryable: true,
    });
  });

  it("SR-F: already sessions_revoked → no signOut", async () => {
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: activeSnapshot("sessions_revoked"),
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({
      ok: true,
      code: "already_sessions_revoked",
      stage: "sessions_revoked",
    });
    expect(deps.revokeTargetSessions).not.toHaveBeenCalled();
  });

  it("SR-G: inventory → no signOut → later_stage_reached", async () => {
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: activeSnapshot("inventory"),
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: true, code: "later_stage_reached", stage: "inventory" });
    expect(deps.revokeTargetSessions).not.toHaveBeenCalled();
  });

  it("SR-H: database_completed → no signOut → later_stage_reached", async () => {
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: activeSnapshot("database_completed"),
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({
      ok: true,
      code: "later_stage_reached",
      stage: "database_completed",
    });
  });

  it("SR-I: malformed target UUID → no signOut", async () => {
    const deps = createDeps();
    const result = await runAccountDeletionSessionRevocationPhase({
      context: { ...CONTEXT, targetUserId: "not-a-uuid" },
      deps,
    });

    expect(result).toEqual({ ok: false, code: "invalid_execution_context" });
    expect(deps.revokeTargetSessions).not.toHaveBeenCalled();
  });

  it("SR-J: target mismatch → no signOut", async () => {
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: { ...activeSnapshot("lock_acquired"), attemptTargetUserId: OTHER },
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: false, code: "target_mismatch" });
    expect(deps.revokeTargetSessions).not.toHaveBeenCalled();
  });

  it("attempt_request_mismatch → no signOut", async () => {
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: { ...activeSnapshot("lock_acquired"), attemptRequestId: OTHER },
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: false, code: "attempt_request_mismatch" });
    expect(deps.revokeTargetSessions).not.toHaveBeenCalled();
  });

  it("pre-signOut fresh validation blocks stale pending state", async () => {
    const loadExecutionSnapshot = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        snapshot: activeSnapshot("lock_acquired"),
      })
      .mockResolvedValueOnce({
        ok: true,
        snapshot: { ...activeSnapshot("sessions_pending"), requestStatus: "approved" },
      });

    const revokeTargetSessions = vi.fn(async (context) => {
      const { validateImmediatelyBeforeSignOut } = await import(
        "./accountDeletionSessionRevocationOrchestrator"
      );
      const failure = await validateImmediatelyBeforeSignOut(context, {
        loadExecutionSnapshot,
      } as never);
      if (failure) {
        return { ok: false as const, preSignOutFailure: failure };
      }
      return { ok: true as const };
    });

    const deps = createDeps({
      loadExecutionSnapshot,
      revokeTargetSessions,
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: false, code: "request_not_in_progress" });
  });

  it("SR-K: inactive attempt → no signOut", async () => {
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: { ...activeSnapshot("lock_acquired"), attemptStatus: "failed" },
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: false, code: "attempt_not_active" });
    expect(deps.revokeTargetSessions).not.toHaveBeenCalled();
  });

  it("SR-L: request not deletion_in_progress → no signOut", async () => {
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: { ...activeSnapshot("lock_acquired"), requestStatus: "approved" },
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: false, code: "request_not_in_progress" });
    expect(deps.revokeTargetSessions).not.toHaveBeenCalled();
  });

  it("SR-M: malformed revoked RPC response → fail closed", async () => {
    const deps = createDeps({
      advanceToSessionsRevoked: vi.fn(async () => ({
        ok: true as const,
        code: "advanced" as const,
        requestId: REQUEST,
        attemptId: ATTEMPT,
        stage: "inventory",
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: false, code: "transition_failed", retryable: true });
  });

  it("SR-O: signOut invoked via revokeTargetSessions dep with trusted context", async () => {
    const revokeTargetSessions = vi.fn(async () => ({ ok: true as const }));
    const deps = createDeps({ revokeTargetSessions });

    await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(revokeTargetSessions).toHaveBeenCalledWith(CONTEXT);
  });

  it("SR-N: RPC returns ok:false → fail closed", async () => {
    const deps = createDeps({
      advanceToSessionsPending: vi.fn(async () => ({
        ok: false as const,
        code: "stage_conflict" as const,
      })),
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result).toEqual({ ok: false, code: "stage_conflict" });
  });

  it("SR-P: no inventory transition in orchestrator source", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "lib/server/accountDeletionSessionRevocationOrchestrator.ts",
      "utf8"
    );
    expect(source).not.toContain("advanceAccountDeletionAttemptToInventory");
    expect(source).not.toContain("execute_account_deletion_nondestructive");
  });

  it("SR-Q: no 3B.1 call in orchestrator source", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "lib/server/accountDeletionSessionRevocationOrchestrator.ts",
      "utf8"
    );
    expect(source).not.toContain("executeAccountDeletionNondestructiveDatabaseStage");
  });
});

describe("session revocation crash recovery", () => {
  it("resumes after pending stage was persisted (retry signOut)", async () => {
    const revokeTargetSessions = vi.fn(async () => ({ ok: true as const }));
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: activeSnapshot("sessions_pending"),
      })),
      revokeTargetSessions,
    });

    await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });
    await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(revokeTargetSessions).toHaveBeenCalledTimes(2);
  });

  it("retries signOut after revoked persistence failed", async () => {
    const revokeTargetSessions = vi.fn(async () => ({ ok: true as const }));
    const advanceToSessionsRevoked = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, code: "rpc_error" as const })
      .mockResolvedValueOnce(successRevoked());

    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: activeSnapshot("sessions_pending"),
      })),
      revokeTargetSessions,
      advanceToSessionsRevoked,
    });

    const first = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });
    const second = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(first).toEqual({ ok: false, code: "transition_failed", retryable: true });
    expect(second).toEqual({ ok: true, code: "sessions_revoked", stage: "sessions_revoked" });
    expect(revokeTargetSessions).toHaveBeenCalledTimes(2);
  });

  it("completed revoked stage retry is idempotent without signOut", async () => {
    const revokeTargetSessions = vi.fn(async () => ({ ok: true as const }));
    const deps = createDeps({
      loadExecutionSnapshot: vi.fn(async () => ({
        ok: true,
        snapshot: activeSnapshot("sessions_revoked"),
      })),
      revokeTargetSessions,
    });

    const result = await runAccountDeletionSessionRevocationPhase({ context: CONTEXT, deps });

    expect(result.code).toBe("already_sessions_revoked");
    expect(revokeTargetSessions).not.toHaveBeenCalled();
  });
});
