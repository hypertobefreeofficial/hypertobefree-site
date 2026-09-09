import { describe, expect, it, vi } from "vitest";
import { acquireAccountDeletionExecutionLock } from "./accountDeletionAcquisition";

describe("acquireAccountDeletionExecutionLock", () => {
  it("returns acquired context from RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        code: "acquired",
        request_id: "req-1",
        attempt_id: "attempt-1",
        target_user_id: "target-1",
      },
      error: null,
    });

    const result = await acquireAccountDeletionExecutionLock({
      serviceRoleClient: { rpc } as never,
      requestId: "req-1",
      initiatedBy: "owner-1",
    });

    expect(rpc).toHaveBeenCalledWith("acquire_account_deletion_execution_lock", {
      p_request_id: "req-1",
      p_initiated_by: "owner-1",
    });
    expect(result).toEqual({
      ok: true,
      code: "acquired",
      context: {
        requestId: "req-1",
        attemptId: "attempt-1",
        targetUserId: "target-1",
        attemptStage: null,
        attemptStatus: null,
      },
    });
  });

  it("returns already_acquired idempotent context", async () => {
    const result = await acquireAccountDeletionExecutionLock({
      serviceRoleClient: {
        rpc: vi.fn().mockResolvedValue({
          data: {
            ok: true,
            code: "already_acquired",
            request_id: "req-1",
            attempt_id: "attempt-1",
            target_user_id: "target-1",
            attempt_stage: "lock_acquired",
            attempt_status: "active",
          },
          error: null,
        }),
      } as never,
      requestId: "req-1",
      initiatedBy: "owner-1",
    });

    expect(result).toMatchObject({
      ok: true,
      code: "already_acquired",
      context: {
        attemptStage: "lock_acquired",
        attemptStatus: "active",
      },
    });
  });

  it("maps unauthorized_owner and ambiguous_state failures", async () => {
    const ownerDenied = await acquireAccountDeletionExecutionLock({
      serviceRoleClient: {
        rpc: vi.fn().mockResolvedValue({
          data: { ok: false, code: "unauthorized_owner" },
          error: null,
        }),
      } as never,
      requestId: "req-1",
      initiatedBy: "staff-admin",
    });
    expect(ownerDenied).toEqual({ ok: false, code: "unauthorized_owner" });

    const ambiguous = await acquireAccountDeletionExecutionLock({
      serviceRoleClient: {
        rpc: vi.fn().mockResolvedValue({
          data: { ok: false, code: "ambiguous_state", active_attempt_count: 0 },
          error: null,
        }),
      } as never,
      requestId: "req-1",
      initiatedBy: "owner-1",
    });
    expect(ambiguous).toEqual({
      ok: false,
      code: "ambiguous_state",
      detail: 0,
    });
  });
});
