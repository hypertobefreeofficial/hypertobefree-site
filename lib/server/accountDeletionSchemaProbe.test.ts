import { describe, expect, it, vi } from "vitest";
import {
  fetchAccountDeletionSchemaProbe,
  isPrerequisiteReady,
  isSchemaExecutionReadyFromLiveProbe,
  parseAccountDeletionSchemaProbePayload,
  summarizeSchemaProbeReadiness,
} from "./accountDeletionSchemaProbe";
import { isAccountDeletionExecutionEnabled } from "./accountDeletionExecutionPolicy";

function legacyPrerequisites() {
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

function newerPrerequisites() {
  return [
    {
      id: "session_transition_rpc_advance_account_deletion_attempt_to_sessions_pending",
      ready: true,
      detail: "advance_account_deletion_attempt_to_sessions_pending(uuid, uuid)",
    },
    {
      id: "nondestructive_database_stage_rpc_ready",
      ready: true,
      detail: "execute_account_deletion_nondestructive_database_stage(uuid, uuid) exists",
    },
  ];
}

/** Representative composed Production payload (legacy + 3B.1 + 3B.2B entries). */
function composedProductionShapedPrerequisites() {
  return [
    ...legacyPrerequisites(),
    ...newerPrerequisites(),
    {
      id: "account_deletion_acquisition_rpc_ready",
      satisfied: true,
      detail: "acquire_account_deletion_execution_lock(uuid,uuid) exists SECURITY DEFINER service_role-only",
    },
    {
      id: "execution_attempts_service_role_mutation_revoked",
      ready: true,
      detail: "service_role may SELECT attempts only; stage changes via narrow RPCs",
    },
  ];
}

describe("accountDeletionSchemaProbe", () => {
  it("SP-A: legacy all satisfied=true → READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      checked_at: "2026-09-04T00:00:00.000Z",
      prerequisites: legacyPrerequisites(),
    });

    expect(parsed.valid).toBe(true);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(true);
  });

  it("SP-B: newer all ready=true → READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: newerPrerequisites(),
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(true);
  });

  it("SP-C: mixed legacy + newer prerequisites → READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: composedProductionShapedPrerequisites(),
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(true);
  });

  it("SP-D: top-level ready=false → NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: false,
      prerequisites: legacyPrerequisites(),
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it("SP-E: satisfied=false → NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [
        { id: "a", satisfied: true, detail: "ok" },
        { id: "b", satisfied: false, detail: "no" },
      ],
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
    expect(summarizeSchemaProbeReadiness(parsed).unsatisfiedPrerequisiteIds).toEqual([
      "b",
    ]);
  });

  it("SP-F: ready=false → NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [
        { id: "a", ready: true, detail: "ok" },
        { id: "b", ready: false, detail: "no" },
      ],
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it("SP-G: missing both satisfied/ready → NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [{ id: "a", detail: "no signal" }],
    });

    expect(parsed.valid).toBe(true);
    expect(isPrerequisiteReady(parsed.prerequisites[0]!)).toBe(false);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it('SP-H: satisfied="true" string → NOT READY', () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [{ id: "a", satisfied: "true", detail: "coerced" }],
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it("SP-I: ready=1 → NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [{ id: "a", ready: 1, detail: "coerced" }],
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it("SP-J: malformed prerequisite object → NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [{ satisfied: true, detail: "missing id" }],
    });

    expect(parsed.valid).toBe(false);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it("SP-K: prerequisites not array → NOT READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: "not-an-array",
    });

    expect(parsed.valid).toBe(false);
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it("SP-L: payload null / array / malformed → NOT READY", () => {
    expect(isSchemaExecutionReadyFromLiveProbe(null)).toBe(false);
    expect(
      isSchemaExecutionReadyFromLiveProbe(
        parseAccountDeletionSchemaProbePayload([])
      )
    ).toBe(false);
    expect(
      isSchemaExecutionReadyFromLiveProbe(
        parseAccountDeletionSchemaProbePayload({ ready: "yes" })
      )
    ).toBe(false);
  });

  it("SP-M: satisfied=true and ready=false → NOT READY", () => {
    const entry = {
      id: "contradictory",
      satisfied: true,
      ready: false,
      detail: "conflict",
    };
    expect(isPrerequisiteReady(entry)).toBe(false);
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [entry],
    });
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it("SP-N: satisfied=false and ready=true → NOT READY", () => {
    const entry = {
      id: "contradictory",
      satisfied: false,
      ready: true,
      detail: "conflict",
    };
    expect(isPrerequisiteReady(entry)).toBe(false);
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [entry],
    });
    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it("SP-O: composed Production-shaped mixed fixture → READY", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      checked_at: "2026-09-18T19:47:49.777128-07:00",
      prerequisites: composedProductionShapedPrerequisites(),
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(true);
  });

  it("SP-P: top-level ready=true with empty prerequisites → NOT READY (fail closed)", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [],
    });

    expect(parsed.valid).toBe(true);
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
    expect(isSchemaExecutionReadyFromLiveProbe(result)).toBe(false);
  });

  it("fail-closed when parent_reply_id FK prerequisite is unsatisfied", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: [
        ...legacyPrerequisites(),
        {
          id: "story_video_replies_parent_reply_id_set_null",
          satisfied: false,
          detail: "still CASCADE",
        },
      ],
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(false);
  });

  it("does not enable destructive execution via probe alone", () => {
    const parsed = parseAccountDeletionSchemaProbePayload({
      ready: true,
      prerequisites: legacyPrerequisites(),
    });

    expect(isSchemaExecutionReadyFromLiveProbe(parsed)).toBe(true);
    expect(isAccountDeletionExecutionEnabled()).toBe(false);
  });
});
