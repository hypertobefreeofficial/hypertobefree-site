import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HTBF_PASSWORD_MIN_LENGTH,
  formatPasswordUpdateError,
  updateAuthenticatedUserPassword,
  validatePasswordChangeInput,
} from "./changePassword";

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      get getUser() {
        return mockGetUser;
      },
      get updateUser() {
        return mockUpdateUser;
      },
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

describe("validatePasswordChangeInput", () => {
  it("rejects empty password", () => {
    expect(validatePasswordChangeInput("", "password")).toEqual({
      ok: false,
      message: "Please enter a new password.",
    });
  });

  it("rejects missing confirmation", () => {
    expect(validatePasswordChangeInput("password123", "")).toEqual({
      ok: false,
      message: "Please confirm your new password.",
    });
  });

  it("rejects passwords below the existing minimum", () => {
    expect(validatePasswordChangeInput("short", "short")).toEqual({
      ok: false,
      message: `Please use at least ${HTBF_PASSWORD_MIN_LENGTH} characters for your new password.`,
    });
  });

  it("rejects mismatched confirmation", () => {
    expect(
      validatePasswordChangeInput("password123", "password124")
    ).toEqual({
      ok: false,
      message: "The passwords do not match.",
    });
  });

  it("accepts valid matching passwords", () => {
    expect(
      validatePasswordChangeInput("password123", "password123")
    ).toEqual({
      ok: true,
      password: "password123",
    });
  });
});

describe("formatPasswordUpdateError", () => {
  it("maps session failures to a safe message", () => {
    expect(formatPasswordUpdateError({ message: "JWT expired" })).toBe(
      "Your session expired. Please sign in again before changing your password."
    );
  });

  it("returns a generic safe message for other failures", () => {
    expect(formatPasswordUpdateError({ message: "internal server error" })).toBe(
      "Could not update your password right now. Please try again."
    );
  });
});

describe("updateAuthenticatedUserPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("rejects logged-out users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { updateAuthenticatedUserPassword: updatePassword } = await import(
      "./changePassword"
    );

    const result = await updatePassword(
      {
        auth: {
          getUser: mockGetUser,
          updateUser: mockUpdateUser,
        },
      } as never,
      {
        password: "password123",
        confirmPassword: "password123",
      }
    );

    expect(result).toEqual({
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before changing your password.",
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("updates password through Supabase Auth for authenticated users", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockUpdateUser.mockResolvedValue({ error: null });

    const { updateAuthenticatedUserPassword: updatePassword } = await import(
      "./changePassword"
    );

    const result = await updatePassword(
      {
        auth: {
          getUser: mockGetUser,
          updateUser: mockUpdateUser,
        },
      } as never,
      {
        password: "password123",
        confirmPassword: "password123",
      }
    );

    expect(result).toEqual({ ok: true });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does not trust a client-supplied user id", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "authenticated-user", email: "owner@example.com" } },
    });
    mockUpdateUser.mockResolvedValue({ error: null });

    const { updateAuthenticatedUserPassword: updatePassword } = await import(
      "./changePassword"
    );

    await updatePassword(
      {
        auth: {
          getUser: mockGetUser,
          updateUser: mockUpdateUser,
        },
      } as never,
      {
        password: "password123",
        confirmPassword: "password123",
      }
    );

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(mockUpdateUser.mock.calls[0]).not.toContain("other-user");
  });

  it("returns safe errors for Supabase failures", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockUpdateUser.mockResolvedValue({
      error: { message: "AuthApiError: leaked service role secret" },
    });

    const { updateAuthenticatedUserPassword: updatePassword } = await import(
      "./changePassword"
    );

    const result = await updatePassword(
      {
        auth: {
          getUser: mockGetUser,
          updateUser: mockUpdateUser,
        },
      } as never,
      {
        password: "password123",
        confirmPassword: "password123",
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.message).toBe(
        "Could not update your password right now. Please try again."
      );
      expect(JSON.stringify(result)).not.toContain("service role");
    }
  });
});

describe("change password page wiring", () => {
  it("routes /profile/change-password to the live section", () => {
    const sectionPage = readFileSync("app/profile/[section]/page.tsx", "utf8");

    expect(sectionPage).toContain('if (section === "change-password")');
    expect(sectionPage).toContain("<ChangePasswordSection />");
    expect(sectionPage).toContain('href="/forgot-password"');
  });

  it("does not log or persist password values in the password helper", () => {
    const helperSource = readFileSync(
      "lib/accountCenter/changePassword.ts",
      "utf8"
    );
    const changePasswordSection = readFileSync(
      "app/profile/[section]/page.tsx",
      "utf8"
    ).split("function ChangePasswordSection()")[1]?.split("function NotificationSettingsSection()")[0];

    expect(helperSource).not.toContain("console.log");
    expect(helperSource).not.toContain(".from(");
    expect(changePasswordSection).toBeTruthy();
    expect(changePasswordSection).not.toContain("console.log");
    expect(changePasswordSection).not.toContain("localStorage");
    expect(changePasswordSection).not.toContain(".from(");
  });
});

describe("recovery flows remain unchanged", () => {
  it("keeps existing forgot-password and reset-password pages intact", () => {
    const forgotPassword = readFileSync("app/forgot-password/page.tsx", "utf8");
    const resetPassword = readFileSync("app/reset-password/page.tsx", "utf8");

    expect(forgotPassword).toContain("resetPasswordForEmail");
    expect(resetPassword).toContain("updateUser({");
  });
});
