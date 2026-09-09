import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyOwnerForAccountDeletionExecution } from "./accountDeletionOwnerAuthorization";

const mockRpc = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

describe("verifyOwnerForAccountDeletionExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("returns true for current_user_is_owner RPC success", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await expect(
      verifyOwnerForAccountDeletionExecution("owner-token")
    ).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("current_user_is_owner");
  });

  it("returns false for staff admin without owner flag", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(
      verifyOwnerForAccountDeletionExecution("staff-token")
    ).resolves.toBe(false);
  });

  it("returns false when RPC fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "fail" } });
    await expect(
      verifyOwnerForAccountDeletionExecution("token")
    ).resolves.toBe(false);
  });
});
