import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS,
  ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY,
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_FK_HARDENING_NOTE,
  ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY,
  UNSAFE_TRANSITIVE_CASCADE_IDS,
  classifyDatabaseTablePolicy,
  PRAYER_UPDATE_IDENTITY_DETACH_FIELDS,
  PRAYER_VIDEO_RESPONSE_ANONYMIZATION_FIELDS,
  PRAYER_VIDEO_RESPONSE_IDENTITY_DETACH_FIELDS,
  PRAYER_WRITTEN_RESPONSE_IDENTITY_DETACH_FIELDS,
  getDatabaseMutationOrderHints,
  resolveCombinedSchemaExecutionReady,
} from "./accountDeletionDatabasePolicy";
import { ACCOUNT_DELETION_TABLE_POLICY } from "./accountDeletionPolicy";
import { STORY_SUBSTANTIVE_CHILD_POLICIES } from "./accountDeletionStoryLifecycle";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";
import { isSchemaExecutionReadyFromLiveProbe } from "./accountDeletionSchemaProbe";

describe("Phase 4C.7B.1E.2B.0B retention policy corrections", () => {
  it("does not anonymize prayer video response body", () => {
    expect(PRAYER_VIDEO_RESPONSE_ANONYMIZATION_FIELDS).toEqual([]);
    expect(PRAYER_VIDEO_RESPONSE_IDENTITY_DETACH_FIELDS).toEqual(["user_id"]);
  });

  it("models written prayer and prayer update author identity detach with preserved body", () => {
    expect(PRAYER_WRITTEN_RESPONSE_IDENTITY_DETACH_FIELDS).toEqual([
      "author_user_id",
    ]);
    expect(PRAYER_UPDATE_IDENTITY_DETACH_FIELDS).toEqual(["author_user_id"]);

    const video = classifyDatabaseTablePolicy("prayer_video_responses")[0];
    const written = classifyDatabaseTablePolicy("prayer_written_responses")[0];
    const update = classifyDatabaseTablePolicy("prayer_updates")[0];

    expect(video?.reason).toContain("body are preserved");
    expect(written?.reason).toContain("body is preserved");
    expect(update?.reason).toContain("body is preserved");
  });

  it("uses party-specific DETACH semantics for story_video_replies", () => {
    const policies = classifyDatabaseTablePolicy("story_video_replies");
    expect(policies.some((entry) => entry.action === "DETACH")).toBe(true);
    expect(
      policies.some(
        (entry) =>
          entry.action === "HARD_DELETE" &&
          entry.selector.includes("user_id = targetUserId OR recipient_user_id")
      )
    ).toBe(false);

    const senderDetach = policies.find(
      (entry) =>
        entry.action === "DETACH" &&
        entry.selector.includes("user_id = targetUserId")
    );
    const recipientDetach = policies.find(
      (entry) =>
        entry.action === "DETACH" &&
        entry.selector.includes("recipient_user_id = targetUserId")
    );

    expect(senderDetach?.reason).toContain("surviving recipient");
    expect(recipientDetach?.reason).toContain("surviving sender");
    expect(ACCOUNT_DELETION_TABLE_POLICY.story_video_replies).toBe(
      "preserve_anonymized"
    );
  });

  it("aligns prayer_updates substantive child policy with preserve semantics", () => {
    expect(STORY_SUBSTANTIVE_CHILD_POLICIES.prayer_updates).toBe(
      "ANONYMIZE_AND_PRESERVE"
    );
  });

  it("documents story_video_replies auth FK registry targets SET NULL after 2B.2", () => {
    const userId = ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY.find(
      (entry) =>
        entry.table === "story_video_replies" && entry.column === "user_id"
    );
    const recipient = ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY.find(
      (entry) =>
        entry.table === "story_video_replies" &&
        entry.column === "recipient_user_id"
    );

    expect(userId?.onDelete).toBe("SET NULL");
    expect(recipient?.onDelete).toBe("SET NULL");
  });

  it("documents story_id CASCADE remains protected by 2B.1 parent-story blocking", () => {
    expect(ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY.some(
      (entry) => entry.id === "story_delete_story_video_replies"
    )).toBe(true);
  });

  it("documents story_video_replies FK hardening prerequisite before auth delete", () => {
    expect(ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS.join(" ")).toContain(
      "story_video_replies cross-user rows"
    );
    expect(ACCOUNT_DELETION_STORY_VIDEO_REPLIES_FK_HARDENING_NOTE).toContain(
      "SET NULL"
    );
  });

  it("documents session revoke before destructive DB mutation", () => {
    const order = getDatabaseMutationOrderHints().join(" ");
    expect(order).toContain("revoke sessions BEFORE destructive database mutation");
    expect(order).toContain("delete auth.users row LAST");
  });

  it("keeps destructive execution gated separately from live probe readiness", () => {
    const satisfiedPrerequisites = [
      {
        id: "write_freeze_public_rls_present",
        satisfied: true,
        detail: "ok",
      },
    ];

    const combined = resolveCombinedSchemaExecutionReady({
      liveProbe: {
        valid: true,
        ready: true,
        probeError: false,
        checkedAt: null,
        prerequisites: satisfiedPrerequisites,
      },
    });

    expect(combined.liveCatalogProbeReady).toBe(true);
    expect(combined.combinedReady).toBe(false);
    expect(isSchemaExecutionReadyFromLiveProbe({
      valid: true,
      ready: true,
      probeError: false,
      checkedAt: null,
      prerequisites: satisfiedPrerequisites,
    })).toBe(true);
    expect(isSchemaExecutionReadyFromLiveProbe({
      valid: true,
      ready: true,
      probeError: false,
      checkedAt: null,
      prerequisites: [],
    })).toBe(false);
    expect(isAccountDeletionExecutionEnabled()).toBe(false);
  });

  it("does not treat auth.users CASCADE as whole-row cleanup for story_video_replies", () => {
    const privateEngagement = ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY.find(
      (entry) => entry.id === "auth_private_engagement_cleanup"
    );
    expect(privateEngagement?.chain.join(" ")).not.toContain("story_video_replies");

    const sharedParty = ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY.find(
      (entry) => entry.id === "auth_story_video_replies_shared_party_preservation"
    );
    expect(sharedParty?.classification).toBe("UNSAFE_PRESERVED_DATA_LOSS");
    expect(sharedParty?.requiredFutureBehavior).toContain("SET NULL");
    expect(sharedParty?.requiredFutureBehavior).toContain("surviving party");
    expect(UNSAFE_TRANSITIVE_CASCADE_IDS).toContain(
      "auth_story_video_replies_shared_party_preservation"
    );
  });
});
