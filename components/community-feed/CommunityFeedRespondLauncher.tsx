"use client";

import { useMemo, useRef, useState } from "react";
import type { FeedStoryDisplay } from "./types";
import { buildResponseSourceContext } from "../../lib/responses/responseContext";
import PostResponseFlow from "../responses/PostResponseFlow";
import styles from "../FreedomFeed.module.css";

type CommunityFeedRespondLauncherProps = {
  story: FeedStoryDisplay;
  currentUserId: string | null;
  onPrepareReturn?: () => void;
  onResponseMessage?: (message: string) => void;
  onRefreshStoryVideoResponses?: (storyId: string) => void;
};

function storyTitleFromFeed(story: FeedStoryDisplay) {
  const text = story.story_text?.trim();
  if (text) return text.slice(0, 120);
  return story.name?.trim() || "HTBF post";
}

export default function CommunityFeedRespondLauncher({
  story,
  currentUserId,
  onPrepareReturn,
  onResponseMessage,
  onRefreshStoryVideoResponses,
}: CommunityFeedRespondLauncherProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const isPrayerStory = (story.story_type || "")
    .toLowerCase()
    .includes("prayer");

  const context = useMemo(
    () =>
      buildResponseSourceContext({
        sourceType: isPrayerStory ? "prayer" : "feed",
        storyId: story.id,
        authorUserId: story.user_id,
        storyTitle: storyTitleFromFeed(story),
        requestApproved: true,
        prayerStatus:
          story.prayer_status === "answered"
            ? "answered"
            : story.prayer_status === "paused"
              ? "paused"
              : "active",
      }),
    [isPrayerStory, story]
  );

  const isOwner =
    Boolean(currentUserId) &&
    Boolean(story.user_id) &&
    currentUserId === story.user_id;

  const canRespond = context.canRespond && !isOwner;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.primaryActionButton} ${
          open ? styles.reactionSelectorTriggerSheetOpen : ""
        }`}
        disabled={!canRespond}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          onPrepareReturn?.();
          setOpen(true);
        }}
      >
        Respond
      </button>

      <PostResponseFlow
        context={context}
        open={open}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        returnBehavior="stay"
        onComplete={({ success, message }) => {
          if (success) {
            onResponseMessage?.(
              message ?? "Your video response was submitted for review."
            );
            onRefreshStoryVideoResponses?.(story.id);
          }
        }}
      />
    </>
  );
}
