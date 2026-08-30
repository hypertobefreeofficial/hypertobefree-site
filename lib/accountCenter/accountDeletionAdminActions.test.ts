import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveAccountDeletionRequest,
  markAccountDeletionReviewing,
  rejectAccountDeletionRequest,
} from "./accountDeletionAdminActions";
import { ACCOUNT_DELETION_STATUS } from "./accountDeletionLifecycle";

const baseRequest = {
  id: "req-1",
  user_id: "user-target",
  email: "target@example.com",
  reason: "Leaving",
  status: ACCOUNT_DELETION_STATUS.SUBMITTED,
  admin_notes: null,
  reviewed_at: null,
  reviewed_by: null,
  approved_at: null,
  approved_by: null,
  rejected_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function createMockClient(options?: {
  updateResult?: unknown;
  updateError?: unknown;
  profile?: { is_owner: boolean; is_admin: boolean } | null;
  profileError?: unknown;
}) {
  const single = vi.fn().mockResolvedValue({
    data: options?.updateResult ?? {
      ...baseRequest,
      status: ACCOUNT_DELETION_STATUS.REVIEWING,
    },
    error: options?.updateError ?? null,
  });

  const eqUpdate = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
  const update = vi.fn(() => ({ eq: eqUpdate }));

  const maybeSingleProfile = vi.fn().mockResolvedValue({
    data: options?.profile ?? { is_owner: false, is_admin: false },
    error: options?.profileError ?? null,
  });
  const eqProfile = vi.fn(() => ({ maybeSingle: maybeSingleProfile }));

  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn(() => ({ eq: eqProfile })),
      };
    }

    return {
      update,
    };
  });

  return {
    client: { from },
    spies: { from, update, single, maybeSingleProfile },
  };
}

describe("accountDeletionAdminActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks submitted requests as reviewing", async () => {
    const { client } = createMockClient({
      updateResult: {
        ...baseRequest,
        status: ACCOUNT_DELETION_STATUS.REVIEWING,
      },
    });

    const result = await markAccountDeletionReviewing(client, baseRequest);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBe(ACCOUNT_DELETION_STATUS.REVIEWING);
  });

  it("rejects invalid admin transitions", async () => {
    const { client } = createMockClient();

    const result = await approveAccountDeletionRequest(
      client,
      { ...baseRequest, status: ACCOUNT_DELETION_STATUS.SUBMITTED },
      "admin-1"
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_transition");
  });

  it("blocks owner approval targets", async () => {
    const { client } = createMockClient({
      profile: { is_owner: true, is_admin: false },
    });

    const result = await approveAccountDeletionRequest(
      client,
      { ...baseRequest, status: ACCOUNT_DELETION_STATUS.REVIEWING },
      "admin-1"
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("blocked_owner");
  });

  it("approves reviewing requests for non-owner targets", async () => {
    const { client } = createMockClient({
      updateResult: {
        ...baseRequest,
        status: ACCOUNT_DELETION_STATUS.APPROVED,
      },
    });

    const result = await approveAccountDeletionRequest(
      client,
      { ...baseRequest, status: ACCOUNT_DELETION_STATUS.REVIEWING },
      "admin-1"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBe(ACCOUNT_DELETION_STATUS.APPROVED);
  });

  it("rejects reviewing requests without deleting accounts", async () => {
    const { client } = createMockClient({
      updateResult: {
        ...baseRequest,
        status: ACCOUNT_DELETION_STATUS.REJECTED,
      },
    });

    const result = await rejectAccountDeletionRequest(
      client,
      { ...baseRequest, status: ACCOUNT_DELETION_STATUS.REVIEWING },
      "admin-1"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBe(ACCOUNT_DELETION_STATUS.REJECTED);
  });
});
