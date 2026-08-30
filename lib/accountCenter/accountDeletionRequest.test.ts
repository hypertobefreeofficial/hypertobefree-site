import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_ACCOUNT_DELETION_STATUSES,
  ACCOUNT_DELETION_SUBMITTED_STATUS,
  buildAccountDeletionInsertRow,
  cancelAccountDeletionRequest,
  fetchOpenAccountDeletionRequest,
  formatAccountDeletionDatabaseError,
  submitAccountDeletionRequest,
  validateAccountDeletionSubmission,
} from "./accountDeletionRequest";
import { ACCOUNT_DELETION_STATUS } from "./accountDeletionLifecycle";

const sampleRequest = {
  id: "req-1",
  user_id: "user-1",
  email: "owner@example.com",
  reason: "Leaving HTBF",
  status: "submitted",
  created_at: "2026-06-07T09:47:07.000Z",
  cancelled_at: null,
  approved_at: null,
  rejected_at: null,
  target_user_id_snapshot: "user-1",
  target_username_snapshot: null,
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
        username: " targetuser ",
        reason: "  ",
      })
    ).toEqual({
      user_id: "user-1",
      email: "owner@example.com",
      reason: null,
      status: ACCOUNT_DELETION_SUBMITTED_STATUS,
      target_user_id_snapshot: "user-1",
      target_username_snapshot: "targetuser",
    });
  });
});

describe("validateAccountDeletionSubmission", () => {
  it("rejects logged-out users", () => {
    expect(
      validateAccountDeletionSubmission({
        authenticatedUserId: null,
        requestedUserId: "user-1",
        openRequest: null,
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
        openRequest: null,
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
        openRequest: sampleRequest,
      })
    ).toEqual({
      ok: false,
      code: "already_requested",
      message: "Your account deletion request is already submitted.",
    });
  });
});

describe("fetchOpenAccountDeletionRequest", () => {
  it("queries open lifecycle requests for the authenticated user", async () => {
    const { client, spies } = createMockClient({ activeRequest: sampleRequest });

    const result = await fetchOpenAccountDeletionRequest(client, "user-1");

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
      openRequest: null,
    });

    expect(result).toEqual({ ok: true, request: sampleRequest });
    expect(spies.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      email: "owner@example.com",
      reason: "No longer using HTBF",
      status: "submitted",
      target_user_id_snapshot: "user-1",
      target_username_snapshot: null,
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
      openRequest: null,
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
      openRequest: null,
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
      openRequest: sampleRequest,
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
      openRequest: null,
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
      openRequest: null,
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
      openRequest: null,
    });

    expect(result.ok).toBe(true);
    expect(spies.insert).toHaveBeenCalled();
  });
});

describe("cancelAccountDeletionRequest", () => {
  it("allows users to cancel submitted requests", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        ...sampleRequest,
        status: ACCOUNT_DELETION_STATUS.CANCELLED,
        cancelled_at: "2026-06-08T09:47:07.000Z",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));

    const result = await cancelAccountDeletionRequest(
      { from } as never,
      {
        authenticatedUserId: "user-1",
        request: sampleRequest,
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBe(ACCOUNT_DELETION_STATUS.CANCELLED);
  });

  it("rejects cancellation after approval", async () => {
    const result = await cancelAccountDeletionRequest(
      { from: vi.fn() } as never,
      {
        authenticatedUserId: "user-1",
        request: {
          ...sampleRequest,
          status: ACCOUNT_DELETION_STATUS.APPROVED,
        },
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_transition");
  });
});

describe("admin workflow contract", () => {
  it("uses the lifecycle statuses consumed by admin review", () => {
    expect(ACCOUNT_DELETION_SUBMITTED_STATUS).toBe("submitted");
    expect(ACTIVE_ACCOUNT_DELETION_STATUSES).toContain("submitted");
    expect(ACTIVE_ACCOUNT_DELETION_STATUSES).toContain("reviewing");
    expect(ACTIVE_ACCOUNT_DELETION_STATUSES).toContain("approved");
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
    expect(modalSource).toContain("Cancel Request");
    expect(modalSource).toContain("SensitiveActionMfaStepUp");
    expect(modalSource).not.toContain("mailto:support@hypertobefree.com");
    expect(sectionPageSource).not.toContain(
      "mailto:support@hypertobefree.com?subject=Delete%20my%20HTBF%20account"
    );
    expect(profilePageSource).not.toContain(
      "mailto:support@hypertobefree.com?subject=Delete%20my%20HTBF%20account"
    );

    const adminPageSource = readFileSync("app/admin/page.tsx", "utf8");
    expect(adminPageSource).toContain("Approve for Deletion");
    expect(adminPageSource).toContain("Approved — not yet deleted");
    expect(adminPageSource).not.toContain("Mark Completed");
    expect(adminPageSource).not.toContain("auth.admin.deleteUser");
    expect(adminPageSource).not.toContain("completeDeletionRequest");
  });
});
