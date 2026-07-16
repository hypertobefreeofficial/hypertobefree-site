"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Check,
  ChevronLeft,
  ExternalLink,
  Settings,
  Trash2,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type InboxNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  category: string | null;
  message_type: string | null;
  action_url: string | null;
};

const PRAYER_MESSAGE_TYPES = [
  "prayer_update",
  "answered_prayer",
  "prayer_circle",
  "prayer_video_response",
] as const;

const PRAYER_NOTIFICATION_FILTER =
  `category.eq.prayer,message_type.in.(${PRAYER_MESSAGE_TYPES.join(",")})`;

export default function NotificationsPage() {
  return (
    <Suspense fallback={<NotificationsLoading />}>
      <NotificationsContent />
    </Suspense>
  );
}

function NotificationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prayerOnly = searchParams.get("category") === "prayer";
  const [userId, setUserId] = useState("");
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      let notificationsQuery = supabase
        .from("inbox_messages")
        .select(
          "id, title, body, read, created_at, category, message_type, action_url"
        )
        .eq("user_id", user.id)
        .is("hidden_at", null);

      if (prayerOnly) {
        notificationsQuery = notificationsQuery.or(
          PRAYER_NOTIFICATION_FILTER
        );
      }

      const { data, error } = await notificationsQuery.order("created_at", {
        ascending: false,
      });

      if (cancelled) return;

      if (error) {
        setMessage(`Could not load notifications: ${error.message}`);
        setLoading(false);
        return;
      }

      const rawNotifications: unknown[] = Array.isArray(data) ? data : [];
      setNotifications(rawNotifications.filter(isInboxNotification));
      setLoading(false);
    }

    void loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [prayerOnly, router]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  async function markNotificationRead(notificationId: string) {
    if (!userId) return;

    setMessage("");

    const { error } = await supabase
      .from("inbox_messages")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("user_id", userId);

    if (error) {
      setMessage(`Could not mark notification read: ${error.message}`);
      return;
    }

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification
      )
    );
  }

  async function markAllNotificationsRead() {
    if (!userId || unreadCount === 0) return;

    setMarkingAllRead(true);
    setMessage("");

    let markAllQuery = supabase
      .from("inbox_messages")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false)
      .is("hidden_at", null);

    if (prayerOnly) {
      markAllQuery = markAllQuery.or(PRAYER_NOTIFICATION_FILTER);
    }

    const { error } = await markAllQuery;

    setMarkingAllRead(false);

    if (error) {
      setMessage(`Could not mark notifications read: ${error.message}`);
      return;
    }

    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read: true }))
    );
    setMessage("All notifications marked as read.");
  }

  async function hideNotification(notificationId: string) {
    if (!userId) return;

    setMessage("");

    const { error } = await supabase
      .from("inbox_messages")
      .update({ hidden_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", userId);

    if (error) {
      setMessage(`Could not hide notification: ${error.message}`);
      return;
    }

    setNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId)
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-mobile-nav-clearance text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <Link
            href={prayerOnly ? "/prayer" : "/profile"}
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ChevronLeft className="h-4 w-4" />
            {prayerOnly ? "Prayer" : "Profile"}
          </Link>

          <Link
            href="/profile/notifications"
            className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-blue-100 ring-1 ring-white/15">
            <Bell className="h-4 w-4" />
            {prayerOnly ? "Prayer Updates" : "Notifications"}
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight">
            {prayerOnly ? "Your Prayer Circle alerts" : "Your HTBF alerts"}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-blue-100">
            {prayerOnly
              ? "Prayer updates, answered prayers, Circle activity, and private prayer videos appear here."
              : "Prayer updates, answered prayers, approvals, milestones, and account alerts appear here."}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] bg-white/10 p-4 ring-1 ring-white/15">
            <div className="font-black">
              {unreadCount === 0
                ? "You are all caught up"
                : `${unreadCount > 99 ? "99+" : unreadCount} unread`}
            </div>
            <button
              type="button"
              onClick={markAllNotificationsRead}
              disabled={unreadCount === 0 || markingAllRead}
              className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {markingAllRead ? "Marking..." : "Mark All Read"}
            </button>
          </div>
        </section>

        {message && (
          <div className="mt-5 rounded-[1.5rem] bg-blue-50 p-4 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
            {message}
          </div>
        )}

        {loading ? (
          <div className="mt-5 rounded-[2rem] bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="mt-5 rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <Bell className="mx-auto h-9 w-9 text-[#0b63ce]" />
            <h2 className="mt-3 text-xl font-black text-[#062a57]">
              No notifications yet
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {prayerOnly
                ? "New Prayer Circle updates will appear here."
                : "New prayer, approval, and account alerts will appear here."}
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={`rounded-[1.5rem] p-5 shadow-sm ring-1 ${
                  notification.read
                    ? "bg-white ring-slate-200"
                    : "bg-blue-50 ring-blue-200"
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      notification.read ? "bg-slate-300" : "bg-red-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words font-black text-[#062a57]">
                        {notification.title}
                      </h2>
                      <NotificationTypeBadge notification={notification} />
                    </div>
                    <p
                      className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600"
                      style={{
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {notification.body}
                    </p>
                    <div className="mt-2 text-xs font-semibold text-slate-500">
                      {formatNotificationDate(notification.created_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {!notification.read && (
                    <button
                      type="button"
                      onClick={() => markNotificationRead(notification.id)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Mark Read
                    </button>
                  )}

                  {isInternalActionUrl(notification.action_url) && (
                    <Link
                      href={notification.action_url as string}
                      onClick={() => {
                        if (!notification.read) {
                          void markNotificationRead(notification.id);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#0b63ce] px-3 py-2 text-xs font-black text-white"
                    >
                      View
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}

                  {isExternalActionUrl(notification.action_url) && (
                    <a
                      href={notification.action_url as string}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        if (!notification.read) {
                          void markNotificationRead(notification.id);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#0b63ce] px-3 py-2 text-xs font-black text-white"
                    >
                      View
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => hideNotification(notification.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hide
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

    </main>
  );
}

function NotificationsLoading() {
  return (
    <main className="min-h-screen bg-[#f8fbff] px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-4xl rounded-[2rem] bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
        Loading notifications...
      </div>
    </main>
  );
}

function NotificationTypeBadge({
  notification,
}: {
  notification: InboxNotification;
}) {
  const label = formatNotificationType(
    notification.category || notification.message_type || "HTBF"
  );

  return (
    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#0b63ce] ring-1 ring-blue-100">
      {label}
    </span>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInboxNotification(value: unknown): value is InboxNotification {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.read === "boolean" &&
    typeof value.created_at === "string" &&
    (typeof value.category === "string" || value.category === null) &&
    (typeof value.message_type === "string" || value.message_type === null) &&
    (typeof value.action_url === "string" || value.action_url === null)
  );
}

function isInternalActionUrl(value: string | null) {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

function isExternalActionUrl(value: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function formatNotificationType(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
