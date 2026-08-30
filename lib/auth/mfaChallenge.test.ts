import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeMfaReturnPath,
  formatMfaVerifyError,
  isSafeMfaReturnPath,
  MFA_DEFAULT_RETURN_TO,
  MFA_GUARD_EXCLUDED_ROUTES,
  MFA_INVALID_CODE_MESSAGE,
  MFA_RETURN_TO_STORAGE_KEY,
  MFA_SESSION_EXPIRED_MESSAGE,
  peekMfaReturnPath,
  requiresMfaChallenge,
  resolveMfaReturnPath,
  saveMfaReturnPath,
  selectVerifiedTotpFactor,
  shouldEnforceMfaChallenge,
  signOutLocalFromMfaChallenge,
  verifyMfaTotpCode,
} from "./mfaChallenge";
import {
  publicRoutesWithoutLoggedInShell,
  shouldUseLoggedInShell,
} from "../navigation/loggedInShellRoutes";

const mockGetAuthenticatorAssuranceLevel = vi.fn();
const mockListFactors = vi.fn();
const mockChallenge = vi.fn();
const mockVerify = vi.fn();
const mockSignOut = vi.fn();

function createClient() {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: mockGetAuthenticatorAssuranceLevel,
        listFactors: mockListFactors,
        challenge: mockChallenge,
        verify: mockVerify,
      },
      signOut: mockSignOut,
    },
  } as never;
}

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
}

describe("isSafeMfaReturnPath", () => {
  it("accepts safe internal destinations", () => {
    expect(isSafeMfaReturnPath("/feed")).toBe(true);
    expect(isSafeMfaReturnPath("/account?setup=1")).toBe(true);
    expect(isSafeMfaReturnPath("/profile/account-info")).toBe(true);
  });

  it("rejects unsafe destinations", () => {
    expect(isSafeMfaReturnPath("//evil.com")).toBe(false);
    expect(isSafeMfaReturnPath("https://evil.com")).toBe(false);
    expect(isSafeMfaReturnPath("http://evil.com")).toBe(false);
    expect(isSafeMfaReturnPath("/redirect?next=https://evil.com")).toBe(false);
    expect(isSafeMfaReturnPath("javascript:alert(1)")).toBe(false);
    expect(isSafeMfaReturnPath("data:text/html,hello")).toBe(false);
    expect(isSafeMfaReturnPath("")).toBe(false);
    expect(isSafeMfaReturnPath(null)).toBe(false);
  });
});

describe("resolveMfaReturnPath", () => {
  it("returns safe paths unchanged", () => {
    expect(resolveMfaReturnPath("/feed")).toBe("/feed");
    expect(resolveMfaReturnPath("/account?setup=1")).toBe("/account?setup=1");
  });

  it("falls back to /feed for invalid paths", () => {
    expect(resolveMfaReturnPath("//evil.com")).toBe(MFA_DEFAULT_RETURN_TO);
    expect(resolveMfaReturnPath("https://evil.com")).toBe(MFA_DEFAULT_RETURN_TO);
    expect(resolveMfaReturnPath("javascript:alert(1)")).toBe(
      MFA_DEFAULT_RETURN_TO
    );
    expect(resolveMfaReturnPath("data:text/html,hello")).toBe(
      MFA_DEFAULT_RETURN_TO
    );
  });
});

describe("requiresMfaChallenge", () => {
  it("requires challenge when nextLevel is aal2 and currentLevel is not", () => {
    expect(
      requiresMfaChallenge({ currentLevel: "aal1", nextLevel: "aal2" })
    ).toBe(true);
  });

  it("does not require challenge when MFA is not enrolled", () => {
    expect(
      requiresMfaChallenge({ currentLevel: "aal1", nextLevel: "aal1" })
    ).toBe(false);
  });

  it("does not require challenge when already at aal2", () => {
    expect(
      requiresMfaChallenge({ currentLevel: "aal2", nextLevel: "aal2" })
    ).toBe(false);
  });
});

describe("MFA return-path storage", () => {
  it("stores only sanitized internal destinations", () => {
    const storage = createStorage();

    saveMfaReturnPath("/account?setup=1", storage);
    expect(storage.setItem).toHaveBeenCalledWith(
      MFA_RETURN_TO_STORAGE_KEY,
      "/account?setup=1"
    );

    saveMfaReturnPath("https://evil.com", storage);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      MFA_RETURN_TO_STORAGE_KEY,
      MFA_DEFAULT_RETURN_TO
    );
  });

  it("consumes and clears the stored destination", () => {
    const storage = createStorage({
      [MFA_RETURN_TO_STORAGE_KEY]: "/feed",
    });

    expect(consumeMfaReturnPath(storage)).toBe("/feed");
    expect(storage.removeItem).toHaveBeenCalledWith(MFA_RETURN_TO_STORAGE_KEY);
    expect(peekMfaReturnPath(storage)).toBe(MFA_DEFAULT_RETURN_TO);
  });
});

describe("selectVerifiedTotpFactor", () => {
  it("selects the first verified TOTP factor", () => {
    const factor = selectVerifiedTotpFactor({
      totp: [
        {
          id: "factor-1",
          factor_type: "totp",
          status: "verified",
          friendly_name: "Primary phone",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
    });

    expect(factor?.id).toBe("factor-1");
  });

  it("returns null when no verified TOTP factor exists", () => {
    expect(selectVerifiedTotpFactor({ totp: [] })).toBeNull();
    expect(selectVerifiedTotpFactor(null)).toBeNull();
  });
});

describe("formatMfaVerifyError", () => {
  it("sanitizes invalid code errors", () => {
    expect(formatMfaVerifyError({ message: "Invalid TOTP code entered" })).toBe(
      MFA_INVALID_CODE_MESSAGE
    );
  });

  it("sanitizes session expiry errors", () => {
    expect(formatMfaVerifyError({ message: "JWT expired" })).toBe(
      MFA_SESSION_EXPIRED_MESSAGE
    );
  });

  it("sanitizes rate-limit errors", () => {
    expect(formatMfaVerifyError({ message: "over_request_rate_limit" })).toBe(
      "Too many attempts. Please wait a moment and try again."
    );
  });
});

describe("verifyMfaTotpCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a challenge and verifies the TOTP code", async () => {
    mockChallenge.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mockVerify.mockResolvedValue({ data: { access_token: "token" }, error: null });

    const result = await verifyMfaTotpCode(createClient(), "factor-1", "123456");

    expect(result).toEqual({ ok: true });
    expect(mockChallenge).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(mockVerify).toHaveBeenCalledWith({
      factorId: "factor-1",
      challengeId: "challenge-1",
      code: "123456",
    });
  });

  it("returns a safe error for invalid codes without retry loops", async () => {
    mockChallenge.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null,
    });
    mockVerify.mockResolvedValue({
      data: null,
      error: { message: "Invalid verification code" },
    });

    const result = await verifyMfaTotpCode(createClient(), "factor-1", "000000");

    expect(result).toEqual({
      ok: false,
      message: MFA_INVALID_CODE_MESSAGE,
      sessionExpired: false,
    });
  });
});

describe("signOutLocalFromMfaChallenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the return path and signs out locally only", async () => {
    const storage = createStorage({
      [MFA_RETURN_TO_STORAGE_KEY]: "/feed",
    });
    mockSignOut.mockResolvedValue({ error: null });

    await signOutLocalFromMfaChallenge(createClient(), storage);

    expect(storage.removeItem).toHaveBeenCalledWith(MFA_RETURN_TO_STORAGE_KEY);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockSignOut).not.toHaveBeenCalledWith({ scope: "global" });
  });
});

describe("shouldEnforceMfaChallenge", () => {
  it("enforces MFA on logged-in shell routes", () => {
    expect(shouldEnforceMfaChallenge("/feed")).toBe(true);
    expect(shouldEnforceMfaChallenge("/profile/account-info")).toBe(true);
  });

  it("does not enforce MFA on public auth routes", () => {
    MFA_GUARD_EXCLUDED_ROUTES.forEach((route) => {
      expect(shouldEnforceMfaChallenge(route)).toBe(false);
    });
    expect(shouldEnforceMfaChallenge("/")).toBe(false);
    expect(shouldEnforceMfaChallenge("/login")).toBe(false);
    expect(shouldEnforceMfaChallenge("/mfa-challenge")).toBe(false);
  });
});

describe("logged-in shell routing", () => {
  it("excludes /mfa-challenge from the logged-in app shell", () => {
    expect(publicRoutesWithoutLoggedInShell).toContain("/mfa-challenge");
    expect(shouldUseLoggedInShell("/mfa-challenge")).toBe(false);
  });
});

describe("login MFA gate wiring", () => {
  const loginPage = readFileSync("app/login/page.tsx", "utf8");

  it("checks AAL after password login before redirecting", () => {
    expect(loginPage).toContain("readMfaAssuranceState");
    expect(loginPage).toContain("requiresMfaChallenge");
    expect(loginPage).toContain('window.location.href = "/mfa-challenge"');
    expect(loginPage).toContain("saveMfaReturnPath");
  });

  it("preserves profile-setup destination when MFA is required", () => {
    expect(loginPage).toContain('"/account?setup=1"');
    expect(loginPage).toContain("continueAuthenticatedSession");
  });

  it("redirects existing AAL1 sessions that still require MFA", () => {
    expect(loginPage).toContain("checkExistingSession");
    expect(loginPage).toContain("requiresMfaChallenge(assurance)");
  });
});

describe("mfa-challenge page wiring", () => {
  const challengePage = readFileSync("app/mfa-challenge/page.tsx", "utf8");

  it("requires an authenticated session and verified TOTP factor", () => {
    expect(challengePage).toContain("supabase.auth.getUser()");
    expect(challengePage).toContain('window.location.href = "/login"');
    expect(challengePage).toContain("supabase.auth.mfa.listFactors()");
    expect(challengePage).toContain("selectVerifiedTotpFactor");
    expect(challengePage).toContain("MFA_NO_VERIFIED_FACTOR_MESSAGE");
  });

  it("uses native challenge and verify APIs", () => {
    expect(challengePage).toContain("verifyMfaTotpCode");
    expect(challengePage).not.toContain("mfa.enroll");
    expect(challengePage).not.toContain("unenroll");
    expect(challengePage).not.toContain("qr_code");
    expect(challengePage).not.toContain("console.log");
  });

  it("does not expose codes in URLs or persistent storage", () => {
    expect(challengePage).not.toContain("localStorage");
    expect(challengePage).not.toContain("searchParams");
    expect(challengePage).not.toMatch(/sessionStorage\.setItem\([^)]*verifyCode/);
    expect(challengePage).toContain("consumeMfaReturnPath(sessionStorage)");
  });

  it("uses local sign-out only", () => {
    expect(challengePage).toContain("signOutLocalFromMfaChallenge");
    expect(challengePage).not.toContain('signOut({ scope: "global" })');
    expect(challengePage).not.toContain("supabase.auth.signOut()");
  });
});

describe("central MFA guard wiring", () => {
  const guardSource = readFileSync("components/MfaChallengeGuard.tsx", "utf8");
  const shellSource = readFileSync("components/LoggedInAppShell.tsx", "utf8");

  it("redirects pending MFA sessions away from the logged-in shell", () => {
    expect(shellSource).toContain("<MfaChallengeGuard>");
    expect(guardSource).toContain("shouldEnforceMfaChallenge");
    expect(guardSource).toContain("requiresMfaChallenge");
    expect(guardSource).toContain('router.replace("/mfa-challenge")');
    expect(guardSource).toContain("saveMfaReturnPath");
  });

  it("does not add MFA guard logic to public auth routes", () => {
    expect(guardSource).toContain("shouldEnforceMfaChallenge");
    expect(guardSource).not.toContain("mfa.enroll");
  });
});

describe("Account Center MFA enrollment remains deferred", () => {
  const categoryContent = readFileSync(
    "lib/accountCenter/categoryContent.ts",
    "utf8"
  );
  const sectionPage = readFileSync("app/profile/[section]/page.tsx", "utf8");

  it("keeps the Two-Factor Authentication Soon badge", () => {
    expect(categoryContent).toContain('"Two-Factor Authentication"');
    expect(categoryContent).toContain('badge: "Soon"');
    expect(categoryContent).toContain(
      'href: "/profile/two-factor-authentication"'
    );
  });

  it("does not wire a live two-factor-authentication section yet", () => {
    expect(sectionPage).not.toContain('if (section === "two-factor-authentication")');
    expect(sectionPage).toContain('"two-factor-authentication"');
  });
});

describe("existing Account & Security features remain wired", () => {
  const sectionPage = readFileSync("app/profile/[section]/page.tsx", "utf8");

  it("keeps Account Info, Change Email, Change Password, Active Sessions, and Delete Account intact", () => {
    expect(sectionPage).toContain('if (section === "account-info")');
    expect(sectionPage).toContain("<AccountInfoSection />");
    expect(sectionPage).toContain('if (section === "change-email")');
    expect(sectionPage).toContain("<ChangeEmailSection />");
    expect(sectionPage).toContain('if (section === "change-password")');
    expect(sectionPage).toContain("<ChangePasswordSection />");
    expect(sectionPage).toContain('if (section === "active-sessions")');
    expect(sectionPage).toContain("<ActiveSessionsSection />");
    expect(sectionPage).toContain("<AccountCenterDeleteAccountModal");
  });
});

describe("mfaChallenge helper hygiene", () => {
  const helperSource = readFileSync("lib/auth/mfaChallenge.ts", "utf8");

  it("does not log TOTP codes or secrets", () => {
    expect(helperSource).not.toContain("console.log");
    expect(helperSource).not.toContain("mfa.enroll");
    expect(helperSource).not.toContain("qr_code");
    expect(helperSource).not.toContain("localStorage");
  });
});
