import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_ACCOUNT_DELETION_STATUSES,
  ACCOUNT_DELETION_SUBMITTED_STATUS,
  buildAccountDeletionInsertRow,
  fetchActiveAccountDeletionRequest,
  formatAccountDeletionDatabaseError,
  submitAccountDeletionRequest,
  validateAccountDeletionSubmission,
} from "./accountDeletionRequest";

const sampleRequest = {
  id: "req-1",
  user_id: "user-1",
  email: "owner@example.com",
  reason: "Leaving HTBF",
  status: "submitted",
  created_at: "2026-06-07T09:47:07.000Z",
};

function createMockClient(options?: {
  activeRequest?: typeof sampleRequest | null;
  fetchError?: unknown;
  insertError?: unknown;
  insertedRequest?: typeof sampleRequest;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options?.activeRequest ?? null,
    error: options?.fetchError ?? null,
  });

  const single = vi.fn().mockResolvedValue({
    data: options?.insertedRequest ?? sampleRequest,
    error: options?.insertError ?? null,
  });

  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const inFn = vi.fn(() => ({ order }));
  const eq = vi.fn(() => ({ in: inFn }));
  const selectForFetch = vi.fn(() => ({ eq }));
  const selectForInsert = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: selectForInsert }));
  const from = vi.fn(() => ({
    select: vi.fn((columns: string) => {
      if (columns.includes("id, user_id")) {
        return selectForFetch();
      }

      return { single };
    }),
    insert,
  }));

  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: "user-1", email: "owner@example.com" } },
  });
  const getAal = vi.fn().mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal1" },
    error: null,
  });
  const listFactors = vi.fn().mockResolvedValue({
    data: { totp: [] },
    error: null,
  });

  return {
    client: {
      from,
      auth: {
        getUser,
        mfa: {
          getAuthenticatorAssuranceLevel: getAal,
          listFactors,
        },
      },
    },
    spies: { from, insert, eq, inFn, maybeSingle, single, getUser, getAal, listFactors },
  };
}

describe("buildAccountDeletionInsertRow", () => {
  it("builds the existing account_deletion_requests insert contract", () => {
    expect(
      buildAccountDeletionInsertRow({
        userId: "user-1",
        email: " owner@example.com ",
        reason: "  ",
      })
    ).toEqual({
      user_id: "user-1",
      email: "owner@example.com",
      reason: null,
      status: ACCOUNT_DELETION_SUBMITTED_STATUS,
    });
  });
});

describe("validateAccountDeletionSubmission", () => {
  it("rejects logged-out users", () => {
    expect(
      validateAccountDeletionSubmission({
        authenticatedUserId: null,
        requestedUserId: "user-1",
        activeRequest: null,
      })
    ).toEqual({
      ok: false,
      code: "not_authenticated",
      message: "Please sign in again before requesting account deletion.",
    });
  });

  it("rejects requests for another user", () => {
    expect(
      validateAccountDeletionSubmission({
        authenticatedUserId: "user-1",
        requestedUserId: "user-2",
        activeRequest: null,
      })
    ).toEqual({
      ok: false,
      code: "user_mismatch",
      message: "Please sign in again before requesting account deletion.",
    });
  });

  it("prevents duplicate active requests", () => {
    expect(
      validateAccountDeletionSubmission({
        authenticatedUserId: "user-1",
        requestedUserId: "user-1",
        activeRequest: sampleRequest,
      })
    ).toEqual({
      ok: false,
      code: "already_requested",
      message: "Your account deletion request is already submitted.",
    });
  });
});

describe("fetchActiveAccountDeletionRequest", () => {
  it("queries active submitted/reviewing requests for the authenticated user", async () => {
    const { client, spies } = createMockClient({ activeRequest: sampleRequest });

    const result = await fetchActiveAccountDeletionRequest(client, "user-1");

    expect(result.request).toEqual(sampleRequest);
    expect(spies.from).toHaveBeenCalledWith("account_deletion_requests");
    expect(spies.inFn).toHaveBeenCalledWith("status", [
      ...ACTIVE_ACCOUNT_DELETION_STATUSES,
    ]);
  });
});

describe("submitAccountDeletionRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits an authenticated user's own deletion request", async () => {
    const { client, spies } = createMockClient();

    const result = await submitAccountDeletionRequest(client, {
      authenticatedUserId: "user-1",
      submission: {
        userId: "user-1",
        email: "owner@example.com",
        reason: "No longer using HTBF",
      },
      activeRequest: null,
    });

    expect(result).toEqual({ ok: true, request: sampleRequest });
    expect(spies.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      email: "owner@example.com",
      reason: "No longer using HTBF",
      status: "submitted",
    });
  });

  it("does not submit deletion for another user", async () => {
    const { client, spies } = createMockClient();

    const result = await submitAccountDeletionRequest(client, {
      authenticatedUserId: "user-1",
      submission: {
        userId: "user-2",
        email: "other@example.com",
      },
      activeRequest: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("user_mismatch");
    }
    expect(spies.insert).not.toHaveBeenCalled();
  });

  it("returns safe errors for database failures", async () => {
    const { client } = createMockClient({
      insertError: { message: "RLS violation: forbidden" },
    });

    const result = await submitAccountDeletionRequest(client, {
      authenticatedUserId: "user-1",
      submission: {
        userId: "user-1",
        email: "owner@example.com",
      },
      activeRequest: null,
    });

    expect(result).toEqual({
      ok: false,
      code: "database_error",
      message: formatAccountDeletionDatabaseError(),
    });
    expect(JSON.stringify(result)).not.toContain("RLS violation");
  });

  it("blocks duplicate pending requests before insert", async () => {
    const { client, spies } = createMockClient();

    const result = await submitAccountDeletionRequest(client, {
      authenticatedUserId: "user-1",
      submission: {
        userId: "user-1",
        email: "owner@example.com",
      },
      activeRequest: sampleRequest,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("already_requested");
    }
    expect(spies.insert).not.toHaveBeenCalled();
  });

  it("does not delete auth users or profile/content", async () => {
    const { client, spies } = createMockClient();

    await submitAccountDeletionRequest(client, {
      authenticatedUserId: "user-1",
      submission: {
        userId: "user-1",
        email: "owner@example.com",
      },
      activeRequest: null,
    });

    expect(spies.from).toHaveBeenCalledTimes(1);
    expect(spies.from).toHaveBeenCalledWith("account_deletion_requests");
  });

  it("blocks MFA users at AAL1 before inserting a deletion request", async () => {
    const { client, spies } = createMockClient();
    spies.getAal.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    spies.listFactors.mockResolvedValue({
      data: {
        totp: [
          {
            id: "factor-1",
            factor_type: "totp",
            status: "verified",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      error: null,
    });

    const result = await submitAccountDeletionRequest(client, {
      authenticatedUserId: "user-1",
      submission: {
        userId: "user-1",
        email: "owner@example.com",
      },
      activeRequest: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("insufficient_aal");
    }
    expect(spies.insert).not.toHaveBeenCalled();
  });

  it("allows MFA users already at AAL2 to submit", async () => {
    const { client, spies } = createMockClient();
    spies.getAal.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    spies.listFactors.mockResolvedValue({
      data: {
        totp: [
          {
            id: "factor-1",
            factor_type: "totp",
            status: "verified",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      error: null,
    });

    const result = await submitAccountDeletionRequest(client, {
      authenticatedUserId: "user-1",
      submission: {
        userId: "user-1",
        email: "owner@example.com",
      },
      activeRequest: null,
    });

    expect(result.ok).toBe(true);
    expect(spies.insert).toHaveBeenCalled();
  });
});

describe("admin workflow contract", () => {
  it("uses the same submitted status consumed by admin review", () => {
    expect(ACCOUNT_DELETION_SUBMITTED_STATUS).toBe("submitted");
    expect(ACTIVE_ACCOUNT_DELETION_STATUSES).toEqual(["submitted", "reviewing"]);
  });
});

describe("Account Center delete action contract", () => {
  it("does not rely on mailto as the primary deletion action", () => {
    const modalSource = readFileSync(
      "components/account-center/AccountCenterDeleteAccountModal.tsx",
      "utf8"
    );
    const sectionPageSource = readFileSync(
      "app/profile/[section]/page.tsx",
      "utf8"
    );
    const profilePageSource = readFileSync("app/profile/page.tsx", "utf8");

    expect(modalSource).toContain("Submit Request");
    expect(modalSource).toContain("SensitiveActionMfaStepUp");
    expect(modalSource).not.toContain("mailto:support@hypertobefree.com");
    expect(sectionPageSource).not.toContain(
      "mailto:support@hypertobefree.com?subject=Delete%20my%20HTBF%20account"
    );
    expect(profilePageSource).not.toContain(
      "mailto:support@hypertobefree.com?subject=Delete%20my%20HTBF%20account"
    );
  });
});
