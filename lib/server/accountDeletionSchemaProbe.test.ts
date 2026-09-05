import { describe, expect, it, vi } from "vitest";
import {
  fetchAccountDeletionSchemaProbe,
  isSchemaExecutionReadyFromLiveProbe,
  parseAccountDeletionSchemaProbePayload,
  summarizeSchemaProbeReadiness,
} from "./accountDeletionSchemaProbe";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";

function allSatisfiedPrerequisites() {
  return [
    {
      id: "write_freeze_public_rls_present",
      satisfied: true,
      detail: "ok",
    },
    {
      id: "stories_user_id_nullable",
      satisfied: true,
      detail: "ok",
    },
  ];
}

describe("accountDeletionSchemaProbe", () => {
  it("ready=true with all prerequisites satisfied => ready", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      checked_at: "2026-09-04T00:00:00.000Z",
      prerequisites: allSatisfiedPrerequisites(),
    });

    expect(parsed.valid).toBe(true);
    expect(parsed.ready).toBe(true);
    expect(parsed.probeError).toBe(false);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(true);
    expect(summarizeSchemaProbeReadiness(parsed).liveCatalogReady).toBe(true);
  });

  it("ready=true with one prerequisite false => NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      checked_at: "2026-09-04T00:00:00.000Z",
      prerequisites: [
        {
          id: "write_freeze_public_rls_present",
          satisfied: true,
          detail: "ok",
        },
        {
          id: "stories_user_id_nullable",
          satisfied: false,
          detail: "missing",
        },
      ],
    });

    expect(parsed.valid).toBe(true);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
    expect(summarizeSchemaProbeReadiness(parsed).liveCatalogReady).toBe(false);
    expect(summarizeSchemaProbeReadiness(parsed).unsatisfiedPrerequisiteIds).toEqual([
      "stories_user_id_nullable",
    ]);
  });

  it("ready=true with missing prerequisites => NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      checked_at: "2026-09-04T00:00:00.000Z",
      prerequisites: [],
    });

    expect(parsed.valid).toBe(true);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
    expect(summarizeSchemaProbeReadiness(parsed).liveCatalogReady).toBe(false);
  });

  it("ready=false with all prerequisites true => NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: false,
      checked_at: "2026-09-04T00:00:00.000Z",
      prerequisites: allSatisfiedPrerequisites(),
    });

    expect(parsed.valid).toBe(true);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
    expect(summarizeSchemaProbeReadiness(parsed).liveCatalogReady).toBe(false);
  });

  it("malformed prerequisite item => NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      checked_at: "2026-09-04T00:00:00.000Z",
      prerequisites: [
        {
          id: "write_freeze_public_rls_present",
          satisfied: true,
          detail: "ok",
        },
        {
          satisfied: true,
          detail: "missing id",
        },
      ],
    });

    expect(parsed.valid).toBe(false);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
    expect(summarizeSchemaProbeReadiness(parsed).liveCatalogReady).toBe(false);
  });

  it("treats RPC error as not ready", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "boom" },
      }),
    } as never;

    const result = await fetchAccountDeletionSchemaProbe(client);
    expect(result.probeError).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.ready).toBe(false);
    expect(isSchemaExecutionReadyFromLiveProbe(result)).toBe(false);
  });

  it("treats malformed payload as not ready", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({ ready: "yes" });
    expect(parsed.valid).toBe(false);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
    expect(
      summarizeSchemaProbeReadiness(parsed).liveCatalogReady
    ).toBe(false);
  });

  it("fail-closed when story_video_replies auth FK prerequisites are unsatisfied", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      checked_at: "2026-09-04T00:00:00.000Z",
      prerequisites: [
        ...allSatisfiedPrerequisites(),
        {
          id: "story_video_replies_user_id_set_null",
          satisfied: false,
          detail: "still CASCADE",
        },
        {
          id: "story_video_replies_recipient_user_id_set_null",
          satisfied: true,
          detail: "ok",
        },
      ],
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
    expect(summarizeSchemaProbeReadiness(parsed).unsatisfiedPrerequisiteIds).toContain(
      "story_video_replies_user_id_set_null"
    );
  });

  it("does not enable destructive execution via probe alone", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      checked_at: "2026-09-04T00:00:00.000Z",
      prerequisites: allSatisfiedPrerequisites(),
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(true);
    expect(isAccountDeletionExecutionEnabled()).toBe(false);
  });
});
