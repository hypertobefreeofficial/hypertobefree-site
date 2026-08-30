import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMAIL_CHANGE_DUAL_CONFIRMATION_NOTE,
  HTBF_MAX_EMAIL_LENGTH,
  formatEmailChangeVerificationMessage,
  formatEmailUpdateError,
  normalizeEmail,
  requestAuthenticatedEmailChange,
  resolveEmailChangeOutcome,
  validateEmailChangeInput,
} from "./changeEmail";

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockFrom = vi.fn();

function createClient() {
  return {
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
    from: mockFrom,
  } as never;
}

describe("validateEmailChangeInput", () => {
  const currentEmail = "owner@example.com";

  it("rejects an empty new email", () => {
    expect(
      validateEmailChangeInput({ currentEmail, newEmail: "", confirmEmail: "" })
    ).toEqual({ ok: false, message: "Please enter your new email address." });
  });

  it("rejects a missing confirmation", () => {
    expect(
      validateEmailChangeInput({
        currentEmail,
        newEmail: "new@example.com",
        confirmEmail: "  ",
      })
    ).toEqual({
      ok: false,
      message: "Please confirm your new email address.",
    });
  });

  it("rejects an invalid email format", () => {
    expect(
      validateEmailChangeInput({
        currentEmail,
        newEmail: "not-an-email",
        confirmEmail: "not-an-email",
      })
    ).toEqual({ ok: false, message: "Please enter a valid email address." });
  });

  it("rejects oversized email values", () => {
    const oversized = `${"a".repeat(HTBF_MAX_EMAIL_LENGTH)}@example.com`;

    expect(
      validateEmailChangeInput({
        currentEmail,
        newEmail: oversized,
        confirmEmail: oversized,
      })
    ).toEqual({ ok: false, message: "That email address is too long." });
  });

  it("rejects a confirmation mismatch", () => {
    expect(
      validateEmailChangeInput({
        currentEmail,
        newEmail: "new@example.com",
        confirmEmail: "other@example.com",
      })
    ).toEqual({ ok: false, message: "The email addresses do not match." });
  });

  it("rejects an email that already matches the current sign-in email", () => {
    expect(
      validateEmailChangeInput({
        currentEmail,
        newEmail: "  OWNER@Example.com ",
        confirmEmail: "owner@example.com",
      })
    ).toEqual({
      ok: false,
      message: "That is already your current sign-in email.",
    });
  });

  it("normalizes casing and whitespace for valid input", () => {
    expect(
      validateEmailChangeInput({
        currentEmail,
        newEmail: "  New.Address@Example.COM ",
        confirmEmail: "new.address@example.com",
      })
    ).toEqual({ ok: true, email: "new.address@example.com" });
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Mixed@Case.COM ")).toBe("mixed@case.com");
  });
});

describe("email change dual-confirmation copy", () => {
  it("explains that verification links go to both current and new email addresses", () => {
    expect(EMAIL_CHANGE_DUAL_CONFIRMATION_NOTE).toContain(
      "both your current sign-in email and your new email address"
    );
    expect(EMAIL_CHANGE_DUAL_CONFIRMATION_NOTE).toContain(
      "confirm the change from both addresses"
    );
  });

  it("states that both addresses must be confirmed before sign-in email updates", () => {
    const message = formatEmailChangeVerificationMessage("new@example.com");

    expect(message).toContain(
      "We sent verification links to your current sign-in email and to new@example.com"
    );
    expect(message).toContain(
      "You must confirm the change from both email addresses before your sign-in email will update"
    );
    expect(message).toContain(
      "Until then, keep signing in with your current email"
    );
    expect(message).not.toContain("Your sign-in email was updated");
  });
});

describe("formatEmailUpdateError", () => {
  it("maps session failures to a safe message", () => {
    expect(formatEmailUpdateError({ message: "JWT expired" })).toBe(
      "Your session expired. Please sign in again before changing your email."
    );
  });

  it("maps already-registered failures without leaking internals", () => {
    const message = formatEmailUpdateError({
      message: "A user with this email address has already been registered",
    });

    expect(message).toBe(
      "That email address cannot be used for HTBF. Please try a different one."
    );
    expect(message).not.toContain("registered");
  });

  it("returns a generic safe message for other failures", () => {
    const message = formatEmailUpdateError({
      message: "AuthApiError: internal postgres detail",
    });

    expect(message).toBe(
      "Could not start your email change right now. Please try again."
    );
    expect(message).not.toContain("postgres");
  });
});

describe("resolveEmailChangeOutcome", () => {
  it("reports verification pending while Supabase keeps the old email active", () => {
    expect(
      resolveEmailChangeOutcome("new@example.com", {
        email: "owner@example.com",
        new_email: "new@example.com",
      })
    ).toEqual({
      ok: true,
      verificationRequired: true,
      pendingEmail: "new@example.com",
    });
  });

  it("does not claim an immediate change when Supabase returns the old email", () => {
    const outcome = resolveEmailChangeOutcome("new@example.com", {
      email: "owner@example.com",
    });

    expect(outcome.verificationRequired).toBe(true);
  });

  it("reports immediate success only when the active email already matches", () => {
    expect(
      resolveEmailChangeOutcome("new@example.com", {
        email: "new@example.com",
        new_email: null,
      })
    ).toEqual({
      ok: true,
      verificationRequired: false,
      pendingEmail: "new@example.com",
    });
  });
});

describe("requestAuthenticatedEmailChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects logged-out users before touching Supabase Auth", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await requestAuthenticatedEmailChange(createClient(), {
      newEmail: "new@example.com",
      confirmEmail: "new@example.com",
    });

    expect(result).toEqual({
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before changing your email.",
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("reads the current email from Supabase Auth rather than profiles", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "auth@example.com" } },
    });

    const result = await requestAuthenticatedEmailChange(createClient(), {
      newEmail: "auth@example.com",
      confirmEmail: "auth@example.com",
    });

    expect(result).toEqual({
      ok: false,
      code: "validation_error",
      message: "That is already your current sign-in email.",
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("calls Supabase Auth email update for a valid request", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockUpdateUser.mockResolvedValue({
      data: {
        user: { email: "owner@example.com", new_email: "new@example.com" },
      },
      error: null,
    });

    const result = await requestAuthenticatedEmailChange(createClient(), {
      newEmail: " New@Example.com ",
      confirmEmail: "new@example.com",
      emailRedirectTo: "https://hypertobefree-site.vercel.app/profile/account-info",
    });

    expect(mockUpdateUser).toHaveBeenCalledWith(
      { email: "new@example.com" },
      {
        emailRedirectTo:
          "https://hypertobefree-site.vercel.app/profile/account-info",
      }
    );
    expect(result).toEqual({
      ok: true,
      verificationRequired: true,
      pendingEmail: "new@example.com",
    });
  });

  it("never writes the email to a database table", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockUpdateUser.mockResolvedValue({
      data: { user: { email: "owner@example.com", new_email: "new@example.com" } },
      error: null,
    });

    await requestAuthenticatedEmailChange(createClient(), {
      newEmail: "new@example.com",
      confirmEmail: "new@example.com",
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does not accept a client-supplied user id for the update", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "authenticated-user", email: "owner@example.com" } },
    });
    mockUpdateUser.mockResolvedValue({
      data: { user: { email: "owner@example.com", new_email: "new@example.com" } },
      error: null,
    });

    await requestAuthenticatedEmailChange(createClient(), {
      newEmail: "new@example.com",
      confirmEmail: "new@example.com",
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({ email: "new@example.com" }, {});
    expect(JSON.stringify(mockUpdateUser.mock.calls[0])).not.toContain(
      "authenticated-user"
    );
  });

  it("returns a safe error when Supabase rejects the change", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockUpdateUser.mockResolvedValue({
      data: null,
      error: { message: "AuthApiError: service_role token detail" },
    });

    const result = await requestAuthenticatedEmailChange(createClient(), {
      newEmail: "new@example.com",
      confirmEmail: "new@example.com",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.code).toBe("auth_error");
      expect(result.message).toBe(
        "Could not start your email change right now. Please try again."
      );
      expect(JSON.stringify(result)).not.toContain("service_role");
    }
  });
});

describe("change email page wiring", () => {
  const sectionPage = readFileSync("app/profile/[section]/page.tsx", "utf8");

  function changeEmailSectionSource() {
    return sectionPage
      .split("function ChangeEmailSection()")[1]
      ?.split("function ChangePasswordSection()")[0];
  }

  it("routes /profile/change-email to the live section", () => {
    expect(sectionPage).toContain('if (section === "change-email")');
    expect(sectionPage).toContain("<ChangeEmailSection />");
  });

  it("blocks duplicate submissions while saving", () => {
    const source = changeEmailSectionSource();

    expect(source).toContain("if (saving || success)");
    expect(source).toContain("disabled={saving || success}");
  });

  it("shows dual-confirmation verification messaging instead of claiming immediate change", () => {
    const source = changeEmailSectionSource();

    expect(source).toContain("result.verificationRequired");
    expect(source).toContain("formatEmailChangeVerificationMessage");
    expect(source).toContain("EMAIL_CHANGE_DUAL_CONFIRMATION_NOTE");
  });

  it("uses a trusted same-origin redirect and never a client-supplied URL", () => {
    const source = changeEmailSectionSource();

    expect(source).toContain(
      "emailRedirectTo: `${window.location.origin}/profile/account-info`"
    );
    expect(source).not.toContain("searchParams");
  });

  it("reads the current email from Supabase Auth and not from profiles", () => {
    const source = changeEmailSectionSource();

    expect(source).toContain("supabase.auth.getUser()");
    expect(source).toContain("setCurrentEmail(user.email ?? \"\")");
    expect(source).not.toContain('.from("profiles")');
  });

  it("does not log email values", () => {
    const helperSource = readFileSync(
      "lib/accountCenter/changeEmail.ts",
      "utf8"
    );

    expect(helperSource).not.toContain("console.log");
    expect(helperSource).not.toContain(".from(");
    expect(changeEmailSectionSource()).not.toContain("console.log");
  });
});

describe("existing Account & Security features remain wired", () => {
  const sectionPage = readFileSync("app/profile/[section]/page.tsx", "utf8");

  it("keeps Account Info, Change Password, and Delete Account intact", () => {
    expect(sectionPage).toContain('if (section === "account-info")');
    expect(sectionPage).toContain("<AccountInfoSection />");
    expect(sectionPage).toContain('if (section === "change-password")');
    expect(sectionPage).toContain("<ChangePasswordSection />");
    expect(sectionPage).toContain("<AccountCenterDeleteAccountModal");
  });

  it("does not introduce a public sign-in email surface", () => {
    const publicProfileSources = [
      "components/community-feed/CommunityFeedPostHeader.tsx",
      "components/community-feed/FeedListItem.tsx",
    ];

    publicProfileSources.forEach((path) => {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("user.email");
      expect(source).not.toContain("new_email");
    });
  });
});
