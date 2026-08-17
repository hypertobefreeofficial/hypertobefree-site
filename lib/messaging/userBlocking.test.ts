import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockOr = vi.fn();
const mockLimit = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

describe("assertUsersNotBlocked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ or: mockOr });
    mockOr.mockReturnValue({ limit: mockLimit });
  });

  it("throws when a block relationship exists", async () => {
    mockLimit.mockResolvedValue({
      data: [{ blocker_user_id: "user-a" }],
      error: null,
    });

    const { assertUsersNotBlocked } = await import("./userBlocking");

    await expect(assertUsersNotBlocked("user-a", "user-b")).rejects.toThrow(
      "You cannot send messages to this person."
    );
    expect(mockFrom).toHaveBeenCalledWith("blocked_users");
  });

  it("allows messaging when no block relationship exists", async () => {
    mockLimit.mockResolvedValue({
      data: [],
      error: null,
    });

    const { assertUsersNotBlocked } = await import("./userBlocking");

    await expect(
      assertUsersNotBlocked("user-a", "user-b")
    ).resolves.toBeUndefined();
  });
});
