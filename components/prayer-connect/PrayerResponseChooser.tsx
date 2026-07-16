"use client";

import type { PrayerInteractionPrefs } from "../../lib/prayer-connect/interactionPrefs";
import { getResponseContextLabels } from "../../lib/responses/responseContext";
import type { ResponseChoice } from "../../lib/responses/responseContext";
import PostResponseChooser from "../responses/PostResponseChooser";

export type PrayerResponseChoice = ResponseChoice;

type PrayerResponseChooserProps = {
  open: boolean;
  prefs: PrayerInteractionPrefs;
  onClose: () => void;
  onChoose: (choice: PrayerResponseChoice) => void;
};

export default function PrayerResponseChooser(props: PrayerResponseChooserProps) {
  return (
    <PostResponseChooser
      {...props}
      labels={getResponseContextLabels("prayer")}
    />
  );
}
