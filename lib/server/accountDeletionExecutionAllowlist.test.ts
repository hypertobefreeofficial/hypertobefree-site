import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS_ENV,
  evaluateAccountDeletionExecutionRequestAllowlist,
  parseAccountDeletionExecutionAllowlist,
} from "./accountDeletionExecutionAllowlist";

const REQUEST_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUEST_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("accountDeletionExecutionAllowlist", () => {
  it("rejects missing, empty, and whitespace-only configuration", () => {
    expect(parseAccountDeletionExecutionAllowlist(undefined)).toEqual({
      ok: false,
      code: "missing",
    });
    expect(parseAccountDeletionExecutionAllowlist("")).toEqual({
      ok: false,
      code: "empty",
    });
    expect(parseAccountDeletionExecutionAllowlist("   ")).toEqual({
      ok: false,
      code: "empty",
    });
  });

  it("rejects malformed UUID entries without partial acceptance", () => {
    expect(parseAccountDeletionExecutionAllowlist("not-a-uuid")).toEqual({
      ok: false,
      code: "malformed",
    });
    expect(
      parseAccountDeletionExecutionAllowlist(`${REQUEST_A},bad-entry`)
    ).toEqual({ ok: false, code: "malformed" });
  });

  it("rejects empty segments from trailing or duplicate commas", () => {
    expect(parseAccountDeletionExecutionAllowlist(`${REQUEST_A},`)).toEqual({
      ok: false,
      code: "malformed",
    });
    expect(parseAccountDeletionExecutionAllowlist(`${REQUEST_A},,${REQUEST_B}`)).toEqual(
      { ok: false, code: "malformed" }
    );
  });

  it("parses multiple valid UUIDs with surrounding whitespace", () => {
    const parsed = parseAccountDeletionExecutionAllowlist(
      ` ${REQUEST_A} , ${REQUEST_B} `
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    expect(parsed.allowedRequestIds.has(REQUEST_A.toLowerCase())).toBe(true);
    expect(parsed.allowedRequestIds.has(REQUEST_B.toLowerCase())).toBe(true);
    expect(parsed.allowedRequestIds.size).toBe(2);
  });

  it("requires exact UUID membership with case normalization only", () => {
    const env = {
      [ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS_ENV]: REQUEST_A.toUpperCase(),
    };
    expect(
      evaluateAccountDeletionExecutionRequestAllowlist(REQUEST_A, env)
    ).toEqual({ ok: true });
    expect(
      evaluateAccountDeletionExecutionRequestAllowlist(REQUEST_A.toUpperCase(), env)
    ).toEqual({ ok: true });

    expect(
      evaluateAccountDeletionExecutionRequestAllowlist(REQUEST_B, env)
    ).toEqual({ ok: false, code: "request_not_allowed" });
  });

  it("does not authorize by prefix or substring", () => {
    const env = {
      [ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS_ENV]: REQUEST_A,
    };
    expect(
      evaluateAccountDeletionExecutionRequestAllowlist(
        "cccccccc-cccc-4ccc-8ccc-cccccccccccd",
        env
      )
    ).toEqual({ ok: false, code: "request_not_allowed" });
    expect(
      evaluateAccountDeletionExecutionRequestAllowlist("req-1", env)
    ).toEqual({ ok: false, code: "request_not_allowed" });
  });

  it("fails closed when configuration is unset under evaluation", () => {
    expect(
      evaluateAccountDeletionExecutionRequestAllowlist(REQUEST_A, {})
    ).toEqual({ ok: false, code: "configuration_invalid" });
  });
});

describe("account deletion dry-run allowlist isolation", () => {
  it("does not require execution allowlist on dry-run handler", () => {
    const dryRun = readFileSync(
      "lib/server/accountDeletionDryRunHandler.ts",
      "utf8"
    );
    expect(dryRun).not.toContain("accountDeletionExecutionAllowlist");
    expect(dryRun).not.toContain("HTBF_ACCOUNT_DELETION_EXECUTION_ALLOWED_REQUEST_IDS");
  });
});
