import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_IN_PROGRESS_CODE,
  accountDeletionInProgressJsonBody,
  assertAccountDeletionActorCanWrite,
  checkAccountDeletionActorWriteBlock,
  createAccountDeletionActorWriteGuardDeps,
  isValidActorUserId,
} from "./accountDeletionActorWriteGuard";

const ACTOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function depsWithMatch(matched: boolean, ok = true) {
  return {
    hasDeletionInProgressMatch: vi.fn(async () =>
      ok ? { ok: true as const, matched } : { ok: false as const }
    ),
  };
}

describe("accountDeletionActorWriteGuard", () => {
  // Write-freeze split: 0A RLS blocks browser/user-JWT writes; 0B actor guards block
  // service-role normal-user API routes before privileged mutations.

  it("blocks actor with deletion_in_progress user_id match", async () => {
    const result = await checkAccountDeletionActorWriteBlock(
      ACTOR_A,
      depsWithMatch(true)
    );
    expect(result).toEqual({
      blocked: true,
      reason: "deletion_in_progress",
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
  });

  it("blocks actor with user_id NULL + matching target_user_id_snapshot semantics via lookup", async () => {
    const deps = depsWithMatch(true);
    const result = await assertAccountDeletionActorCanWrite(ACTOR_A, deps);
    expect(result.blocked).toBe(true);
    expect(deps.hasDeletionInProgressMatch).toHaveBeenCalledWith(ACTOR_A);
  });

  it("does not block when snapshot would mismatch another user (lookup returns false)", async () => {
    const result = await checkAccountDeletionActorWriteBlock(
      ACTOR_B,
      depsWithMatch(false)
    );
    expect(result).toEqual({ blocked: false });
  });

  it("does not block approved/submitted states when lookup finds no deletion_in_progress row", async () => {
    const result = await checkAccountDeletionActorWriteBlock(
      ACTOR_A,
      depsWithMatch(false)
    );
    expect(result).toEqual({ blocked: false });
  });

  it("blocks fail-closed on DB lookup error", async () => {
    const result = await checkAccountDeletionActorWriteBlock(
      ACTOR_A,
      depsWithMatch(false, false)
    );
    expect(result).toEqual({
      blocked: true,
      reason: "lookup_failed",
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
  });

  it("blocks malformed or missing actor ids fail-closed", async () => {
    const deps = depsWithMatch(false);
    await expect(
      checkAccountDeletionActorWriteBlock("", deps)
    ).resolves.toEqual({
      blocked: true,
      reason: "invalid_actor",
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
    expect(deps.hasDeletionInProgressMatch).not.toHaveBeenCalled();
    expect(isValidActorUserId("not-a-uuid")).toBe(false);
  });

  it("uses deterministic public error contract", () => {
    expect(accountDeletionInProgressJsonBody()).toEqual({
      ok: false,
      error:
        "Account deletion is in progress. Changes are temporarily unavailable.",
      code: "account_deletion_in_progress",
    });
  });

  it("builds service-role deps with EXISTS-style account_deletion_requests query", async () => {
    const or = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "req-1" }], error: null });
    const eq = vi.fn().mockReturnValue({ or, limit });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const adminClient = { from } as never;

    const deps = createAccountDeletionActorWriteGuardDeps(adminClient);
    const result = await checkAccountDeletionActorWriteBlock(ACTOR_A, deps);

    expect(from).toHaveBeenCalledWith("account_deletion_requests");
    expect(eq).toHaveBeenCalledWith("status", "deletion_in_progress");
    expect(or).toHaveBeenCalledWith(
      `user_id.eq.${ACTOR_A},and(user_id.is.null,target_user_id_snapshot.eq.${ACTOR_A})`
    );
    expect(result.blocked).toBe(true);
  });
});
