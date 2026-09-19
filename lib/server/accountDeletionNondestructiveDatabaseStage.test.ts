import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_NONDESTRUCTIVE_DATABASE_STAGE_DISCONNECTED_NOTE,
  executeAccountDeletionNondestructiveDatabaseStage,
} from "./accountDeletionNondestructiveDatabaseStage";

describe("accountDeletionNondestructiveDatabaseStage wrapper", () => {
  it("calls RPC with request and attempt ids only", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        code: "completed",
        request_id: "req-1",
        attempt_id: "att-1",
        target_user_id: "target-1",
        database_rows_affected: { stories: 1 },
      },
      error: null,
    });

    const result = await executeAccountDeletionNondestructiveDatabaseStage({
      serviceRoleClient: { rpc } as never,
      requestId: "req-1",
      attemptId: "att-1",
    });

    expect(rpc).toHaveBeenCalledWith(
      "execute_account_deletion_nondestructive_database_stage",
      {
        p_request_id: "req-1",
        p_attempt_id: "att-1",
      }
    );
    expect(result).toMatchObject({
      ok: true,
      code: "completed",
      requestId: "req-1",
      attemptId: "att-1",
      targetUserId: "target-1",
    });
  });

  it("maps already_completed without mutation contract", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        code: "already_completed",
        request_id: "req-1",
        attempt_id: "att-1",
        target_user_id: "target-1",
        database_rows_affected: { stories: 2 },
      },
      error: null,
    });

    const result = await executeAccountDeletionNondestructiveDatabaseStage({
      serviceRoleClient: { rpc } as never,
      requestId: "req-1",
      attemptId: "att-1",
    });

    expect(result).toMatchObject({ ok: true, code: "already_completed" });
  });

  it("maps rpc failures", async () => {
    const result = await executeAccountDeletionNondestructiveDatabaseStage({
      serviceRoleClient: {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "boom" },
        }),
      } as never,
      requestId: "req-1",
      attemptId: "att-1",
    });

    expect(result).toEqual({
      ok: false,
      code: "rpc_error",
      detail: "boom",
    });
  });

  it("is not imported by execute handler", () => {
    const source = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );
    expect(source).not.toContain("accountDeletionNondestructiveDatabaseStage");
    expect(source).not.toContain(
      "executeAccountDeletionNondestructiveDatabaseStage"
    );
  });

  it("documents disconnected orchestration status", () => {
    expect(ACCOUNT_DELETION_NONDESTRUCTIVE_DATABASE_STAGE_DISCONNECTED_NOTE).toContain(
      "2C.3B.2"
    );
  });
});
