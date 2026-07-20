"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";
import {
  computeMobileNavBadgeCounts,
  type MobileNavBadgeCounts,
  type MobileNavInboxRow,
} from "./mobileNavBadgeCounts";
import {
  fetchBadgeStoryVideoReplies,
  filterBadgeSourceRows,
} from "./mobileNavBadgeSourceFiltering";
import {
  createMobileNavRefreshDebouncer,
  shouldApplyMobileNavFetchResult,
} from "./mobileNavBadgeRefresh";
import {
  isStaticMobileNavBadgeTestOverride,
  readMobileNavBadgeTestOverride,
  recordMobileNavBadgeAuthLookup,
  recordMobileNavBadgeChannelCreate,
  recordMobileNavBadgeChannelRemove,
  recordMobileNavBadgeFetchCall,
} from "./mobileNavBadgeTestMode";

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";
const REALTIME_DEBOUNCE_MS = 400;

function readIsMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(readIsMobileViewport);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const update = () => setIsMobile(!mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export async function fetchMobileNavBadgeCounts(
  userId: string
): Promise<MobileNavBadgeCounts> {
  recordMobileNavBadgeFetchCall();

  const { data: inboxData, error: inboxError } = await supabase
    .from("inbox_messages")
    .select(
      "id, sender_user_id, thread_id, story_id, prayer_request_id, message_type, category, title, read, hidden_at"
    )
    .eq("user_id", userId)
    .eq("read", false)
    .is("hidden_at", null);

  if (inboxError) {
    throw new Error(inboxError.message);
  }

  const replyRows = await fetchBadgeStoryVideoReplies(async (select) => {
    const { data, error } = await supabase
      .from("story_video_replies")
      .select(select)
      .eq("recipient_user_id", userId)
      .is("read_at", null);

    return { data, error };
  });

  const { inboxRows, privateReplyRows } = await filterBadgeSourceRows(
    (inboxData as MobileNavInboxRow[]) ?? [],
    replyRows,
    userId,
    async (storyIds, select) => {
      const { data, error } = await supabase
        .from("stories")
        .select(select)
        .in("id", storyIds);

      return { data, error };
    }
  );

  return computeMobileNavBadgeCounts(inboxRows, privateReplyRows, userId);
}

export function createMobileNavBadgeRealtimeChannel(
  userId: string,
  scheduleRefresh: () => void
): RealtimeChannel {
  const channelName = `mobile-nav-badges-${userId}`;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "inbox_messages",
        filter: `user_id=eq.${userId}`,
      },
      scheduleRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "story_video_replies",
        filter: `recipient_user_id=eq.${userId}`,
      },
      scheduleRefresh
    )
    .subscribe();

  recordMobileNavBadgeChannelCreate(channelName);

  return channel;
}

export type MobileNavBadgeState = MobileNavBadgeCounts & {
  isLoading: boolean;
  refreshCounts: () => Promise<void>;
};

export function useMobileNavBadges(): MobileNavBadgeState {
  const isMobile = useIsMobileViewport();
  const staticTestOverride = isStaticMobileNavBadgeTestOverride(
    readMobileNavBadgeTestOverride()
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [counts, setCounts] = useState<MobileNavBadgeCounts>({
    prayerCount: staticTestOverride
      ? (readMobileNavBadgeTestOverride()?.prayerCount ?? 0)
      : 0,
    inboxCount: staticTestOverride
      ? (readMobileNavBadgeTestOverride()?.inboxCount ?? 0)
      : 0,
  });
  const [isLoading, setIsLoading] = useState(
    staticTestOverride
      ? (readMobileNavBadgeTestOverride()?.isLoading ?? false)
      : true
  );

  const channelRef = useRef<RealtimeChannel | null>(null);
  const debouncerRef = useRef<ReturnType<
    typeof createMobileNavRefreshDebouncer
  > | null>(null);
  const activeUserRef = useRef<string | null>(null);
  const fetchGenerationRef = useRef(0);

  const clearCounts = useCallback(() => {
    setCounts({ prayerCount: 0, inboxCount: 0 });
  }, []);

  const removeChannel = useCallback(() => {
    debouncerRef.current?.cancel();

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      recordMobileNavBadgeChannelRemove();
    }
  }, []);

  const refreshCounts = useCallback(async () => {
    const currentUserId = activeUserRef.current;

    if (!currentUserId || !isMobile || staticTestOverride) {
      clearCounts();
      setIsLoading(false);
      return;
    }

    const generation = ++fetchGenerationRef.current;
    setIsLoading(true);

    try {
      const nextCounts = await fetchMobileNavBadgeCounts(currentUserId);

      if (
        !shouldApplyMobileNavFetchResult({
          generation,
          activeGeneration: fetchGenerationRef.current,
          userId: currentUserId,
          activeUserId: activeUserRef.current,
        })
      ) {
        return;
      }

      setCounts(nextCounts);
    } catch (error) {
      console.error("Could not refresh mobile nav badge counts:", error);

      if (
        shouldApplyMobileNavFetchResult({
          generation,
          activeGeneration: fetchGenerationRef.current,
          userId: currentUserId,
          activeUserId: activeUserRef.current,
        })
      ) {
        clearCounts();
      }
    } finally {
      if (
        shouldApplyMobileNavFetchResult({
          generation,
          activeGeneration: fetchGenerationRef.current,
          userId: currentUserId,
          activeUserId: activeUserRef.current,
        })
      ) {
        setIsLoading(false);
      }
    }
  }, [clearCounts, isMobile, staticTestOverride]);

  const scheduleRefresh = useCallback(() => {
    if (!activeUserRef.current || !isMobile || staticTestOverride) return;

    if (!debouncerRef.current) {
      debouncerRef.current = createMobileNavRefreshDebouncer(
        REALTIME_DEBOUNCE_MS,
        () => {
          void refreshCounts();
        }
      );
    }

    debouncerRef.current.schedule();
  }, [isMobile, refreshCounts, staticTestOverride]);

  const subscribeForUser = useCallback(
    (nextUserId: string) => {
      removeChannel();
      channelRef.current = createMobileNavBadgeRealtimeChannel(
        nextUserId,
        scheduleRefresh
      );
    },
    [removeChannel, scheduleRefresh]
  );

  useEffect(() => {
    if (staticTestOverride) return;

    let cancelled = false;

    async function resolveInitialUser() {
      recordMobileNavBadgeAuthLookup();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      setUserId(user?.id ?? null);
    }

    void resolveInitialUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [staticTestOverride]);

  useEffect(() => {
    if (staticTestOverride) {
      const override = readMobileNavBadgeTestOverride();
      setCounts({
        prayerCount: override?.prayerCount ?? 0,
        inboxCount: override?.inboxCount ?? 0,
      });
      setIsLoading(override?.isLoading ?? false);
      return;
    }

    activeUserRef.current = userId;

    if (!isMobile || !userId) {
      fetchGenerationRef.current += 1;
      removeChannel();
      clearCounts();
      setIsLoading(false);
      return;
    }

    subscribeForUser(userId);
    void refreshCounts();

    return () => {
      fetchGenerationRef.current += 1;
      removeChannel();
    };
  }, [
    clearCounts,
    isMobile,
    refreshCounts,
    removeChannel,
    staticTestOverride,
    subscribeForUser,
    userId,
  ]);

  useEffect(() => {
    return () => {
      debouncerRef.current?.cancel();
    };
  }, []);

  return {
    prayerCount: counts.prayerCount,
    inboxCount: counts.inboxCount,
    isLoading,
    refreshCounts,
  };
}
