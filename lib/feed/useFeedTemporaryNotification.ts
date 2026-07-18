"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FEED_TEMPORARY_NOTIFICATION_EXIT_MS,
  FEED_TEMPORARY_NOTIFICATION_VISIBLE_MS,
  type FeedNotificationType,
  type FeedTemporaryNotificationState,
} from "./feedTemporaryNotification";

export function useFeedTemporaryNotification() {
  const [notification, setNotification] =
    useState<FeedTemporaryNotificationState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setNotification((current) =>
      current ? { ...current, phase: "exiting" } : null
    );
    exitTimerRef.current = setTimeout(() => {
      setNotification(null);
    }, FEED_TEMPORARY_NOTIFICATION_EXIT_MS);
  }, [clearTimers]);

  const show = useCallback(
    (message: string, type: FeedNotificationType = "success") => {
      clearTimers();
      idRef.current += 1;
      const id = idRef.current;

      setNotification({
        id,
        message,
        type,
        phase: "visible",
      });

      hideTimerRef.current = setTimeout(() => {
        setNotification((current) =>
          current?.id === id ? { ...current, phase: "exiting" } : current
        );
        exitTimerRef.current = setTimeout(() => {
          setNotification((current) => (current?.id === id ? null : current));
        }, FEED_TEMPORARY_NOTIFICATION_EXIT_MS);
      }, FEED_TEMPORARY_NOTIFICATION_VISIBLE_MS);
    },
    [clearTimers]
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  return { notification, show, dismiss };
}
