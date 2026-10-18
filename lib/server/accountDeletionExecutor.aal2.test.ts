import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAdminAal2ForAccountDeletionExecution } from "./accountDeletionExecutor";

const mockGetAuthenticatorAssuranceLevel = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: (...args: unknown[]) =>
          mockGetAuthenticatorAssuranceLevel(...args),
      },
    },
  })),
}));

describe("verifyAdminAal2ForAccountDeletionExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("passes the bearer access token into getAuthenticatorAssuranceLevel", async () => {
    mockGetAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2" },
      error: null,
    });

    await verifyAdminAal2ForAccountDeletionExecution("aal2-bearer");

    expect(mockGetAuthenticatorAssuranceLevel).toHaveBeenCalledTimes(1);
    expect(mockGetAuthenticatorAssuranceLevel).toHaveBeenCalledWith("aal2-bearer");
  });

  it("returns ok when Auth reports currentLevel aal2", async () => {
    mockGetAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    await expect(
      verifyAdminAal2ForAccountDeletionExecution("aal2-bearer")
    ).resolves.toEqual({ ok: true });
  });

  it("returns mfa_step_up_required when currentLevel is aal1", async () => {
    mockGetAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    await expect(
      verifyAdminAal2ForAccountDeletionExecution("aal1-bearer")
    ).resolves.toEqual({ ok: false, code: "mfa_step_up_required" });
  });

  it("returns mfa_step_up_required when currentLevel is null", async () => {
    mockGetAuthenticatorAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: null,
        nextLevel: null,
        currentAuthenticationMethods: [],
      },
      error: null,
    });

    await expect(
      verifyAdminAal2ForAccountDeletionExecution("sessionless-bearer")
    ).resolves.toEqual({ ok: false, code: "mfa_step_up_required" });
  });

  it("returns auth_error when Auth returns an error", async () => {
    mockGetAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: { message: "Auth session missing" },
    });

    await expect(
      verifyAdminAal2ForAccountDeletionExecution("broken-bearer")
    ).resolves.toEqual({ ok: false, code: "auth_error" });
  });

  it("does not let a rejected bearer with an aal2 claim bypass the gate", async () => {
    mockGetAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2" },
      error: { message: "invalid JWT" },
    });

    await expect(
      verifyAdminAal2ForAccountDeletionExecution("rejected-bearer")
    ).resolves.toEqual({ ok: false, code: "auth_error" });
    expect(mockGetAuthenticatorAssuranceLevel).toHaveBeenCalledWith(
      "rejected-bearer"
    );
  });

  it("returns auth_error and skips Auth when supabase config is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    await expect(
      verifyAdminAal2ForAccountDeletionExecution("aal2-bearer")
    ).resolves.toEqual({ ok: false, code: "auth_error" });
    expect(mockGetAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });
});
