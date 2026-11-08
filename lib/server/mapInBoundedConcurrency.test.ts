import { describe, expect, it } from "vitest";
import { mapInBoundedConcurrency } from "./mapInBoundedConcurrency";

describe("mapInBoundedConcurrency", () => {
  it("returns results in input order", async () => {
    const values = await mapInBoundedConcurrency(
      [1, 2, 3],
      2,
      async (value) => value * 2
    );
    expect(values).toEqual([2, 4, 6]);
  });

  it("returns empty for empty input", async () => {
    await expect(mapInBoundedConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });

  it("propagates mapper errors", async () => {
    await expect(
      mapInBoundedConcurrency([1], 1, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});
