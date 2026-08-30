import { describe, expect, it } from "vitest";
import {
  adaptSupabaseStorageRemoveResponse,
  createAccountDeletionStorageRemoveAdapter,
  SUPABASE_STORAGE_REMOVE_SEMANTICS_NOTE,
} from "./accountDeletionStorageRemoveAdapter";

describe("accountDeletionStorageRemoveAdapter", () => {
  it("maps SDK success with returned FileObject names to deleted_confirmed", () => {
    const result = adaptSupabaseStorageRemoveResponse(
      ["user/thread/object.mp4"],
      {
        data: [{ name: "object.mp4" }],
        error: null,
      }
    );

    expect(result.error).toBeNull();
    expect(result.outcomes).toEqual([
      {
        path: "user/thread/object.mp4",
        outcome: "deleted_confirmed",
      },
    ]);
  });

  it("does not claim deleted_confirmed when SDK success returns empty data", () => {
    const result = adaptSupabaseStorageRemoveResponse(
      ["user/thread/object.mp4"],
      {
        data: [],
        error: null,
      }
    );

    expect(result.outcomes[0]?.outcome).toBe(
      "operation_succeeded_not_confirmed"
    );
    expect(SUPABASE_STORAGE_REMOVE_SEMANTICS_NOTE).toContain("empty");
  });

  it("marks all requested paths failed when SDK returns error", () => {
    const result = adaptSupabaseStorageRemoveResponse(
      ["a.mp4", "b.mp4"],
      {
        data: null,
        error: { message: "remove failed" },
      }
    );

    expect(result.outcomes).toEqual([
      { path: "a.mp4", outcome: "failed" },
      { path: "b.mp4", outcome: "failed" },
    ]);
  });

  it("handles mixed batch confirmation honestly", () => {
    const result = adaptSupabaseStorageRemoveResponse(["a.mp4", "b.mp4"], {
      data: [{ name: "a.mp4" }],
      error: null,
    });

    expect(result.outcomes).toEqual([
      { path: "a.mp4", outcome: "deleted_confirmed" },
      { path: "b.mp4", outcome: "operation_succeeded_not_confirmed" },
    ]);
  });

  it("wraps remove() with adapter matching installed SDK response shape", async () => {
    const removeFn = async () => ({
      data: [{ name: "object.mp4" }],
      error: null,
    });

    const adapted = createAccountDeletionStorageRemoveAdapter(removeFn);
    const result = await adapted("journey-private-media", [
      "user/thread/object.mp4",
    ]);

    expect(result.outcomes[0]?.outcome).toBe("deleted_confirmed");
  });
});
