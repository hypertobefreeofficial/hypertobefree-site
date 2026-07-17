import { describe, expect, it } from "vitest";
import {
  canPublishPublicVideoResponse,
  MANUAL_DURATION_ACK_COPY,
} from "./responsePublication";

describe("canPublishPublicVideoResponse", () => {
  it("blocks failed duration verification", () => {
    const result = canPublishPublicVideoResponse({
      duration_verification_status: "failed",
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("duration_verification_failed");
  });

  it("blocks verified responses over the public limit", () => {
    const result = canPublishPublicVideoResponse({
      duration_verification_status: "verified",
      duration_seconds: 45,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("duration_verification_failed");
  });

  it("requires manual acknowledgement when duration is unavailable", () => {
    const result = canPublishPublicVideoResponse({
      duration_verification_status: "unavailable",
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("duration_ack_required");
    expect(result.requiresManualAck).toBe(true);
    expect(result.reason).toBe(MANUAL_DURATION_ACK_COPY);
  });

  it("allows unavailable duration after explicit acknowledgement", () => {
    const result = canPublishPublicVideoResponse(
      { duration_verification_status: "unavailable" },
      { acknowledgeUnverifiedDuration: true }
    );
    expect(result.allowed).toBe(true);
  });
});
