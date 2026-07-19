import { describe, expect, it, vi } from "vitest";
import {
  authenticationCallsPerVu,
  buildAuthSignInHeaders,
  maxAuthAttempts,
  shouldAbortAuthImmediately,
  shouldRetryAuth,
} from "./gateAAuthPolicy.mjs";
import {
  classifySupabaseAuthError,
  describeAuthUserState,
  findAuthUsersByEmail,
  parseUserPoolFirstEntry,
  sanitizeLogPayload,
  signInSyntheticUserWithOfficialClient,
  syncOneSyntheticUserPassword,
  textContainsCredentialLeak,
  validateSyntheticPoolEntry,
} from "./gateAAuth.mjs";

describe("Gate A synthetic pool password parsing", () => {
  it("parses the first pool row using the first comma only", () => {
    const csv = [
      "email,password",
      "loadtest_user_0001@staging.htbf.test,Lt-abc,with-comma",
      "loadtest_user_0002@staging.htbf.test,Lt-second",
    ].join("\n");

    expect(parseUserPoolFirstEntry(csv)).toEqual({
      email: "loadtest_user_0001@staging.htbf.test",
      password: "Lt-abc,with-comma",
    });
  });

  it("validates the approved synthetic email pattern", () => {
    const entry = parseUserPoolFirstEntry(
      "email,password\nloadtest_user_0001@staging.htbf.test,Lt-secret\n"
    );

    expect(validateSyntheticPoolEntry(entry)).toEqual({
      poolEntryExists: true,
      emailMatchesPattern: true,
      passwordNonEmpty: true,
    });
  });
});

describe("Gate A one-user password synchronization", () => {
  it("updates exactly one matching auth user and confirms email", async () => {
    const updateUserById = vi.fn(async () => ({ error: null }));
    const getUserById = vi.fn(async () => ({
      data: {
        user: {
          id: "user-1",
          email: "loadtest_user_0001@staging.htbf.test",
          email_confirmed_at: "2026-01-01T00:00:00.000Z",
          banned_until: null,
        },
      },
      error: null,
    }));

    const adminClient = {
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({
            data: {
              users: [
                {
                  id: "user-1",
                  email: "loadtest_user_0001@staging.htbf.test",
                  email_confirmed_at: null,
                  banned_until: null,
                },
              ],
            },
            error: null,
          })),
          updateUserById,
          getUserById,
        },
      },
    };

    const result = await syncOneSyntheticUserPassword(
      adminClient,
      "loadtest_user_0001@staging.htbf.test",
      "Lt-test-password"
    );

    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById.mock.calls[0][1]).toEqual({
      password: "Lt-test-password",
      email_confirm: true,
    });
    expect(result).toEqual({
      userFound: true,
      passwordUpdateSucceeded: true,
      emailConfirmed: true,
      userBanned: false,
    });
  });

  it("stops when more than one auth user matches the pool email", async () => {
    const adminClient = {
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({
            data: {
              users: [
                { id: "a", email: "loadtest_user_0001@staging.htbf.test" },
                { id: "b", email: "loadtest_user_0001@staging.htbf.test" },
              ],
            },
            error: null,
          })),
        },
      },
    };

    await expect(
      syncOneSyntheticUserPassword(
        adminClient,
        "loadtest_user_0001@staging.htbf.test",
        "Lt-test-password"
      )
    ).rejects.toThrow(/Ambiguous auth user match/i);
  });
});

describe("Gate A official-client authentication classification", () => {
  it("reports a successful session without leaking credentials", async () => {
    const anonClient = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: {
            session: { access_token: "token-value" },
            user: { id: "user-1" },
          },
          error: null,
        })),
      },
    };

    const result = await signInSyntheticUserWithOfficialClient(
      anonClient,
      "loadtest_user_0001@staging.htbf.test",
      "Lt-test-password"
    );

    expect(result.sessionReceived).toBe(true);
    expect(result.accessTokenReceived).toBe(true);
    expect(result.userReceived).toBe(true);
    expect(result.authenticationAttempts).toBe(1);
    expect(textContainsCredentialLeak(JSON.stringify(result))).toBe(false);
  });

  it("classifies invalid credentials safely", () => {
    expect(
      classifySupabaseAuthError({
        code: "invalid_credentials",
        message: "Invalid login credentials",
      })
    ).toEqual({
      code: "invalid_credentials",
      category: "invalid_credentials",
      message: "Invalid login credentials",
    });
  });

  it("classifies invalid API key safely", () => {
    expect(
      classifySupabaseAuthError({
        code: "invalid_api_key",
        message: "Invalid API key",
      })
    ).toEqual({
      code: "invalid_api_key",
      category: "invalid_api_key",
      message: "invalid API key",
    });
  });

  it("classifies email-not-confirmed safely", () => {
    expect(
      classifySupabaseAuthError({
        code: "email_not_confirmed",
        message: "Email not confirmed",
      })
    ).toEqual({
      code: "email_not_confirmed",
      category: "email_not_confirmed",
      message: "email not confirmed",
    });
  });

  it("classifies user-banned safely", () => {
    expect(
      classifySupabaseAuthError({
        code: "user_banned",
        message: "User is banned",
      })
    ).toEqual({
      code: "user_banned",
      category: "user_banned",
      message: "user banned",
    });
  });
});

describe("Gate A auth user state booleans", () => {
  it("detects confirmed and unbanned users", () => {
    expect(
      describeAuthUserState({
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        banned_until: null,
      })
    ).toEqual({
      authUserExists: true,
      emailConfirmed: true,
      userBanned: false,
    });
  });

  it("detects banned users without exposing identifiers", () => {
    expect(
      describeAuthUserState({
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        banned_until: "2099-01-01T00:00:00.000Z",
      }).userBanned
    ).toBe(true);
  });

  it("finds a single auth user by email case-insensitively", () => {
    const matches = findAuthUsersByEmail(
      [{ email: "LoadTest_User_0001@staging.htbf.test" }],
      "loadtest_user_0001@staging.htbf.test"
    );
    expect(matches).toHaveLength(1);
  });
});

describe("Gate A credential-safe logging", () => {
  it("rejects payloads that contain credential-like values", () => {
    expect(() =>
      sanitizeLogPayload({
        email: "loadtest_user_0001@staging.htbf.test",
      })
    ).toThrow(/credentials/i);
  });

  it("allows boolean-only diagnostic payloads", () => {
    expect(
      sanitizeLogPayload({
        poolChecks: {
          poolEntryExists: true,
          emailMatchesPattern: true,
          passwordNonEmpty: true,
        },
        signInResult: {
          sessionReceived: true,
          accessTokenReceived: true,
          userReceived: true,
          authenticationAttempts: 1,
        },
      })
    ).toBeTruthy();
  });
});

describe("Gate A k6 auth harness policy", () => {
  it("uses apikey and JSON content type for password sign-in", () => {
    expect(buildAuthSignInHeaders("anon-key-example")).toEqual({
      apikey: "anon-key-example",
      Authorization: "Bearer anon-key-example",
      "Content-Type": "application/json",
    });
  });

  it("aborts immediately on 400/401/403", () => {
    expect(shouldAbortAuthImmediately(401)).toBe(true);
    expect(shouldAbortAuthImmediately(403)).toBe(true);
    expect(shouldAbortAuthImmediately(500)).toBe(false);
  });

  it("retries only transient failures up to two times", () => {
    expect(maxAuthAttempts()).toBe(3);
    expect(shouldRetryAuth(503, 1)).toBe(true);
    expect(shouldRetryAuth(503, 3)).toBe(false);
    expect(shouldRetryAuth(401, 1)).toBe(false);
  });

  it("expects one authentication call per VU", () => {
    expect(authenticationCallsPerVu()).toBe(1);
  });
});
