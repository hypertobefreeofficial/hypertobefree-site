import { describe, expect, it, vi } from "vitest";
import {
  markAttemptSessionsPendingWithError,
  markAttemptSessionsRevoked,
  revokeAccountDeletionTargetSessions,
} from "./accountDeletionSessionRevocation";

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATTEMPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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
      detail: "upstream failure",
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

  it("marks attempt sessions_revoked while keeping status active", async () => {
    const eqStatus = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus });
    const update = vi.fn().mockReturnValue({ eq: eqId });

    const result = await markAttemptSessionsRevoked({
      serviceRoleClient: {
        from: vi.fn().mockReturnValue({ update }),
      } as never,
      attemptId: ATTEMPT,
    });

    expect(result).toEqual({ ok: true, stage: "sessions_revoked" });
    expect(update).toHaveBeenCalledWith({
      stage: "sessions_revoked",
      last_error_code: null,
      last_error_detail_safe: null,
    });
    expect(eqStatus).toHaveBeenCalledWith("status", "active");
  });

  it("records retryable sessions_pending failure on active attempt", async () => {
    const updateFinalEq = vi.fn().mockResolvedValue({ error: null });
    const updateEqStatus = vi.fn().mockReturnValue({ eq: updateFinalEq });
    const updateEqId = vi.fn().mockReturnValue({ eq: updateEqStatus });
    const update = vi.fn().mockReturnValue({ eq: updateEqId });

    const selectMaybeSingle = vi.fn().mockResolvedValue({
      data: { retry_count: 2 },
      error: null,
    });
    const selectEqStatus = vi.fn().mockReturnValue({ maybeSingle: selectMaybeSingle });
    const selectEqId = vi.fn().mockReturnValue({ eq: selectEqStatus });
    const select = vi.fn().mockReturnValue({ eq: selectEqId });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "account_deletion_execution_attempts") {
        return { select, update };
      }
      return { select, update };
    });

    const result = await markAttemptSessionsPendingWithError({
      serviceRoleClient: { from } as never,
      attemptId: ATTEMPT,
      errorCode: "session_revocation_failed",
      errorDetailSafe: "upstream failure",
    });

    expect(result).toEqual({ ok: true, stage: "sessions_pending" });
    expect(update).toHaveBeenCalledWith({
      stage: "sessions_pending",
      status: "active",
      last_error_code: "session_revocation_failed",
      last_error_detail_safe: "upstream failure",
      retry_count: 3,
    });
  });
});
