import { describe, expect, it } from "vitest";
import { mapMarkPrayerAnsweredClientError } from "./mapMarkPrayerAnsweredClientError";

describe("mapMarkPrayerAnsweredClientError", () => {
  it("maps authentication errors", () => {
    expect(
      mapMarkPrayerAnsweredClientError({ message: "authentication required" })
    ).toMatch(/sign in/i);
  });

  it("does not expose raw SQL or policy details", () => {
    expect(
      mapMarkPrayerAnsweredClientError({
        message: 'policy "stories_update" violated on table stories',
      })
    ).not.toMatch(/policy|stories_update/i);

    expect(
      mapMarkPrayerAnsweredClientError({
        message: "prayer answered fields must be updated through mark_my_prayer_answered()",
      })
    ).not.toMatch(/mark_my_prayer_answered/i);
  });

  it("maps ineligible prayer errors safely", () => {
    expect(
      mapMarkPrayerAnsweredClientError({
        message: "could not mark this prayer answered",
      })
    ).toMatch(/eligible/i);
  });
});
