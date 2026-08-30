import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_STATUS,
  canTransitionAccountDeletionStatus,
  describeAccountDeletionDryRunStatus,
  getAccountDeletionStatusAdminLabel,
  getAccountDeletionStatusUserLabel,
  isAccountDeletionDryRunAllowedStatus,
  LEGACY_COMPLETED_STATUS_NOTE,
  normalizeLegacyDeletionStatus,
  validateAccountDeletionTransition,
  validateDeletionApprovalTarget,
} from "./accountDeletionLifecycle";

describe("accountDeletionLifecycle transitions", () => {
  it("allows the primary admin review path", () => {
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.SUBMITTED,
        ACCOUNT_DELETION_STATUS.REVIEWING
      )
    ).toBe(true);
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.REVIEWING,
        ACCOUNT_DELETION_STATUS.APPROVED
      )
    ).toBe(true);
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.APPROVED,
        ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS
      )
    ).toBe(true);
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
        ACCOUNT_DELETION_STATUS.DELETED
      )
    ).toBe(true);
  });

  it("rejects invalid shortcuts to deleted", () => {
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.SUBMITTED,
        ACCOUNT_DELETION_STATUS.DELETED
      )
    ).toBe(false);
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.REVIEWING,
        ACCOUNT_DELETION_STATUS.DELETED
      )
    ).toBe(false);
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.APPROVED,
        ACCOUNT_DELETION_STATUS.DELETED
      )
    ).toBe(false);
  });

  it("keeps deleted terminal", () => {
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.DELETED,
        ACCOUNT_DELETION_STATUS.REVIEWING
      )
    ).toBe(false);
  });

  it("allows failed retry only to deletion_in_progress", () => {
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.FAILED,
        ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS
      )
    ).toBe(true);
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.FAILED,
        ACCOUNT_DELETION_STATUS.DELETED
      )
    ).toBe(false);
  });

  it("rejects cancelled and rejected execution transitions", () => {
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.CANCELLED,
        ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS
      )
    ).toBe(false);
    expect(
      canTransitionAccountDeletionStatus(
        ACCOUNT_DELETION_STATUS.REJECTED,
        ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS
      )
    ).toBe(false);
  });

  it("validates admin-only transitions in this phase", () => {
    expect(
      validateAccountDeletionTransition({
        from: ACCOUNT_DELETION_STATUS.SUBMITTED,
        to: ACCOUNT_DELETION_STATUS.REVIEWING,
        actor: "admin",
      }).ok
    ).toBe(true);
    expect(
      validateAccountDeletionTransition({
        from: ACCOUNT_DELETION_STATUS.REVIEWING,
        to: ACCOUNT_DELETION_STATUS.APPROVED,
        actor: "admin",
      }).ok
    ).toBe(true);
    expect(
      validateAccountDeletionTransition({
        from: ACCOUNT_DELETION_STATUS.APPROVED,
        to: ACCOUNT_DELETION_STATUS.DELETION_IN_PROGRESS,
        actor: "admin",
      }).ok
    ).toBe(false);
  });

  it("allows user cancellation only while submitted or reviewing", () => {
    expect(
      validateAccountDeletionTransition({
        from: ACCOUNT_DELETION_STATUS.SUBMITTED,
        to: ACCOUNT_DELETION_STATUS.CANCELLED,
        actor: "user",
      }).ok
    ).toBe(true);
    expect(
      validateAccountDeletionTransition({
        from: ACCOUNT_DELETION_STATUS.REVIEWING,
        to: ACCOUNT_DELETION_STATUS.CANCELLED,
        actor: "user",
      }).ok
    ).toBe(true);
    expect(
      validateAccountDeletionTransition({
        from: ACCOUNT_DELETION_STATUS.APPROVED,
        to: ACCOUNT_DELETION_STATUS.CANCELLED,
        actor: "user",
      }).ok
    ).toBe(false);
  });
});

describe("accountDeletionLifecycle legacy completed", () => {
  it("maps legacy completed to legacy_completed", () => {
    expect(normalizeLegacyDeletionStatus("completed")).toBe(
      ACCOUNT_DELETION_STATUS.LEGACY_COMPLETED
    );
  });

  it("does not treat legacy completed as deleted", () => {
    expect(getAccountDeletionStatusUserLabel("completed")).toContain(
      "not deleted"
    );
    expect(describeAccountDeletionDryRunStatus("legacy_completed")).toBe(
      LEGACY_COMPLETED_STATUS_NOTE
    );
  });
});

describe("accountDeletionLifecycle approval safety", () => {
  it("blocks owner approval targets", () => {
    const result = validateDeletionApprovalTarget({ is_owner: true, is_admin: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("blocked_owner");
  });

  it("warns for admin targets without blocking", () => {
    const result = validateDeletionApprovalTarget({ is_owner: false, is_admin: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("accountDeletionLifecycle labels and dry-run", () => {
  it("shows approved as not yet deleted in admin UI copy", () => {
    expect(getAccountDeletionStatusAdminLabel("approved")).toContain(
      "not yet deleted"
    );
  });

  it("allows dry-run on approved and failed statuses", () => {
    expect(isAccountDeletionDryRunAllowedStatus("approved")).toBe(true);
    expect(isAccountDeletionDryRunAllowedStatus("failed")).toBe(true);
    expect(isAccountDeletionDryRunAllowedStatus("deleted")).toBe(false);
  });
});
