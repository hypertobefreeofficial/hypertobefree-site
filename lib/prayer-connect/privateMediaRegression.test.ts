import { describe, expect, it } from "vitest";
import { uploadPrayerVideoWithThumbnail } from "./media";

describe("public prayer media upload regression", () => {
  it("keeps public upload helper available for non-inbox prayer flows", () => {
    expect(typeof uploadPrayerVideoWithThumbnail).toBe("function");
  });
});
