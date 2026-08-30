import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertAal2ForSensitiveAction,
  loadSensitiveActionStepUpSnapshot,
  requiresSensitiveActionStepUp,
  stepUpTotpForSensitiveAction,
} from "./mfaStepUp";

const mockGetUser = vi.fn();
const mockGetAal = vi.fn();
const mockListFactors = vi.fn();
const mockChallenge = vi.fn();
const mockVerify = vi.fn();

function createClient() {
  return {
    auth: {
      getUser: mockGetUser,
      mfa: {
        getAuthenticatorAssuranceLevel: mockGetAal,
        listFactors: mockListFactors,
        challenge: mockChallenge,
        verify: mockVerify,
      },
    },
  } as never;
}

const verifiedFactor = {
  id: "factor-1",
  factor_type: "totp",
  status: "verified",
  created_at: "2026-01-01T00:00:00Z",
};

describe("requiresSensitiveActionStepUp", () => {
  it("requires step-up only when nextLevel is aal2 and currentLevel is not", () => {
    expect(
      requiresSensitiveActionStepUp({ currentLevel: "aal1", nextLevel: "aal2" })
    ).toBe(true);
    expect(
      requiresSensitiveActionStepUp({ currentLevel: "aal2", nextLevel: "aal2" })
    ).toBe(false);
    expect(
      requiresSensitiveActionStepUp({ currentLevel: "aal1", nextLevel: "aal1" })
    ).toBe(false);
    expect(requiresSensitiveActionStepUp(null)).toBe(false);
  });
});

describe("loadSensitiveActionStepUpSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects logged-out users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await loadSensitiveActionStepUpSnapshot(createClient());

    expect(result).toEqual({
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before continuing.",
    });
  });

  it("marks non-MFA users as not requiring step-up", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    const result = await loadSensitiveActionStepUpSnapshot(createClient());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.stepUpRequired).toBe(false);
    }
  });

  it("marks MFA users at AAL1 as requiring step-up", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: { totp: [verifiedFactor] },
      error: null,
    });

    const result = await loadSensitiveActionStepUpSnapshot(createClient());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.stepUpRequired).toBe(true);
      expect(result.snapshot.verifiedTotpFactor?.id).toBe("factor-1");
    }
  });
});

describe("assertAal2ForSensitiveAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows non-MFA users through", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    await expect(assertAal2ForSensitiveAction(createClient())).resolves.toEqual({
      ok: true,
    });
  });

  it("allows MFA users already at AAL2 through", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: { totp: [verifiedFactor] },
      error: null,
    });

    await expect(assertAal2ForSensitiveAction(createClient())).resolves.toEqual({
      ok: true,
    });
  });

  it("blocks MFA users at AAL1", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: { totp: [verifiedFactor] },
      error: null,
    });

    const result = await assertAal2ForSensitiveAction(createClient());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("insufficient_aal");
    }
  });

  it("fails closed when assurance cannot be read", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetAal.mockResolvedValue({ data: null, error: { message: "failed" } });
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    const result = await assertAal2ForSensitiveAction(createClient());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("auth_error");
    }
  });

  it("fails closed when step-up is required but no verified factor exists", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    mockListFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    const result = await assertAal2ForSensitiveAction(createClient());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("factor_not_found");
    }
  });
});

describe("stepUpTotpForSensitiveAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockListFactors.mockResolvedValue({
      data: { totp: [verifiedFactor] },
      error: null,
    });
  });

  it("rejects invalid TOTP format", async () => {
    const result = await stepUpTotpForSensitiveAction(createClient(), "123");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("validation_error");
    }
    expect(mockChallenge).not.toHaveBeenCalled();
  });

  it("confirms AAL2 after successful verification", async () => {
    mockChallenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null });
    mockVerify.mockResolvedValue({ data: {}, error: null });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    const result = await stepUpTotpForSensitiveAction(createClient(), "123456");

    expect(result.ok).toBe(true);
    expect(mockVerify).toHaveBeenCalledWith({
      factorId: "factor-1",
      challengeId: "challenge-1",
      code: "123456",
    });
  });

  it("fails closed when verification succeeds but assurance is still not AAL2", async () => {
    mockChallenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null });
    mockVerify.mockResolvedValue({ data: {}, error: null });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    const result = await stepUpTotpForSensitiveAction(createClient(), "123456");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("insufficient_aal");
    }
  });

  it("returns sanitized errors for invalid verification codes", async () => {
    mockChallenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null });
    mockVerify.mockResolvedValue({
      error: { message: "Invalid MFA verification code" },
    });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    const result = await stepUpTotpForSensitiveAction(createClient(), "123456");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("verification code was not accepted");
      expect(JSON.stringify(result)).not.toContain("Invalid MFA");
    }
  });
});

describe("shared security contract", () => {
  it("does not persist TOTP codes or log tokens", () => {
    const source = readFileSync("lib/auth/mfaStepUp.ts", "utf8");

    expect(source).not.toContain("console.log");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("service_role");
  });
});
