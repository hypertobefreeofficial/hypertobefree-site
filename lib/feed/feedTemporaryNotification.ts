export type FeedNotificationType = "success" | "error";

export type FeedTemporaryNotificationState = {
  id: number;
  message: string;
  type: FeedNotificationType;
  phase: "visible" | "exiting";
};

export const FEED_REPORT_SUCCESS_MESSAGE =
  "Your report was submitted. Thank you for helping keep HTBF safe.";

export const FEED_TEMPORARY_NOTIFICATION_VISIBLE_MS = 4000;
export const FEED_TEMPORARY_NOTIFICATION_EXIT_MS = 250;
