import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_PROFILE_COMPLETION_DISCONNECTED_NOTE,
  finalizeAccountDeletionProfileStage,
} from "./accountDeletionProfileCompletion";

const REQUEST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ATTEMPT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function successPayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ok: true,
    code: "finalized",
    request_id: REQUEST,
    attempt_id: ATTEMPT,
    target_user_id: TARGET,
    stage: "profile_completed",
    profile_rows_affected: { profile_shell_deleted: 1 },
    checked_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("finalizeAccountDeletionProfileStage wrapper", () => {
  it("rejects invalid request UUID without RPC", async () => {
    const rpc = vi.fn();
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: { rpc } as never,
      requestId: "not-a-uuid",
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invalid_arguments" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid attempt UUID without RPC", async () => {
    const rpc = vi.fn();
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: { rpc } as never,
      requestId: REQUEST,
      attemptId: "bad",
    });
    expect(result).toEqual({ ok: false, code: "invalid_arguments" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps finalized success and calls RPC exactly once", async () => {
    const rpc = vi.fn(async () => ({
      data: successPayload(),
      error: null,
    }));
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: { rpc } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "finalize_account_deletion_profile_stage",
      {
        p_request_id: REQUEST,
        p_attempt_id: ATTEMPT,
      }
    );
    expect(result).toEqual({
      ok: true,
      code: "finalized",
      requestId: REQUEST,
      attemptId: ATTEMPT,
      targetUserId: TARGET,
      stage: "profile_completed",
      profileRowsAffected: { profile_shell_deleted: 1 },
      checkedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("accepts already_finalized with strict success shape", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: successPayload({ code: "already_finalized" }),
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toBe("already_finalized");
    expect(result.stage).toBe("profile_completed");
  });

  it("rejects success when stage is not profile_completed", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: successPayload({ stage: "profile" }),
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invariant_failed" });
  });

  it("rejects success when profile_rows_affected is null", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: successPayload({ profile_rows_affected: null }),
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invariant_failed" });
  });

  it("rejects success when profile_rows_affected is an array", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: successPayload({ profile_rows_affected: [1] }),
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invariant_failed" });
  });

  it("rejects success when request_id is malformed", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: successPayload({ request_id: 123 }),
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invariant_failed" });
  });

  it("rejects success when attempt_id is malformed", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: successPayload({ attempt_id: null }),
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invariant_failed" });
  });

  it("rejects success when target_user_id is malformed", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: successPayload({ target_user_id: undefined }),
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invariant_failed" });
  });

  it("rejects success when checked_at is non-string when supplied", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: successPayload({ checked_at: 12345 }),
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invariant_failed" });
  });

  it("allows absent checked_at on success", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: successPayload({ checked_at: undefined }),
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checkedAt).toBeUndefined();
  });

  it("maps RPC transport error without leaking message", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: null,
          error: { message: "secret internal db detail" },
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "rpc_error" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("treats null RPC data as invariant_failed", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({ data: null, error: null })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invariant_failed" });
  });

  it("maps unknown DB result code to invariant_failed", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: { ok: false, code: "totally_unknown_code" },
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invariant_failed" });
  });

  it("passes through known failure codes", async () => {
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: { ok: false, code: "invalid_stage" },
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({ ok: false, code: "invalid_stage" });
  });

  it("passes through profile_media_not_complete with detail only", async () => {
    const detail = { ok: false, code: "profile_media_incomplete" };
    const result = await finalizeAccountDeletionProfileStage({
      serviceRoleClient: {
        rpc: vi.fn(async () => ({
          data: { ok: false, code: "profile_media_not_complete", detail },
          error: null,
        })),
      } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });
    expect(result).toEqual({
      ok: false,
      code: "profile_media_not_complete",
      detail,
    });
  });
});

describe("accountDeletionProfileCompletion static guards", () => {
  const source = readFileSync(
    "lib/server/accountDeletionProfileCompletion.ts",
    "utf8"
  );

  it("includes server-only and disconnected note", () => {
    expect(source).toContain('import "server-only"');
    expect(ACCOUNT_DELETION_PROFILE_COMPLETION_DISCONNECTED_NOTE).toContain(
      "NOT wired"
    );
  });

  it("contains no direct profiles/Auth/Storage mutation surface", () => {
    expect(source).not.toContain('.from("profiles")');
    expect(source).not.toContain("deleteUser");
    expect(source).not.toContain("auth.admin");
    expect(source).not.toContain("storage.from");
    expect(source).not.toContain(".remove(");
    expect(source).not.toMatch(/DELETE\s+FROM/i);
  });

  it("contains exactly one serviceRoleClient.rpc call", () => {
    const matches = source.match(/serviceRoleClient\.rpc\(/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe("3B.4C.2 rollout unwired guards", () => {
  it("execute handler and orchestrator do not import profile completion wrapper", () => {
    const handler = readFileSync(
      "lib/server/accountDeletionExecuteHandler.ts",
      "utf8"
    );
    const orchestrator = readFileSync(
      "lib/server/accountDeletionExecutionOrchestrator.ts",
      "utf8"
    );
    const route = readFileSync(
      "app/api/admin/account-deletion/[requestId]/execute/route.ts",
      "utf8"
    );
    expect(handler).not.toContain("accountDeletionProfileCompletion");
    expect(orchestrator).not.toContain("finalizeAccountDeletionProfileStage");
    expect(route).not.toContain("finalize_account_deletion_profile_stage");
  });
});
