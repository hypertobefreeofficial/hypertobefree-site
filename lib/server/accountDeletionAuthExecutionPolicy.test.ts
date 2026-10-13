import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_AUTH_EXECUTION_ENV_FLAG,
  isAccountDeletionAuthExecutionEnabled,
  isAccountDeletionPhysicalAuthExecutionEnabled,
} from "./accountDeletionAuthExecutionPolicy";

describe("accountDeletionAuthExecutionPolicy", () => {
  it("requires exact true for auth execution flag", () => {
    expect(
      isAccountDeletionAuthExecutionEnabled({
        [ACCOUNT_DELETION_AUTH_EXECUTION_ENV_FLAG]: "true",
      })
    ).toBe(true);
    expect(
      isAccountDeletionAuthExecutionEnabled({
        [ACCOUNT_DELETION_AUTH_EXECUTION_ENV_FLAG]: "false",
      })
    ).toBe(false);
    expect(isAccountDeletionAuthExecutionEnabled({})).toBe(false);
  });

  it("physical auth execution requires global and auth flags", () => {
    const both = {
      HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "true",
      [ACCOUNT_DELETION_AUTH_EXECUTION_ENV_FLAG]: "true",
    };
    expect(isAccountDeletionPhysicalAuthExecutionEnabled(both)).toBe(true);
    expect(
      isAccountDeletionPhysicalAuthExecutionEnabled({
        ...both,
        HTBF_ACCOUNT_DELETION_EXECUTION_ENABLED: "false",
      })
    ).toBe(false);
    expect(
      isAccountDeletionPhysicalAuthExecutionEnabled({
        ...both,
        [ACCOUNT_DELETION_AUTH_EXECUTION_ENV_FLAG]: "false",
      })
    ).toBe(false);
  });
});
