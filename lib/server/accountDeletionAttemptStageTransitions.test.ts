import { describe, expect, it, vi } from "vitest";
import {
  advanceAccountDeletionAttemptToInventory,
  advanceAccountDeletionAttemptToSessionsPending,
  recordAccountDeletionSessionRevocationFailure,
} from "./accountDeletionAttemptStageTransitions";
import { readFileSync } from "node:fs";

const REQUEST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("accountDeletionAttemptStageTransitions", () => {
  it("fails closed on malformed RPC success payload", async () => {
    const result = await advanceAccountDeletionAttemptToSessionsPending({
      serviceRoleClient: {
        rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });

    expect(result).toEqual({ ok: false, code: "rpc_error", detail: { ok: true } });
  });

  it("maps stage_conflict from RPC failure payload", async () => {
    const result = await advanceAccountDeletionAttemptToInventory({
      serviceRoleClient: {
        rpc: vi.fn().mockResolvedValue({
          data: { ok: false, code: "stage_conflict" },
          error: null,
        }),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });

    expect(result).toEqual({
      ok: false,
      code: "stage_conflict",
      detail: { ok: false, code: "stage_conflict" },
    });
  });

  it("parses recorded session-revocation failure payload", async () => {
    const result = await recordAccountDeletionSessionRevocationFailure({
      serviceRoleClient: {
        rpc: vi.fn().mockResolvedValue({
          data: {
            ok: true,
            code: "recorded",
            request_id: REQUEST,
            attempt_id: ATTEMPT,
            stage: "sessions_pending",
            retry_count: 2,
          },
          error: null,
        }),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
      errorCode: "session_revocation_failed",
    });

    expect(result).toEqual({
      ok: true,
      code: "recorded",
      requestId: REQUEST,
      attemptId: ATTEMPT,
      stage: "sessions_pending",
      retryCount: 2,
    });
  });

  it("does not use raw execution_attempts UPDATE in session revocation module", () => {
    const source = readFileSync(
      "lib/server/accountDeletionSessionRevocation.ts",
      "utf8"
    );
    expect(source).not.toMatch(/from\([\"']account_deletion_execution_attempts[\"']\)/);
    expect(source).not.toContain(".update(");
  });

  it("does not export createDefaultExecutionLockUpdater from executor", () => {
    const source = readFileSync("lib/server/accountDeletionExecutor.ts", "utf8");
    expect(source).not.toContain("createDefaultExecutionLockUpdater");
    expect(source).not.toContain("tryAcquireExecutionLock");
  });
});
