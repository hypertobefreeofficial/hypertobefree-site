import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  accountInfoRequiresAuthentication,
  formatAccountCreatedDate,
  formatSignInProvider,
  resolveAccountInfoDisplay,
  resolveEmailVerificationStatus,
  resolveSignInProvider,
} from "./accountInfo";

function buildAuthUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-123",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    created_at: "2026-06-18T20:38:25.000Z",
    app_metadata: {},
    user_metadata: {},
    identities: [
      {
        identity_id: "identity-1",
        id: "user-123",
        user_id: "user-123",
        provider: "email",
        identity_data: {},
        created_at: "2026-06-18T20:38:25.000Z",
        last_sign_in_at: "2026-06-18T20:38:25.000Z",
        updated_at: "2026-06-18T20:38:25.000Z",
      },
    ],
    ...overrides,
  } as User;
}

describe("resolveAccountInfoDisplay", () => {
  it("loads authenticated account info from auth and profile sources", () => {
    const display = resolveAccountInfoDisplay(buildAuthUser(), {
      display_name: "Lou Anthony",
      username: "louanthony",
    });

    expect(display.fields.map((field) => field.key)).toEqual([
      "signInEmail",
      "userId",
      "accountCreated",
      "username",
      "displayName",
      "signInProvider",
      "emailVerificationStatus",
    ]);
    expect(display.fields.find((field) => field.key === "signInEmail")?.value).toBe(
      "owner@example.com"
    );
    expect(display.fields.find((field) => field.key === "userId")?.value).toBe(
      "user-123"
    );
    expect(display.fields.find((field) => field.key === "username")?.value).toBe(
      "@louanthony"
    );
    expect(
      display.fields.find((field) => field.key === "displayName")?.value
    ).toBe("Lou Anthony");
  });

  it("sources sign-in email from Supabase Auth rather than profile data", () => {
    const display = resolveAccountInfoDisplay(
      buildAuthUser({ email: "auth-only@example.com" }),
      {
        display_name: "Lou Anthony",
        username: "louanthony",
      }
    );

    const emailField = display.fields.find((field) => field.key === "signInEmail");
    expect(emailField?.value).toBe("auth-only@example.com");
    expect(JSON.stringify(display.fields)).not.toContain("profile-email@example.com");
  });

  it("sources user id from the authenticated account", () => {
    const display = resolveAccountInfoDisplay(
      buildAuthUser({ id: "authenticated-user-id" }),
      null
    );

    expect(
      display.fields.find((field) => field.key === "userId")?.value
    ).toBe("authenticated-user-id");
  });

  it("formats account creation date when available", () => {
    const display = resolveAccountInfoDisplay(
      buildAuthUser({ created_at: "2026-06-18T20:38:25.000Z" }),
      null
    );

    expect(
      display.fields.find((field) => field.key === "accountCreated")?.value
    ).toBe(formatAccountCreatedDate("2026-06-18T20:38:25.000Z"));
  });

  it("degrades gracefully when optional metadata is unavailable", () => {
    const display = resolveAccountInfoDisplay(
      buildAuthUser({
        email: "owner@example.com",
        created_at: "invalid-date",
        identities: [],
        app_metadata: {},
        email_confirmed_at: undefined,
        confirmed_at: undefined,
      }),
      {
        display_name: "   ",
        username: null,
      }
    );

    expect(display.fields.map((field) => field.key)).toEqual([
      "signInEmail",
      "userId",
    ]);
    expect(JSON.stringify(display.fields)).not.toContain("undefined");
    expect(JSON.stringify(display.fields)).not.toContain("null");
  });

  it("does not expose private account info when authentication is missing", () => {
    expect(accountInfoRequiresAuthentication(null)).toBe(false);
    expect(accountInfoRequiresAuthentication(undefined)).toBe(false);
    expect(accountInfoRequiresAuthentication({} as User)).toBe(false);
  });
});

describe("resolveSignInProvider", () => {
  it("uses Supabase identity provider metadata when available", () => {
    expect(
      resolveSignInProvider(
        buildAuthUser({
          identities: [
            {
              identity_id: "identity-google",
              id: "google-user",
              user_id: "google-user",
              provider: "google",
              identity_data: {},
              created_at: "2026-06-18T20:38:25.000Z",
              last_sign_in_at: "2026-06-18T20:38:25.000Z",
              updated_at: "2026-06-18T20:38:25.000Z",
            },
          ],
        })
      )
    ).toBe("Google");
  });

  it("returns null when provider metadata is unavailable", () => {
    expect(
      resolveSignInProvider(
        buildAuthUser({
          identities: [],
          app_metadata: {},
        })
      )
    ).toBeNull();
  });
});

describe("resolveEmailVerificationStatus", () => {
  it("shows verified when Supabase exposes confirmation timestamps", () => {
    expect(
      resolveEmailVerificationStatus(
        buildAuthUser({
          email_confirmed_at: "2026-06-18T20:38:25.000Z",
        })
      )
    ).toBe("Verified");
  });

  it("shows not verified for email provider accounts without confirmation", () => {
    expect(
      resolveEmailVerificationStatus(
        buildAuthUser({
          email_confirmed_at: undefined,
          confirmed_at: undefined,
          identities: [
            {
              identity_id: "identity-email",
              id: "user-123",
              user_id: "user-123",
              provider: "email",
              identity_data: {},
              created_at: "2026-06-18T20:38:25.000Z",
              last_sign_in_at: "2026-06-18T20:38:25.000Z",
              updated_at: "2026-06-18T20:38:25.000Z",
            },
          ],
        })
      )
    ).toBe("Not verified");
  });

  it("omits verification status when Supabase does not expose reliable data", () => {
    expect(
      resolveEmailVerificationStatus(
        buildAuthUser({
          email_confirmed_at: undefined,
          confirmed_at: undefined,
          identities: [
            {
              identity_id: "identity-google",
              id: "google-user",
              user_id: "google-user",
              provider: "google",
              identity_data: {},
              created_at: "2026-06-18T20:38:25.000Z",
              last_sign_in_at: "2026-06-18T20:38:25.000Z",
              updated_at: "2026-06-18T20:38:25.000Z",
            },
          ],
        })
      )
    ).toBeNull();
  });
});

describe("formatSignInProvider", () => {
  it("formats known providers consistently", () => {
    expect(formatSignInProvider("email")).toBe("Email");
    expect(formatSignInProvider("GOOGLE")).toBe("Google");
  });
});

describe("public profile privacy", () => {
  it("does not include private sign-in email in profile-only display data", () => {
    const profileOnly = {
      display_name: "Lou Anthony",
      username: "louanthony",
    };

    expect(profileOnly).not.toHaveProperty("email");
    expect(JSON.stringify(profileOnly)).not.toContain("owner@example.com");
  });
});
