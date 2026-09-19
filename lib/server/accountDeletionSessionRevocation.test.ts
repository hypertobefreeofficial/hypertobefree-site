import { describe, expect, it, vi } from "vitest";
import {
  markAttemptSessionsPendingWithError,
  markAttemptSessionsRevoked,
  revokeAccountDeletionTargetSessions,
} from "./accountDeletionSessionRevocation";

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("accountDeletionSessionRevocation", () => {
  it("revokes global sessions for target without deleteUser", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const client = {
      auth: { admin: { signOut } },
    };

    const result = await revokeAccountDeletionTargetSessions({
      serviceRoleClient: client as never,
      targetUserId: TARGET,
    });

    expect(result).toEqual({ ok: true });
    expect(signOut).toHaveBeenCalledWith(TARGET, "global");
    expect(signOut).not.toHaveBeenCalledWith(expect.anything(), "local");
  });

  it("fails closed when auth.admin.signOut throws", async () => {
    const result = await revokeAccountDeletionTargetSessions({
      serviceRoleClient: {
        auth: {
          admin: {
            signOut: vi.fn().mockRejectedValue(new Error("network down")),
          },
        },
      } as never,
      targetUserId: TARGET,
    });

    expect(result).toEqual({ ok: false, code: "session_revocation_failed" });
  });

  it("fails closed on auth admin signOut error", async () => {
    const result = await revokeAccountDeletionTargetSessions({
      serviceRoleClient: {
        auth: {
          admin: {
            signOut: vi.fn().mockResolvedValue({
              error: { message: "upstream failure" },
            }),
          },
        },
      } as never,
      targetUserId: TARGET,
    });

    expect(result).toEqual({
      ok: false,
      code: "session_revocation_failed",
    });
  });

  it("rejects invalid target UUID", async () => {
    const signOut = vi.fn();
    const result = await revokeAccountDeletionTargetSessions({
      serviceRoleClient: {
        auth: { admin: { signOut } },
      } as never,
      targetUserId: "not-a-uuid",
    });

    expect(result).toEqual({ ok: false, code: "invalid_target" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("marks attempt sessions_revoked via narrow RPC only", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        code: "advanced",
        request_id: REQUEST,
        attempt_id: ATTEMPT,
        stage: "sessions_revoked",
      },
      error: null,
    });

    const result = await markAttemptSessionsRevoked({
      serviceRoleClient: { rpc } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
    });

    expect(result).toEqual({ ok: true, stage: "sessions_revoked" });
    expect(rpc).toHaveBeenCalledWith(
      "advance_account_deletion_attempt_to_sessions_revoked",
      {
        p_request_id: REQUEST,
        p_attempt_id: ATTEMPT,
      }
    );
    expect(rpc.mock.calls[0]?.[0]).not.toContain("update");
  });

  it("fails closed when sessions_revoked RPC returns stage_conflict", async () => {
    const result = await markAttemptSessionsRevoked({
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
      detail: "stage_conflict",
    });
  });

  it("records session revocation failure via narrow RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        code: "recorded",
        request_id: REQUEST,
        attempt_id: ATTEMPT,
        stage: "sessions_pending",
        retry_count: 3,
      },
      error: null,
    });

    const result = await markAttemptSessionsPendingWithError({
      serviceRoleClient: { rpc } as never,
      requestId: REQUEST,
      attemptId: ATTEMPT,
      errorCode: "session_revocation_failed",
      errorDetailSafe: "upstream failure",
    });

    expect(result).toEqual({ ok: true, stage: "sessions_pending" });
    expect(rpc).toHaveBeenCalledWith(
      "record_account_deletion_session_revocation_failure",
      {
        p_request_id: REQUEST,
        p_attempt_id: ATTEMPT,
        p_error_code: "session_revocation_failed",
        p_error_fingerprint: "upstream failure",
      }
    );
  });
});
