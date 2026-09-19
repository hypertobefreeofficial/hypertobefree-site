import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cancelAccountDeletionExecution } from "./accountDeletionExecutionCancel";

const REQUEST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function clientWith(payload: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data: payload, error })),
  };
}

describe("cancelAccountDeletionExecution", () => {
  it("rejects malformed UUIDs before RPC", async () => {
    const client = clientWith(null);
    const result = await cancelAccountDeletionExecution({
      serviceRoleClient: client as never,
      requestId: "not-a-uuid",
      attemptId: ATTEMPT,
      initiatedBy: OWNER,
    });
    expect(result).toEqual({ ok: false, code: "invalid_arguments" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("parses cancelled success", async () => {
    const client = clientWith({
      ok: true,
      code: "cancelled",
      request_id: REQUEST,
      attempt_id: ATTEMPT,
      last_stage: "lock_acquired",
      reauthentication_may_be_required: false,
    });
    const result = await cancelAccountDeletionExecution({
      serviceRoleClient: client as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
      initiatedBy: OWNER,
    });
    expect(result).toEqual({
      ok: true,
      code: "cancelled",
      requestId: REQUEST,
      attemptId: ATTEMPT,
      lastStage: "lock_acquired",
      reauthenticationMayBeRequired: false,
    });
  });

  it("parses already_cancelled without treating unknown success as ready", async () => {
    const client = clientWith({
      ok: true,
      code: "already_cancelled",
      request_id: REQUEST,
      attempt_id: ATTEMPT,
      last_stage: "inventory",
      reauthentication_may_be_required: true,
    });
    const result = await cancelAccountDeletionExecution({
      serviceRoleClient: client as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
      initiatedBy: OWNER,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code).toBe("already_cancelled");
      expect(result.reauthenticationMayBeRequired).toBe(true);
    }
  });

  it("fail-closes malformed success and raw RPC errors", async () => {
    const malformed = clientWith({ ok: true, code: "cancelled" });
    expect(
      await cancelAccountDeletionExecution({
        serviceRoleClient: malformed as never,
        requestId: REQUEST,
        attemptId: ATTEMPT,
        initiatedBy: OWNER,
      })
    ).toEqual({ ok: false, code: "rpc_error" });

    const raw = clientWith(null, { message: "relation does not exist: secret" });
    const rawResult = await cancelAccountDeletionExecution({
      serviceRoleClient: raw as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
      initiatedBy: OWNER,
    });
    expect(rawResult).toEqual({ ok: false, code: "rpc_error" });
    expect(JSON.stringify(rawResult)).not.toContain("secret");
  });

  it("maps irreversible_stage and does not accept unknown codes as success", async () => {
    const client = clientWith({ ok: false, code: "irreversible_stage" });
    expect(
      await cancelAccountDeletionExecution({
        serviceRoleClient: client as never,
        requestId: REQUEST,
        attemptId: ATTEMPT,
        initiatedBy: OWNER,
      })
    ).toEqual({ ok: false, code: "irreversible_stage" });

    const unknown = clientWith({ ok: true, code: "deleted" });
    expect(
      await cancelAccountDeletionExecution({
        serviceRoleClient: unknown as never,
        requestId: REQUEST,
        attemptId: ATTEMPT,
        initiatedBy: OWNER,
      })
    ).toEqual({ ok: false, code: "rpc_error" });
  });

  it("is not wired into the execute handler or orchestrator", () => {
    const handler = readFileSync("lib/server/accountDeletionExecuteHandler.ts", "utf8");
    const orchestrator = readFileSync(
      "lib/server/accountDeletionExecutionOrchestrator.ts",
      "utf8"
    );
    expect(handler).not.toContain("cancelAccountDeletionExecution");
    expect(orchestrator).not.toContain("cancelAccountDeletionExecution");
    expect(handler).not.toContain("cancel_account_deletion_execution");
  });
});
