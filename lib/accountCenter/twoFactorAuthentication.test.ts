import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TWO_FACTOR_INCOMPLETE_ENROLLMENT_MESSAGE,
  beginTotpEnrollment,
  cancelTotpEnrollment,
  disableVerifiedTotpFactor,
  formatTotpFactorCreatedAt,
  formatTwoFactorAuthError,
  listUnverifiedTotpFactors,
  loadTwoFactorAuthSnapshot,
  selectPrimaryUnverifiedTotpFactor,
  selectPrimaryVerifiedTotpFactor,
  stepUpTotpForDisable,
  validateTotpVerificationCode,
  verifyTotpEnrollment,
} from "./twoFactorAuthentication";

const mockGetUser = vi.fn();
const mockListFactors = vi.fn();
const mockEnroll = vi.fn();
const mockUnenroll = vi.fn();
const mockChallenge = vi.fn();
const mockVerify = vi.fn();
const mockGetAal = vi.fn();
const mockRefreshSession = vi.fn();

function createClient() {
  return {
    auth: {
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
      mfa: {
        listFactors: mockListFactors,
        enroll: mockEnroll,
        unenroll: mockUnenroll,
        challenge: mockChallenge,
        verify: mockVerify,
        getAuthenticatorAssuranceLevel: mockGetAal,
      },
    },
  } as never;
}

const sampleUser = { id: "user-1", email: "owner@example.com" };

const verifiedFactor = {
  id: "factor-verified",
  factor_type: "totp" as const,
  status: "verified" as const,
  friendly_name: "HTBF Authenticator",
  created_at: "2024-02-01T00:00:00Z",
  updated_at: "2024-02-01T00:00:00Z",
};

const unverifiedFactor = {
  id: "factor-unverified",
  factor_type: "totp" as const,
  status: "unverified" as const,
  friendly_name: "HTBF Authenticator",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("validateTotpVerificationCode", () => {
  it("requires a 6-digit code", () => {
    expect(validateTotpVerificationCode("123")).toEqual({
      ok: false,
      code: "validation_error",
      message: "Enter the 6-digit code from your authenticator app.",
    });
  });

  it("accepts a valid 6-digit code", () => {
    expect(validateTotpVerificationCode("123456")).toEqual({
      ok: true,
      code: "123456",
    });
  });
});

describe("factor helpers", () => {
  it("lists only unverified TOTP factors from all factors", () => {
    expect(
      listUnverifiedTotpFactors([
        verifiedFactor,
        unverifiedFactor,
        {
          ...verifiedFactor,
          id: "phone-factor",
          factor_type: "phone",
        },
      ])
    ).toEqual([unverifiedFactor]);
  });

  it("selects the earliest verified factor deterministically", () => {
    const later = {
      ...verifiedFactor,
      id: "factor-later",
      created_at: "2024-03-01T00:00:00Z",
    };

    expect(
      selectPrimaryVerifiedTotpFactor([later, verifiedFactor])?.id
    ).toBe("factor-verified");
  });

  it("selects the earliest unverified factor deterministically", () => {
    const later = {
      ...unverifiedFactor,
      id: "factor-unverified-later",
      created_at: "2024-02-01T00:00:00Z",
    };

    expect(
      selectPrimaryUnverifiedTotpFactor([later, unverifiedFactor])?.id
    ).toBe("factor-unverified");
  });

  it("formats created_at when available", () => {
    expect(formatTotpFactorCreatedAt("2024-02-01T00:00:00Z")).toBeTruthy();
    expect(formatTotpFactorCreatedAt(undefined)).toBeNull();
  });
});

describe("formatTwoFactorAuthError", () => {
  it("sanitizes enrollment unavailable errors", () => {
    expect(
      formatTwoFactorAuthError({ code: "mfa_totp_enroll_not_enabled" })
    ).toContain("enrollment is unavailable");
  });

  it("sanitizes insufficient AAL errors", () => {
    expect(formatTwoFactorAuthError({ code: "insufficient_aal" })).toContain(
      "Verify your authenticator app again"
    );
  });

  it("does not expose raw token values", () => {
    const message = formatTwoFactorAuthError({
      message: "access_token invalid refresh_token leaked",
    });

    expect(message).not.toContain("access_token");
    expect(message).not.toContain("refresh_token");
  });
});

describe("loadTwoFactorAuthSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects logged-out users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await loadTwoFactorAuthSnapshot(createClient());

    expect(result).toEqual({
      ok: false,
      code: "not_authenticated",
      message:
        "Please sign in again before managing two-factor authentication.",
    });
  });

  it("derives MFA status from Supabase factors and AAL", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: {
        all: [verifiedFactor, unverifiedFactor],
        totp: [verifiedFactor],
      },
      error: null,
    });

    const result = await loadTwoFactorAuthSnapshot(createClient());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.verifiedTotpFactors).toEqual([verifiedFactor]);
      expect(result.snapshot.unverifiedTotpFactors).toEqual([unverifiedFactor]);
      expect(result.snapshot.assurance).toEqual({
        currentLevel: "aal1",
        nextLevel: "aal2",
      });
    }
  });
});

describe("beginTotpEnrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls enroll exactly once with factorType totp", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    });
    mockEnroll.mockResolvedValue({
      data: {
        id: "factor-new",
        type: "totp",
        totp: {
          qr_code: "data:image/svg+xml;utf-8,svg",
          secret: "SECRET123",
          uri: "otpauth://totp/test",
        },
      },
      error: null,
    });

    const result = await beginTotpEnrollment(createClient());

    expect(mockEnroll).toHaveBeenCalledTimes(1);
    expect(mockEnroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: "HTBF Authenticator",
    });
    expect(result).toEqual({
      ok: true,
      enrollment: {
        factorId: "factor-new",
        qrCode: "data:image/svg+xml;utf-8,svg",
        secret: "SECRET123",
        friendlyName: undefined,
      },
    });
  });

  it("blocks a new enroll when an incomplete factor already exists", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: { all: [unverifiedFactor], totp: [] },
      error: null,
    });

    const result = await beginTotpEnrollment(createClient());

    expect(mockEnroll).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      code: "incomplete_enrollment_exists",
      message: TWO_FACTOR_INCOMPLETE_ENROLLMENT_MESSAGE,
    });
  });
});

describe("verifyTotpEnrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not enable MFA on invalid code", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: { all: [unverifiedFactor], totp: [] },
      error: null,
    });
    mockChallenge.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mockVerify.mockResolvedValue({
      data: null,
      error: { message: "Invalid verification code" },
    });

    const result = await verifyTotpEnrollment(
      createClient(),
      "factor-unverified",
      "000000"
    );

    expect(result.ok).toBe(false);
  });

  it("requires AAL2 after successful verification", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockGetAal
      .mockResolvedValueOnce({
        data: { currentLevel: "aal1", nextLevel: "aal1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { currentLevel: "aal2", nextLevel: "aal2" },
        error: null,
      });
    mockListFactors.mockResolvedValue({
      data: { all: [unverifiedFactor], totp: [] },
      error: null,
    });
    mockChallenge.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mockVerify.mockResolvedValue({ data: { access_token: "token" }, error: null });

    const result = await verifyTotpEnrollment(
      createClient(),
      "factor-unverified",
      "123456"
    );

    expect(result).toEqual({ ok: true });
  });
});

describe("cancelTotpEnrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unenrolls only the targeted unverified factor", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: { all: [unverifiedFactor], totp: [] },
      error: null,
    });
    mockUnenroll.mockResolvedValue({ data: { id: "factor-unverified" }, error: null });

    const result = await cancelTotpEnrollment(
      createClient(),
      "factor-unverified"
    );

    expect(result).toEqual({ ok: true });
    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: "factor-unverified" });
  });
});

describe("disableVerifiedTotpFactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks disable from AAL1", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: { all: [verifiedFactor], totp: [verifiedFactor] },
      error: null,
    });

    const result = await disableVerifiedTotpFactor(
      createClient(),
      "factor-verified"
    );

    expect(result).toEqual({
      ok: false,
      code: "insufficient_aal",
      message:
        "Verify your authenticator app again before disabling two-factor authentication.",
    });
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it("unenrolls only the targeted verified factor at AAL2", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    mockListFactors.mockResolvedValue({
      data: {
        all: [verifiedFactor, { ...verifiedFactor, id: "factor-verified-2" }],
        totp: [verifiedFactor, { ...verifiedFactor, id: "factor-verified-2" }],
      },
      error: null,
    });
    mockUnenroll.mockResolvedValue({ data: { id: "factor-verified" }, error: null });
    mockRefreshSession.mockResolvedValue({ data: {}, error: null });

    const result = await disableVerifiedTotpFactor(
      createClient(),
      "factor-verified"
    );

    expect(result).toEqual({ ok: true });
    expect(mockUnenroll).toHaveBeenCalledTimes(1);
    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: "factor-verified" });
    expect(mockRefreshSession).toHaveBeenCalled();
  });
});

describe("stepUpTotpForDisable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires successful verification before disable", async () => {
    mockChallenge.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mockVerify.mockResolvedValue({
      data: null,
      error: { message: "Invalid verification code" },
    });

    const result = await stepUpTotpForDisable(
      createClient(),
      "factor-verified",
      "000000"
    );

    expect(result.ok).toBe(false);
  });

  it("returns readyToDisable after AAL2 step-up", async () => {
    mockChallenge.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mockVerify.mockResolvedValue({ data: { access_token: "token" }, error: null });
    mockGetAal.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    const result = await stepUpTotpForDisable(
      createClient(),
      "factor-verified",
      "123456"
    );

    expect(result).toEqual({ ok: true, readyToDisable: true });
  });
});

describe("two-factor authentication page wiring", () => {
  const sectionPage = readFileSync("app/profile/[section]/page.tsx", "utf8");
  const helperSource = readFileSync(
    "lib/accountCenter/twoFactorAuthentication.ts",
    "utf8"
  );

  function twoFactorSectionSource() {
    return sectionPage
      .split("function TwoFactorAuthenticationSection()")[1]
      ?.split("function NotificationSettingsSection()")[0];
  }

  it("routes /profile/two-factor-authentication to the live section", () => {
    expect(sectionPage).toContain(
      'if (section === "two-factor-authentication")'
    );
    expect(sectionPage).toContain("<TwoFactorAuthenticationSection />");
  });

  it("requires authentication via getUser()", () => {
    const source = twoFactorSectionSource();
    expect(source).toContain("loadTwoFactorAuthSnapshot");
    expect(source).toContain('router.push("/login")');
  });

  it("uses native Supabase enroll, verify, and unenroll APIs", () => {
    const source = twoFactorSectionSource();
    expect(source).toContain("beginTotpEnrollment");
    expect(source).toContain("verifyTotpEnrollment");
    expect(source).toContain("cancelTotpEnrollment");
    expect(source).toContain("disableVerifiedTotpFactor");
    expect(source).not.toContain("mfa.enroll(");
    expect(source).not.toContain("admin.mfa");
  });

  it("does not persist secrets or log sensitive values", () => {
    expect(helperSource).not.toContain("console.log");
    expect(helperSource).not.toContain("localStorage");
    expect(helperSource).not.toContain("sessionStorage");
    expect(helperSource).not.toContain(".from(");
    expect(twoFactorSectionSource()).not.toContain("console.log");
    expect(twoFactorSectionSource()).not.toContain("localStorage");
  });
});

describe("Phase 4C.6A regression protection", () => {
  const loginPage = readFileSync("app/login/page.tsx", "utf8");
  const guardSource = readFileSync("components/MfaChallengeGuard.tsx", "utf8");
  const routesSource = readFileSync(
    "lib/navigation/loggedInShellRoutes.ts",
    "utf8"
  );

  it("keeps login AAL gate and central guard wired", () => {
    expect(loginPage).toContain("requiresMfaChallenge");
    expect(loginPage).toContain('window.location.href = "/mfa-challenge"');
    expect(guardSource).toContain('router.replace("/mfa-challenge")');
    expect(routesSource).toContain('"/mfa-challenge"');
  });

  it("keeps existing Account Center security sections intact", () => {
    const sectionPage = readFileSync("app/profile/[section]/page.tsx", "utf8");
    expect(sectionPage).toContain("<ActiveSessionsSection />");
    expect(sectionPage).toContain("<ChangePasswordSection />");
    expect(sectionPage).toContain("<ChangeEmailSection />");
    expect(sectionPage).toContain("<AccountInfoSection />");
    expect(sectionPage).toContain("<AccountCenterDeleteAccountModal");
  });
});

describe("helper hygiene", () => {
  const helperSource = readFileSync(
    "lib/accountCenter/twoFactorAuthentication.ts",
    "utf8"
  );

  it("does not generate recovery codes or use admin APIs", () => {
    expect(helperSource).not.toContain("recovery");
    expect(helperSource).not.toContain("admin.mfa");
    expect(helperSource).not.toContain("service_role");
  });
});
