"use client";

import { useEffect, useMemo, useState } from "react";
import JourneyInboxShell from "../../../components/journey/inbox/JourneyInboxShell";
import JourneyInboxHeader from "../../../components/journey/inbox/JourneyInboxHeader";
import JourneyConversationList from "../../../components/journey/inbox/JourneyConversationList";
import JourneyConversationPanel from "../../../components/journey/inbox/JourneyConversationPanel";
import JourneyConversationContext from "../../../components/journey/inbox/JourneyConversationContext";
import JourneyInboxEmptyState from "../../../components/journey/inbox/JourneyInboxEmptyState";
import { supabase } from "../../../lib/supabaseClient";
import {
  MESSAGE_SELECT,
  PRAYER_VIDEO_BUCKET,
  MAX_PRAYER_VIDEO_SECONDS,
} from "../../../lib/journey/inbox/constants";
import type {
  ClearMessageRequest,
  InboxFilter,
  InboxMessage,
  ReplyMode,
} from "../../../lib/journey/inbox/types";
import {
  buildInboxListItems,
  buildInboxThread,
  filterInboxMessages,
  formatUnreadBadge,
  getInboxItemKey,
  getPrayerThreadIdForInsert,
  getPrayerThreadKey,
  getThreadReplyTarget,
  getVideoDuration,
  groupInboxItemsByTime,
  isLocalInboxMessageId,
  isPrayerConversationMessage,
  isPrayerStorySummary,
  searchInboxItems,
} from "../../../lib/journey/inbox/utils";
import { filterGenuineInboxMessages } from "../../../lib/demo-content/privatePathIsolation";
import styles from "../../../components/journey/inbox/JourneyInbox.module.css";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export default function JourneyInboxPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [prayerStories, setPrayerStories] = useState<
    Record<string, import("../../../lib/journey/inbox/types").PrayerStorySummary>
  >({});
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [clearMessageRequest, setClearMessageRequest] =
    useState<ClearMessageRequest | null>(null);
  const [clearingMessage, setClearingMessage] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [replyMode, setReplyMode] = useState<ReplyMode>("text");
  const [replyText, setReplyText] = useState("");
  const [replyVideoFile, setReplyVideoFile] = useState<File | null>(null);
  const [replyVideoPreviewUrl, setReplyVideoPreviewUrl] = useState("");
  const [replyVideoDuration, setReplyVideoDuration] = useState<number | null>(
    null
  );
  const [replyStatus, setReplyStatus] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const isDesktop = useMediaQuery("(min-width: 1100px)");
  const hideBottomNav = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    async function loadMessages() {
      setLoading(true);
      setStatusMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        setStatusMessage("Please sign in to view your Journey Inbox.");
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("inbox_messages")
        .select(MESSAGE_SELECT)
        .eq("user_id", user.id)
        .is("hidden_at", null)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const rawMessages: unknown[] = Array.isArray(data) ? data : [];

        const nextMessages: InboxMessage[] = rawMessages.filter(
          (message): message is InboxMessage =>
            typeof message === "object" &&
            message !== null &&
            "id" in message &&
            "title" in message &&
            "body" in message &&
            "read" in message &&
            "created_at" in message
        );

        const genuineMessages = await filterGenuineInboxMessages(nextMessages);
        setMessages(genuineMessages);
        await loadPrayerStorySummaries(genuineMessages);
      } else if (error) {
        setStatusMessage(`Could not load your Journey Inbox: ${error.message}`);
        setPrayerStories({});
      }

      setLoading(false);
    }

    loadMessages();
  }, []);

  async function loadPrayerStorySummaries(nextMessages: InboxMessage[]) {
    const storyIds = Array.from(
      new Set(
        nextMessages
          .flatMap((message) => [message.story_id, message.prayer_request_id])
          .filter(
            (storyId): storyId is string =>
              typeof storyId === "string" && storyId.trim().length > 0
          )
      )
    );

    if (storyIds.length === 0) {
      setPrayerStories({});
      return;
    }

    const { data, error } = await supabase
      .from("stories")
      .select("id, name, location, story_text, story_type, created_at")
      .in("id", storyIds);

    if (error || !data) {
      console.error("Could not load prayer thread stories:", error);
      setPrayerStories({});
      return;
    }

    const nextPrayerStories = (Array.isArray(data) ? data : [])
      .filter(isPrayerStorySummary)
      .reduce<
        Record<string, import("../../../lib/journey/inbox/types").PrayerStorySummary>
      >((storyMap, story) => {
        storyMap[story.id] = story;
        return storyMap;
      }, {});

    setPrayerStories(nextPrayerStories);
  }

  useEffect(() => {
    return () => {
      if (replyVideoPreviewUrl) URL.revokeObjectURL(replyVideoPreviewUrl);
    };
  }, [replyVideoPreviewUrl]);

  const allInboxItems = useMemo(
    () => buildInboxListItems(messages),
    [messages]
  );

  const filteredMessages = useMemo(
    () => filterInboxMessages(messages, activeFilter),
    [activeFilter, messages]
  );

  const filteredInboxItems = useMemo(
    () => buildInboxListItems(filteredMessages),
    [filteredMessages]
  );

  const searchedInboxItems = useMemo(
    () => searchInboxItems(filteredInboxItems, searchQuery),
    [filteredInboxItems, searchQuery]
  );

  const groupedInboxItems = useMemo(
    () => groupInboxItemsByTime(searchedInboxItems),
    [searchedInboxItems]
  );

  const selectedItem = useMemo(() => {
    if (!selectedKey) return null;

    return (
      searchedInboxItems.find((item) => getInboxItemKey(item) === selectedKey) ??
      null
    );
  }, [searchedInboxItems, selectedKey]);

  const selectedThread = useMemo(() => {
    if (selectedItem?.kind === "thread") {
      const threadMessages = messages.filter(
        (message) =>
          isPrayerConversationMessage(message) &&
          getPrayerThreadKey(message) === selectedItem.thread.key
      );

      return buildInboxThread(threadMessages);
    }

    return null;
  }, [messages, selectedItem]);

  const selectedMessage =
    selectedItem?.kind === "message" ? selectedItem.message : null;

  const activeReplyTarget = useMemo(() => {
    if (!selectedThread) return null;

    return getThreadReplyTarget(selectedThread, userId);
  }, [selectedThread, userId]);

  const unreadCount = useMemo(
    () => messages.filter((message) => !message.read).length,
    [messages]
  );
  const formattedUnreadCount = formatUnreadBadge(unreadCount);

  const visibleUnreadIds = filteredMessages
    .filter((message) => !message.read && !isLocalInboxMessageId(message.id))
    .map((message) => message.id);

  const showMobileDetail = !isDesktop && selectedKey !== null;

  const panelMode =
    selectedThread !== null
      ? "thread"
      : selectedMessage !== null
        ? "notification"
        : "empty";

  const linkedStoryId =
    selectedThread?.storyId ||
    selectedMessage?.story_id ||
    selectedMessage?.prayer_request_id ||
    null;

  async function markAsRead(id: string) {
    if (!userId) {
      setStatusMessage("Please sign in to update messages.");
      return;
    }

    setStatusMessage("");

    if (isLocalInboxMessageId(id)) {
      setMessages((current) =>
        current.map((message) =>
          message.id === id ? { ...message, read: true } : message
        )
      );
      return;
    }

    const { error } = await supabase
      .from("inbox_messages")
      .update({ read: true })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setStatusMessage(`Could not mark message as read: ${error.message}`);
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, read: true } : message
      )
    );
  }

  async function markVisibleAsRead() {
    if (!userId) {
      setStatusMessage("Please sign in to update messages.");
      return;
    }

    if (visibleUnreadIds.length === 0) return;

    setMarkingAllRead(true);
    setStatusMessage("");

    const { error } = await supabase
      .from("inbox_messages")
      .update({ read: true })
      .eq("user_id", userId)
      .in("id", visibleUnreadIds);

    setMarkingAllRead(false);

    if (error) {
      setStatusMessage(`Could not mark messages as read: ${error.message}`);
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        visibleUnreadIds.includes(message.id)
          ? { ...message, read: true }
          : message
      )
    );
  }

  async function markMessagesAsRead(messageIds: string[]) {
    if (!userId) {
      setStatusMessage("Please sign in to update messages.");
      return;
    }

    const unreadIds = messageIds.filter(
      (messageId) =>
        !isLocalInboxMessageId(messageId) &&
        messages.some((message) => message.id === messageId && !message.read)
    );

    if (unreadIds.length === 0) return;

    setStatusMessage("");

    const { error } = await supabase
      .from("inbox_messages")
      .update({ read: true })
      .eq("user_id", userId)
      .in("id", unreadIds);

    if (error) {
      setStatusMessage(`Could not mark conversation as read: ${error.message}`);
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        unreadIds.includes(message.id) ? { ...message, read: true } : message
      )
    );
  }

  function selectConversation(key: string) {
    setStatusMessage("");
    setReplyStatus("");
    setSelectedKey(key);

    const item =
      allInboxItems.find((entry) => getInboxItemKey(entry) === key) ?? null;

    if (item?.kind === "thread") {
      const unreadIds = item.thread.messages
        .filter((message) => !message.read)
        .map((message) => message.id);

      if (unreadIds.length > 0) {
        void markMessagesAsRead(unreadIds);
      }

      return;
    }

    if (item?.kind === "message" && !item.message.read) {
      void markAsRead(item.message.id);
    }
  }

  const selectedKeyStillVisible = useMemo(() => {
    if (!selectedKey) return false;
    return searchedInboxItems.some(
      (item) => getInboxItemKey(item) === selectedKey
    );
  }, [searchedInboxItems, selectedKey]);

  useEffect(() => {
    if (!isDesktop || loading) return;

    const firstVisible = searchedInboxItems[0];

    if (!firstVisible) {
      if (selectedKey !== null) setSelectedKey(null);
      return;
    }

    if (!selectedKey || !selectedKeyStillVisible) {
      selectConversation(getInboxItemKey(firstVisible));
    }
    // Keep selection stable while the user browses; only auto-pick when empty/missing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDesktop,
    loading,
    searchedInboxItems,
    selectedKey,
    selectedKeyStillVisible,
  ]);

  function backToInboxList() {
    setSelectedKey(null);
    setReplyStatus("");
  }

  function openClearMessageModal(message: InboxMessage) {
    setStatusMessage("");
    setClearMessageRequest({ mode: "single", messages: [message] });
  }

  function openClearAllMessagesModal() {
    if (filteredMessages.length === 0) return;

    setStatusMessage("");
    setClearMessageRequest({ mode: "all", messages: filteredMessages });
  }

  function closeClearMessageModal() {
    setClearMessageRequest(null);
  }

  async function confirmClearMessage() {
    if (!clearMessageRequest) return;

    const messageIds = clearMessageRequest.messages.map((message) => message.id);
    const persistedMessageIds = messageIds.filter(
      (messageId) => !isLocalInboxMessageId(messageId)
    );

    if (messageIds.length === 0) {
      setClearMessageRequest(null);
      return;
    }

    setClearingMessage(true);
    setStatusMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setClearingMessage(false);
      setClearMessageRequest(null);
      setStatusMessage("Please sign in to clear messages.");
      return;
    }

    if (persistedMessageIds.length > 0) {
      const hiddenAt = new Date().toISOString();

      const { error } = await supabase
        .from("inbox_messages")
        .update({ hidden_at: hiddenAt })
        .eq("user_id", user.id)
        .in("id", persistedMessageIds);

      if (error) {
        setClearingMessage(false);
        setStatusMessage(`Could not clear message: ${error.message}`);
        return;
      }
    }

    setClearingMessage(false);

    setMessages((current) =>
      current.filter((message) => !messageIds.includes(message.id))
    );

    if (selectedKey) {
      const clearedSelectionKeys = new Set(
        clearMessageRequest.messages.map((message) =>
          isPrayerConversationMessage(message)
            ? getPrayerThreadKey(message)
            : `message:${message.id}`
        )
      );

      if (clearedSelectionKeys.has(selectedKey)) {
        setSelectedKey(null);
      }
    }

    setClearMessageRequest(null);
    setStatusMessage(
      clearMessageRequest.mode === "all"
        ? "Messages removed from your Journey Inbox."
        : "Message removed from your Journey Inbox."
    );
  }

  async function handleReplyVideoFile(file: File | null) {
    setReplyStatus("");
    setReplyVideoFile(null);
    setReplyVideoDuration(null);

    if (replyVideoPreviewUrl) {
      URL.revokeObjectURL(replyVideoPreviewUrl);
      setReplyVideoPreviewUrl("");
    }

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setReplyStatus("Please choose a video file.");
      return;
    }

    try {
      const duration = await getVideoDuration(file);

      if (duration > MAX_PRAYER_VIDEO_SECONDS + 0.5) {
        setReplyStatus("Prayer video replies must be 30 seconds or less.");
        return;
      }

      setReplyVideoDuration(duration);
      setReplyVideoFile(file);
      setReplyVideoPreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      console.error("Could not validate reply video:", error);
      setReplyStatus("Could not read this video. Please choose another one.");
    }
  }

  async function sendPrayerReply() {
    setReplyStatus("");
    setStatusMessage("");

    if (!userId) {
      setReplyStatus("Please sign in to send a reply.");
      return;
    }

    if (!activeReplyTarget || !activeReplyTarget.sender_user_id) {
      setReplyStatus("Could not find the message sender.");
      return;
    }

    if (activeReplyTarget.sender_user_id === userId) {
      setReplyStatus("You cannot reply to your own message.");
      return;
    }

    setSendingReply(true);

    let videoUrl: string | null = null;
    let body = replyText.trim();

    if (replyMode === "text" && !body) {
      setSendingReply(false);
      setReplyStatus("Write a short reply first.");
      return;
    }

    if (replyMode === "video") {
      if (!replyVideoFile) {
        setSendingReply(false);
        setReplyStatus("Choose or record a video reply first.");
        return;
      }

      const storyOrMessageId = activeReplyTarget.story_id || activeReplyTarget.id;
      const extension =
        replyVideoFile.name.split(".").pop()?.toLowerCase() || "mp4";
      const filePath = `prayer-videos/${storyOrMessageId}/reply-${userId}-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(PRAYER_VIDEO_BUCKET)
        .upload(filePath, replyVideoFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: replyVideoFile.type,
        });

      if (uploadError) {
        setSendingReply(false);
        setReplyStatus(`Could not upload video reply: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(PRAYER_VIDEO_BUCKET)
        .getPublicUrl(filePath);

      videoUrl = publicUrlData.publicUrl;
      body = body || "A believer replied with a prayer video.";
    }

    const messageType =
      replyMode === "video" ? "prayer_video_reply" : "prayer_reply";
    const threadId = getPrayerThreadIdForInsert(activeReplyTarget);
    const parentMessageId = activeReplyTarget.id;
    const recipientReplyTitle =
      replyMode === "video"
        ? "Someone replied with a prayer video"
        : "Someone replied to your prayer video";
    const senderReplyTitle =
      replyMode === "video"
        ? "You replied with a prayer video"
        : "You replied with encouragement";

    const replyRows = [
      {
        user_id: activeReplyTarget.sender_user_id,
        sender_user_id: userId,
        parent_message_id: parentMessageId,
        thread_id: threadId,
        title: recipientReplyTitle,
        body,
        category: "prayer",
        message_type: messageType,
        story_id: activeReplyTarget.story_id,
        prayer_request_id: activeReplyTarget.prayer_request_id,
        action_url: "/journey/inbox",
        video_url: videoUrl,
        read: false,
      },
      {
        user_id: userId,
        sender_user_id: userId,
        parent_message_id: parentMessageId,
        thread_id: threadId,
        title: senderReplyTitle,
        body,
        category: "prayer",
        message_type: messageType,
        story_id: activeReplyTarget.story_id,
        prayer_request_id: activeReplyTarget.prayer_request_id,
        action_url: "/journey/inbox",
        video_url: videoUrl,
        read: true,
      },
    ];

    const { error } = await supabase.from("inbox_messages").insert(replyRows);

    setSendingReply(false);

    if (error) {
      setReplyStatus(`Could not send reply: ${error.message}`);
      return;
    }

    setReplyText("");
    setReplyVideoFile(null);
    setReplyVideoDuration(null);

    if (replyVideoPreviewUrl) {
      URL.revokeObjectURL(replyVideoPreviewUrl);
      setReplyVideoPreviewUrl("");
    }

    setStatusMessage("Prayer reply sent privately.");

    const localSenderMessage: InboxMessage = {
      id: `local-${Date.now()}`,
      user_id: userId,
      sender_user_id: userId,
      parent_message_id: parentMessageId,
      thread_id: threadId,
      title: senderReplyTitle,
      body,
      read: true,
      created_at: new Date().toISOString(),
      category: "prayer",
      message_type: messageType,
      story_id: activeReplyTarget.story_id,
      prayer_request_id: activeReplyTarget.prayer_request_id,
      video_url: videoUrl,
      action_url: "/journey/inbox",
    };

    setMessages((current) => [localSenderMessage, ...current]);
  }

  function handleClearSelected() {
    if (selectedThread) {
      setClearMessageRequest({
        mode: "all",
        messages: selectedThread.messages,
      });
      return;
    }

    if (selectedMessage) {
      openClearMessageModal(selectedMessage);
    }
  }

  return (
    <>
      <JourneyInboxShell
        showMobileDetail={showMobileDetail}
        statusMessage={statusMessage || undefined}
        hideBottomNavPadding={hideBottomNav}
        workspaceHeader={
          <JourneyInboxHeader
            unreadCount={formattedUnreadCount}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onMarkVisibleRead={() => void markVisibleAsRead()}
            onClearVisible={openClearAllMessagesModal}
            markingAllRead={markingAllRead}
            canMarkVisibleRead={visibleUnreadIds.length > 0}
            canClearVisible={filteredMessages.length > 0}
            itemCount={searchedInboxItems.length}
          />
        }
        listPane={
          loading || searchedInboxItems.length === 0 ? (
            <JourneyInboxEmptyState loading={loading} />
          ) : (
            <JourneyConversationList
              groups={groupedInboxItems}
              selectedKey={selectedKey}
              onSelect={selectConversation}
            />
          )
        }
        detailPane={
          <JourneyConversationPanel
            mode={panelMode}
            showMobileBack={showMobileDetail}
            onBack={backToInboxList}
            thread={selectedThread}
            message={selectedMessage}
            story={linkedStoryId ? prayerStories[linkedStoryId] : undefined}
            userId={userId}
            onMarkRead={() => {
              if (selectedThread) {
                void markMessagesAsRead(
                  selectedThread.messages.map((message) => message.id)
                );
              } else if (selectedMessage) {
                void markAsRead(selectedMessage.id);
              }
            }}
            onClear={handleClearSelected}
            canReply={Boolean(activeReplyTarget)}
            replyMode={replyMode}
            onReplyModeChange={setReplyMode}
            replyText={replyText}
            onReplyTextChange={setReplyText}
            replyVideoPreviewUrl={replyVideoPreviewUrl}
            replyVideoDuration={replyVideoDuration}
            replyStatus={replyStatus}
            sendingReply={sendingReply}
            onReplyVideoFile={(file) => void handleReplyVideoFile(file)}
            onSendReply={() => void sendPrayerReply()}
          />
        }
        contextPane={
          isDesktop && selectedKey ? (
            <JourneyConversationContext
              thread={selectedThread}
              message={selectedMessage}
              story={linkedStoryId ? prayerStories[linkedStoryId] : undefined}
            />
          ) : undefined
        }
      />


      {clearMessageRequest ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard} role="dialog" aria-modal="true">
            <h2 className={styles.modalTitle}>
              {clearMessageRequest.mode === "all"
                ? "Remove visible messages?"
                : "Remove from my Inbox?"}
            </h2>

            <p className={styles.modalBody}>
              {clearMessageRequest.mode === "all"
                ? "This removes all visible Journey Inbox messages from your side only. It does not delete the sender's copy."
                : "This removes the message from your Journey Inbox on your side only. It does not delete the sender's copy."}
            </p>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={closeClearMessageModal}
                disabled={clearingMessage}
                className={styles.secondaryAction}
              >
                Not Yet
              </button>

              <button
                type="button"
                onClick={() => void confirmClearMessage()}
                disabled={clearingMessage}
                className={`${styles.primaryAction} ${styles.toolbarButtonDanger}`}
                style={{ background: "#be123c" }}
              >
                {clearingMessage
                  ? "Removing..."
                  : clearMessageRequest.mode === "all"
                    ? "Remove visible messages"
                    : "Remove from my Inbox"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
