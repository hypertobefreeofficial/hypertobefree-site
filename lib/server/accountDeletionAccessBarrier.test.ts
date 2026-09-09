import { describe, expect, it, vi } from "vitest";
import {
  checkCurrentUserDeletionInProgress,
  isStateChangingHttpMethod,
} from "./accountDeletionAccessBarrier";
import { ACCOUNT_DELETION_IN_PROGRESS_CODE } from "./accountDeletionActorWriteGuard";

describe("accountDeletionAccessBarrier", () => {
  it("blocks when current_user_account_write_blocked returns true", async () => {
    const result = await checkCurrentUserDeletionInProgress({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as never);

    expect(result).toEqual({
      blocked: true,
      code: ACCOUNT_DELETION_IN_PROGRESS_CODE,
    });
  });

  it("fails closed on RPC error", async () => {
    const result = await checkCurrentUserDeletionInProgress({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    } as never);

    expect(result.blocked).toBe(true);
  });

  it("allows when RPC returns false", async () => {
    const result = await checkCurrentUserDeletionInProgress({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    } as never);

    expect(result).toEqual({ blocked: false });
  });

  it("classifies state-changing HTTP methods", () => {
    expect(isStateChangingHttpMethod("POST")).toBe(true);
    expect(isStateChangingHttpMethod("patch")).toBe(true);
    expect(isStateChangingHttpMethod("GET")).toBe(false);
    expect(isStateChangingHttpMethod("HEAD")).toBe(false);
  });
});
