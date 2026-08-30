import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateRecoveryPassword } from "./resetPasswordRecovery";

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockGetAal = vi.fn();
const mockListFactors = vi.fn();

function mockNonMfaAssurance() {
  mockGetAal.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });
}

function mockMfaAal1Assurance() {
  mockGetAal.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal2" },
    error: null,
  });
  mockListFactors.mockResolvedValue({
    data: {
      totp: [
        {
          id: "factor-1",
          factor_type: "totp",
          status: "verified",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    },
    error: null,
  });
}

function createClient() {
  return {
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
      mfa: {
        getAuthenticatorAssuranceLevel: mockGetAal,
        listFactors: mockListFactors,
      },
    },
  } as never;
}

describe("updateRecoveryPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNonMfaAssurance();
  });

  it("updates password for non-MFA recovery sessions", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockUpdateUser.mockResolvedValue({ error: null });

    const result = await updateRecoveryPassword(createClient(), {
      password: "password123",
      confirmPassword: "password123",
    });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
  });

  it("blocks MFA recovery sessions at AAL1 before updateUser", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockMfaAal1Assurance();

    const result = await updateRecoveryPassword(createClient(), {
      password: "password123",
      confirmPassword: "password123",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("insufficient_aal");
    }
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("allows MFA recovery sessions already at AAL2", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: {
        totp: [
          {
            id: "factor-1",
            factor_type: "totp",
            status: "verified",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      error: null,
    });
    mockUpdateUser.mockResolvedValue({ error: null });

    const result = await updateRecoveryPassword(createClient(), {
      password: "password123",
      confirmPassword: "password123",
    });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
  });

  it("fails closed when step-up is required but no verified factor exists", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    const result = await updateRecoveryPassword(createClient(), {
      password: "password123",
      confirmPassword: "password123",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("factor_not_found");
    }
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects expired recovery sessions", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await updateRecoveryPassword(createClient(), {
      password: "password123",
      confirmPassword: "password123",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_authenticated");
    }
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});

describe("reset password page contract", () => {
  it("keeps /reset-password excluded from MFA guard redirects", () => {
    const guardSource = readFileSync("lib/auth/mfaChallenge.ts", "utf8");
    const resetPage = readFileSync("app/reset-password/page.tsx", "utf8");

    expect(guardSource).toContain('"/reset-password"');
    expect(resetPage).toContain("loadSensitiveActionStepUpSnapshot");
    expect(resetPage).not.toContain("router.push(\"/mfa-challenge\")");
  });

  it("does not expose raw Supabase errors on reset failure", () => {
    const resetPage = readFileSync("app/reset-password/page.tsx", "utf8");

    expect(resetPage).not.toContain("error.message");
    expect(resetPage).toContain("result.message");
  });
});
