import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_SESSIONS_EXPLANATORY_NOTE,
  ACTIVE_SESSIONS_OTHER_DEVICES_SUCCESS_MESSAGE,
  formatActiveSessionsError,
  formatSessionExpiration,
  resolveCurrentSessionDisplay,
  signOutCurrentSession,
  signOutEverywhere,
  signOutOtherSessions,
} from "./activeSessions";

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockSignOut = vi.fn();
const mockFrom = vi.fn();

function createClient() {
  return {
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
    from: mockFrom,
  } as never;
}

const sampleUser = {
  id: "user-1",
  email: "owner@example.com",
  app_metadata: { provider: "email" },
  identities: [{ provider: "email" }],
};

describe("formatSessionExpiration", () => {
  it("formats a unix expiry timestamp as a readable local date/time", () => {
    const formatted = formatSessionExpiration(1_700_000_000);
    expect(formatted).toBeTruthy();
    expect(formatted).toMatch(/2023/);
  });

  it("returns null for missing or invalid expiry values", () => {
    expect(formatSessionExpiration(undefined)).toBeNull();
    expect(formatSessionExpiration(null)).toBeNull();
    expect(formatSessionExpiration(Number.NaN)).toBeNull();
  });
});

describe("resolveCurrentSessionDisplay", () => {
  it("sources signed-in email from Supabase Auth", () => {
    const display = resolveCurrentSessionDisplay(sampleUser as never, {
      expires_at: 1_700_000_000,
    } as never);

    expect(display.signInEmail).toBe("owner@example.com");
    expect(display.signInProvider).toBe("Email");
    expect(display.sessionExpiresAt).toBeTruthy();
  });

  it("omits provider gracefully when Auth metadata is unavailable", () => {
    const display = resolveCurrentSessionDisplay(
      { id: "user-1", email: "owner@example.com" } as never,
      null
    );

    expect(display.signInProvider).toBeNull();
    expect(display.sessionExpiresAt).toBeNull();
  });
});

describe("formatActiveSessionsError", () => {
  it("returns a safe generic message for unknown failures", () => {
    const message = formatActiveSessionsError({
      message: "AuthApiError: postgres detail",
    });

    expect(message).toBe(
      "Could not update your HTBF sessions right now. Please try again."
    );
    expect(message).not.toContain("postgres");
  });
});

describe("scoped sign-out helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects logged-out users before calling signOut", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await signOutCurrentSession(createClient());

    expect(result).toEqual({
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before managing sessions.",
    });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('signs out the current session with scope "local"', async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await signOutCurrentSession(createClient());

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result).toEqual({ ok: true });
  });

  it('signs out other sessions with scope "others"', async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await signOutOtherSessions(createClient());

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "others" });
    expect(result).toEqual({ ok: true });
  });

  it('signs out everywhere with scope "global"', async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await signOutEverywhere(createClient());

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
    expect(result).toEqual({ ok: true });
  });

  it("never uses default signOut() without an explicit scope", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockSignOut.mockResolvedValue({ error: null });

    await signOutCurrentSession(createClient());
    await signOutOtherSessions(createClient());
    await signOutEverywhere(createClient());

    mockSignOut.mock.calls.forEach((call) => {
      expect(call[0]).toHaveProperty("scope");
    });
    expect(mockSignOut).not.toHaveBeenCalledWith();
  });

  it("does not write to the database", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockSignOut.mockResolvedValue({ error: null });

    await signOutOtherSessions(createClient());

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("sanitizes Supabase signOut failures", async () => {
    mockGetUser.mockResolvedValue({ data: { user: sampleUser } });
    mockSignOut.mockResolvedValue({
      error: { message: "AuthApiError: internal detail" },
    });

    const result = await signOutOtherSessions(createClient());

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("auth_error");
      expect(result.message).toBe(
        "Could not update your HTBF sessions right now. Please try again."
      );
    }
  });
});

describe("active sessions explanatory copy", () => {
  it("does not mention unsupported device metadata", () => {
    expect(ACTIVE_SESSIONS_EXPLANATORY_NOTE).toContain(
      "cannot currently display a detailed list"
    );
    expect(ACTIVE_SESSIONS_EXPLANATORY_NOTE).not.toMatch(/MacBook|Chrome|iPhone|Phoenix|IP/i);
  });

  it("confirms other-device success keeps the current session active", () => {
    expect(ACTIVE_SESSIONS_OTHER_DEVICES_SUCCESS_MESSAGE).toContain(
      "This browser session is still active"
    );
  });
});

describe("active sessions page wiring", () => {
  const sectionPage = readFileSync("app/profile/[section]/page.tsx", "utf8");
  const helperSource = readFileSync(
    "lib/accountCenter/activeSessions.ts",
    "utf8"
  );

  function activeSessionsSectionSource() {
    return sectionPage
      .split("function ActiveSessionsSection()")[1]
      ?.split("function ChangeEmailSection()")[0];
  }

  it("routes /profile/active-sessions to the live section", () => {
    expect(sectionPage).toContain('if (section === "active-sessions")');
    expect(sectionPage).toContain("<ActiveSessionsSection />");
  });

  it("requires authentication via getUser()", () => {
    const source = activeSessionsSectionSource();

    expect(source).toContain("supabase.auth.getUser()");
    expect(source).toContain('router.push("/login")');
    expect(source).not.toContain('.from("profiles")');
  });

  it("loads session expiration from getSession()", () => {
    const source = activeSessionsSectionSource();

    expect(source).toContain("supabase.auth.getSession()");
    expect(source).toContain("resolveCurrentSessionDisplay");
  });

  it("wires explicit scoped sign-out actions", () => {
    const source = activeSessionsSectionSource();

    expect(source).toContain("signOutCurrentSession");
    expect(source).toContain("signOutOtherSessions");
    expect(source).toContain("signOutEverywhere");
    expect(source).not.toContain("supabase.auth.signOut()");
  });

  it("requires confirmation before global sign-out", () => {
    const source = activeSessionsSectionSource();

    expect(source).toContain("confirmEverywhereOpen");
    expect(source).toContain("Sign out everywhere?");
  });

  it("redirects local and global sign-out to login", () => {
    const source = activeSessionsSectionSource();

    expect(source).toContain('router.push("/login")');
  });

  it("shows inline success for other-devices sign-out", () => {
    const source = activeSessionsSectionSource();

    expect(source).toContain("ACTIVE_SESSIONS_OTHER_DEVICES_SUCCESS_MESSAGE");
  });

  it("blocks duplicate submissions while an action is running", () => {
    const source = activeSessionsSectionSource();

    expect(source).toContain("if (actionInFlight)");
    expect(source).toContain("disabled={Boolean(actionInFlight)}");
  });

  it("does not use listSessions or revokeSession", () => {
    expect(helperSource).not.toContain("listSessions");
    expect(helperSource).not.toContain("revokeSession");
    expect(sectionPage).not.toContain("listSessions");
    expect(sectionPage).not.toContain("revokeSession");
  });

  it("does not log sensitive session values", () => {
    expect(helperSource).not.toContain("console.log");
    expect(activeSessionsSectionSource()).not.toContain("console.log");
  });
});

describe("existing Account & Security features remain wired", () => {
  const sectionPage = readFileSync("app/profile/[section]/page.tsx", "utf8");

  it("keeps Account Info, Change Email, Change Password, and Delete Account intact", () => {
    expect(sectionPage).toContain('if (section === "account-info")');
    expect(sectionPage).toContain("<AccountInfoSection />");
    expect(sectionPage).toContain('if (section === "change-email")');
    expect(sectionPage).toContain("<ChangeEmailSection />");
    expect(sectionPage).toContain('if (section === "change-password")');
    expect(sectionPage).toContain("<ChangePasswordSection />");
    expect(sectionPage).toContain("<AccountCenterDeleteAccountModal");
  });
});
