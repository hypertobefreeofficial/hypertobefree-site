"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bell,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  UserX,
  UserCircle,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import {
  applyGenuinePublicDemoFilter,
  getDemoContentSchemaCapabilities,
} from "../../../lib/demo-content/eligibility";
import { filterGenuineSavedContentJoinRows } from "../../../lib/demo-content/privatePathIsolation";

type PlaceholderContent = {
  eyebrow: string;
  title: string;
  description: string;
};

type EditProfileRow = {
  display_name: string | null;
  username: string | null;
  bio: string | null;
  location: string | null;
  show_location: boolean | null;
  show_real_name: boolean | null;
};

type AccountCenterProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  username: string | null;
};

type CategoryItem = {
  badge?: string;
  href?: string;
  text: string;
  title: string;
  tone?: "default" | "danger";
  type?: "delete-account";
};

type CategoryContent = {
  description: string;
  eyebrow: string;
  items: CategoryItem[];
  title: string;
};

type NotificationPreferenceKey =
  | "prayer"
  | "story"
  | "praise"
  | "videoReply";

type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

type SavedFilter = "all" | "stories" | "videos" | "prayer" | "praise";

type SavedStory = {
  id: string;
  user_id: string | null;
  name: string | null;
  story_type: string | null;
  story_text: string | null;
  image_url: string | null;
  video_url: string | null;
  prayer_status: string | null;
  answered_text: string | null;
  status: string | null;
  created_at: string | null;
};

type SavedContentItem = {
  story_id: string;
  saved_at: string | null;
  story: SavedStory;
};

type BlockedUserItem = {
  blocked_user_id: string;
  created_at: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  prayer: true,
  story: true,
  praise: true,
  videoReply: true,
};

const NOTIFICATION_PREFERENCE_OPTIONS: Array<{
  key: NotificationPreferenceKey;
  title: string;
  text: string;
}> = [
  {
    key: "prayer",
    title: "Prayer Notifications",
    text: "Prayer Circle updates and answered-prayer alerts.",
  },
  {
    key: "story",
    title: "Story Notifications",
    text: "Story approval and community response alerts.",
  },
  {
    key: "praise",
    title: "Praise Notifications",
    text: "Praise report and God Did It updates.",
  },
  {
    key: "videoReply",
    title: "Video Reply Notifications",
    text: "Private prayer video and testimony response alerts.",
  },
];

const categoryContent: Record<string, CategoryContent> = {
  "account-security": {
    eyebrow: "Account Center",
    title: "Account & Security",
    description:
      "Manage private sign-in details, security tools, sessions, and account deletion.",
    items: [
      {
        title: "Account Info",
        text: "Private sign-in email and account details.",
        href: "/profile/account-info",
      },
      {
        title: "Change Email",
        text: "Update the email used for signing in.",
        badge: "Soon",
        href: "/profile/change-email",
      },
      {
        title: "Change Password",
        text: "Update your password safely.",
        badge: "Soon",
        href: "/profile/change-password",
      },
      {
        title: "Two-Factor Authentication",
        text: "Add an extra layer of account protection.",
        badge: "Soon",
        href: "/profile/two-factor-authentication",
      },
      {
        title: "Active Sessions",
        text: "Review devices signed in to your account.",
        badge: "Soon",
        href: "/profile/active-sessions",
      },
      {
        title: "Delete Account",
        text: "Request safe account deletion support.",
        tone: "danger",
        type: "delete-account",
      },
    ],
  },
  "privacy-safety": {
    eyebrow: "Account Center",
    title: "Privacy & Safety",
    description:
      "Control visibility, location sharing, muted or blocked users, and reports.",
    items: [
      {
        title: "Privacy Settings",
        text: "Control profile privacy from one place.",
        href: "/profile/privacy-settings",
      },
      {
        title: "Profile Visibility",
        text: "Choose who can view your HTBF profile.",
        badge: "Soon",
        href: "/profile/profile-visibility",
      },
      {
        title: "Location Visibility",
        text: "Control when your location appears.",
        badge: "Soon",
        href: "/profile/location-visibility",
      },
      {
        title: "Blocked Users",
        text: "Manage people you have blocked.",
        badge: "Soon",
        href: "/profile/blocked-users",
      },
      {
        title: "Muted Users",
        text: "Manage accounts you have muted.",
        badge: "Soon",
        href: "/profile/muted-users",
      },
      {
        title: "Reported Content",
        text: "Review content reports you have submitted.",
        badge: "Soon",
        href: "/profile/reported-content",
      },
    ],
  },
  notifications: {
    eyebrow: "Account Center",
    title: "Notifications",
    description:
      "Choose how HTBF keeps you aware of prayer, story, praise, and email updates.",
    items: [
      {
        title: "Prayer Notifications",
        text: "Prayer request, Prayer Circle, and answered-prayer alerts.",
        badge: "Soon",
        href: "/profile/prayer-notifications",
      },
      {
        title: "Story Notifications",
        text: "Story approval, reply, and community response alerts.",
        badge: "Soon",
        href: "/profile/story-notifications",
      },
      {
        title: "Praise Notifications",
        text: "Answered-prayer and praise report updates.",
        badge: "Soon",
        href: "/profile/praise-notifications",
      },
      {
        title: "Email Notifications",
        text: "Choose which HTBF emails you receive.",
        badge: "Soon",
        href: "/profile/email-notifications",
      },
    ],
  },
  "content-management": {
    eyebrow: "Account Center",
    title: "Content Management",
    description:
      "Review and manage your posts, videos, prayers, praise reports, and saved content.",
    items: [
      {
        title: "My Stories",
        text: "Review stories and written encouragement.",
        href: "/profile/my-stories",
      },
      {
        title: "My Videos",
        text: "Review your video testimonies.",
        href: "/profile/my-videos",
      },
      {
        title: "My Prayer Requests",
        text: "Manage prayer requests you shared.",
        href: "/profile/my-prayer-requests",
      },
      {
        title: "My Praise Reports",
        text: "Review praise and answered-prayer moments.",
        href: "/profile/my-praise-reports",
      },
      {
        title: "Saved Content",
        text: "Return to saved stories and testimonies.",
        badge: "Soon",
        href: "/profile/saved-content",
      },
      {
        title: "Archived / Hidden Content",
        text: "Manage items you hid or archived.",
        badge: "Soon",
        href: "/profile/archived-hidden-content",
      },
    ],
  },
  support: {
    eyebrow: "Account Center",
    title: "Support",
    description:
      "Find help, report an issue, and review HTBF guidelines, privacy, and terms.",
    items: [
      {
        title: "Help Center",
        text: "Find help using HTBF.",
        badge: "Soon",
        href: "/profile/help-center",
      },
      {
        title: "Report a Problem",
        text: "Tell HTBF about a bug or account issue.",
        badge: "Soon",
        href: "/profile/report-a-problem",
      },
      {
        title: "Community Guidelines",
        text: "Review how we keep HTBF safe.",
        badge: "Soon",
        href: "/profile/community-guidelines",
      },
      {
        title: "Privacy Policy",
        text: "Read HTBF privacy practices.",
        badge: "Soon",
        href: "/profile/privacy-policy",
      },
      {
        title: "Terms of Service",
        text: "Review HTBF terms and platform rules.",
        badge: "Soon",
        href: "/profile/terms-of-service",
      },
    ],
  },
};

const placeholderContent: Record<string, PlaceholderContent> = {
  "account-info": {
    eyebrow: "Account & Security",
    title: "Account Info",
    description:
      "Private account details, including sign-in email, will live here.",
  },
  "change-email": {
    eyebrow: "Account & Security",
    title: "Change Email",
    description:
      "Email change tools will be added here with safe verification steps.",
  },
  "change-password": {
    eyebrow: "Account & Security",
    title: "Change Password",
    description:
      "Password update tools will be added here when account security settings are connected.",
  },
  "two-factor-authentication": {
    eyebrow: "Account & Security",
    title: "Two-Factor Authentication",
    description:
      "Two-factor authentication setup will live here in a future security pass.",
  },
  "active-sessions": {
    eyebrow: "Account & Security",
    title: "Active Sessions",
    description:
      "Signed-in device and session management will be added here.",
  },
  "download-my-data": {
    eyebrow: "Account & Security",
    title: "Download My Data",
    description:
      "A future export tool will help you download your HTBF account data.",
  },
  "privacy-settings": {
    eyebrow: "Privacy & Safety",
    title: "Privacy Settings",
    description:
      "Profile privacy controls will be expanded here without cluttering your main profile.",
  },
  "blocked-users": {
    eyebrow: "Privacy & Safety",
    title: "Blocked Users",
    description:
      "A list of blocked users and unblock controls will be added here.",
  },
  "muted-users": {
    eyebrow: "Privacy & Safety",
    title: "Muted Users",
    description:
      "Muted account management will be added here when muting is connected.",
  },
  "reported-content": {
    eyebrow: "Privacy & Safety",
    title: "Reported Content",
    description:
      "Reports you have submitted will be organized here in a future moderation pass.",
  },
  "profile-visibility": {
    eyebrow: "Privacy & Safety",
    title: "Profile Visibility",
    description:
      "Controls for who can view your HTBF profile will be added here.",
  },
  "location-visibility": {
    eyebrow: "Privacy & Safety",
    title: "Location Visibility",
    description:
      "Location display preferences will be managed here.",
  },
  "my-stories": {
    eyebrow: "Content Management",
    title: "My Stories",
    description:
      "Your written stories and encouragement posts will be organized here.",
  },
  "my-videos": {
    eyebrow: "Content Management",
    title: "My Videos",
    description:
      "Your video testimonies and video posts will be organized here.",
  },
  "my-prayer-requests": {
    eyebrow: "Content Management",
    title: "My Prayer Requests",
    description:
      "Prayer requests you have shared will be easier to manage here.",
  },
  "my-praise-reports": {
    eyebrow: "Content Management",
    title: "My Praise Reports",
    description:
      "Praise reports and answered-prayer moments will be organized here.",
  },
  "saved-content": {
    eyebrow: "Content Management",
    title: "Saved Content",
    description:
      "Saved stories, videos, and prayer posts will be collected here.",
  },
  "archived-hidden-content": {
    eyebrow: "Content Management",
    title: "Archived / Hidden Content",
    description:
      "Items you archived or hid will be managed here.",
  },
  "prayer-notifications": {
    eyebrow: "Notifications",
    title: "Prayer Notifications",
    description:
      "Prayer request, Prayer Circle, and answered-prayer notification controls will live here.",
  },
  "story-notifications": {
    eyebrow: "Notifications",
    title: "Story Notifications",
    description:
      "Story approval, comment, and community response notification controls will live here.",
  },
  "praise-notifications": {
    eyebrow: "Notifications",
    title: "Praise Notifications",
    description:
      "Praise report and God Did It notification preferences will live here.",
  },
  "email-notifications": {
    eyebrow: "Notifications",
    title: "Email Notifications",
    description:
      "Email preference controls will be added here when email settings are connected.",
  },
  "help-center": {
    eyebrow: "Support",
    title: "Help Center",
    description:
      "Help articles and common HTBF questions will be gathered here.",
  },
  "report-a-problem": {
    eyebrow: "Support",
    title: "Report a Problem",
    description:
      "A focused support form for bugs and account issues will be added here.",
  },
  "community-guidelines": {
    eyebrow: "Support",
    title: "Community Guidelines",
    description:
      "HTBF community expectations and safety guidelines will live here.",
  },
  "privacy-policy": {
    eyebrow: "Support",
    title: "Privacy Policy",
    description:
      "HTBF privacy policy content will be added here.",
  },
  "terms-of-service": {
    eyebrow: "Support",
    title: "Terms of Service",
    description:
      "HTBF terms of service content will be added here.",
  },
  "edit-profile": {
    eyebrow: "Public Profile",
    title: "Edit Profile",
    description:
      "A focused editor for display name, username, bio, and location will be added here.",
  },
  edit: {
    eyebrow: "Public Profile",
    title: "Edit Profile",
    description:
      "A focused editor for display name, username, bio, and location will be added here.",
  },
  "public-preview": {
    eyebrow: "Public Profile",
    title: "View Public Profile",
    description:
      "A preview of how your future public profile appears will be added here.",
  },
};

export default function ProfileAccountCenterPlaceholderPage() {
  const params = useParams<{ section?: string }>();
  const section = Array.isArray(params.section)
    ? params.section[0]
    : params.section;

  if (section === "edit" || section === "edit-profile") {
    return <EditProfileSection />;
  }

  if (section === "notifications") {
    return <NotificationSettingsSection />;
  }

  if (section === "content-management" || section === "saved-content") {
    return <SavedContentSection />;
  }

  if (section === "privacy-safety" || section === "blocked-users") {
    return <BlockedUsersSection />;
  }

  if (section && categoryContent[section]) {
    return <AccountCenterCategoryPage content={categoryContent[section]} />;
  }

  const content =
    placeholderContent[section ?? ""] ?? {
      eyebrow: "Account Center",
      title: "Profile Tool",
      description:
        "This focused Account Center page is coming soon inside HTBF.",
    };

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-mobile-nav-clearance text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ChevronLeft className="h-4 w-4" />
            Profile
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Account Center
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <Sparkles className="h-4 w-4" />
            {content.eyebrow}
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            {content.title}
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            {content.description}
          </p>

          <AccountCenterIdentity />

          <div className="mt-6 rounded-[1.5rem] bg-slate-50 p-4 text-sm leading-6 text-slate-600 ring-1 ring-slate-100">
            This page is a placeholder for Phase 4C. The route is ready, and the
            focused functionality can be connected in a later pass.
          </div>

          <Link
            href="/profile"
            className="mt-6 inline-flex rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f]"
          >
            Back to Profile
          </Link>
        </section>
      </div>

    </main>
  );
}

function AccountCenterIdentity() {
  const [avatarUrl, setAvatarUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    async function loadIdentity() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, display_name, username")
        .eq("id", user.id)
        .maybeSingle();

      const profile = data as AccountCenterProfileRow | null;

      setAvatarUrl(profile?.avatar_url ?? "");
      setDisplayName(profile?.display_name ?? "");
      setUsername(profile?.username ?? "");
    }

    loadIdentity();
  }, []);

  const profileName =
    displayName.trim() || username.trim() || "Your HTBF Profile";

  return (
    <div className="mt-6 flex items-center gap-4 rounded-[1.5rem] bg-blue-50 p-4 ring-1 ring-blue-100">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-[#0b63ce] ring-1 ring-blue-100">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`${profileName} profile photo`}
            fill
            sizes="56px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <UserCircle className="h-10 w-10" />
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate font-black text-[#062a57]">{profileName}</div>
        <div className="mt-1 truncate text-sm font-semibold text-slate-600">
          {username ? `@${username}` : "Account Center"}
        </div>
      </div>
    </div>
  );
}

function NotificationSettingsSection() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadPreferences() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const savedPreferences = window.localStorage.getItem(
        getNotificationPreferenceStorageKey(user.id)
      );

      if (savedPreferences) {
        try {
          const parsedPreferences: unknown = JSON.parse(savedPreferences);

          if (isNotificationPreferences(parsedPreferences)) {
            setPreferences(parsedPreferences);
          }
        } catch {
          window.localStorage.removeItem(
            getNotificationPreferenceStorageKey(user.id)
          );
        }
      }

      setLoading(false);
    }

    void loadPreferences();
  }, [router]);

  function togglePreference(key: NotificationPreferenceKey) {
    if (!userId) return;

    setPreferences((current) => {
      const nextPreferences = { ...current, [key]: !current[key] };

      window.localStorage.setItem(
        getNotificationPreferenceStorageKey(userId),
        JSON.stringify(nextPreferences)
      );

      return nextPreferences;
    });
    setMessage("Notification preference saved on this device.");
  }

  return (
    <AccountCenterDataShell
      icon={<Bell className="h-4 w-4" />}
      eyebrow="Notification Settings"
      title="Choose what keeps you informed"
      description="Manage notification preferences here. Your actual alerts live in the separate Notification Inbox."
    >
      <div className="mt-6 rounded-[1.5rem] bg-blue-50 p-4 ring-1 ring-blue-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-black text-[#062a57]">Notification Inbox</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Read prayer updates, approvals, answered prayers, and other HTBF
              alerts.
            </p>
          </div>
          <Link
            href="/notifications"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#0b63ce] px-4 py-2.5 text-sm font-black text-white"
          >
            Open Inbox
          </Link>
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 ring-1 ring-emerald-100">
          {message}
        </div>
      )}

      {loading ? (
        <AccountCenterLoading text="Loading notification settings..." />
      ) : (
        <div className="mt-5 space-y-3">
          {NOTIFICATION_PREFERENCE_OPTIONS.map((option) => (
            <NotificationPreferenceToggle
              key={option.key}
              enabled={preferences[option.key]}
              text={option.text}
              title={option.title}
              onToggle={() => togglePreference(option.key)}
            />
          ))}

          <NotificationPreferencePlaceholder
            title="Email Notifications"
            text="Email delivery preferences will appear here when HTBF email alerts are connected."
          />
          <NotificationPreferencePlaceholder
            title="Push Notifications"
            text="Push notification controls are coming in a future release."
          />
        </div>
      )}

      <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">
        Current preferences are saved on this device and do not remove messages
        from your Notification Inbox.
      </p>
    </AccountCenterDataShell>
  );
}

function NotificationPreferenceToggle({
  enabled,
  onToggle,
  text,
  title,
}: {
  enabled: boolean;
  onToggle: () => void;
  text: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="min-w-0">
        <div className="font-black text-[#062a57]">{title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Disable" : "Enable"} ${title}`}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          enabled ? "bg-[#0b63ce]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
            enabled ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

function NotificationPreferencePlaceholder({
  text,
  title,
}: {
  text: string;
  title: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[1.5rem] bg-slate-50 p-4 opacity-75 ring-1 ring-slate-100">
      <div>
        <div className="font-black text-[#062a57]">{title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
      </div>
      <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 ring-1 ring-slate-200">
        Coming Soon
      </span>
    </div>
  );
}

function SavedContentSection() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [items, setItems] = useState<SavedContentItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<SavedFilter>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSavedContent() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const demoCapabilities = await getDemoContentSchemaCapabilities();
      let query = supabase
        .from("saved_content")
        .select(
          "story_id, created_at, is_demo, stories(id, user_id, name, story_type, story_text, image_url, video_url, prayer_status, answered_text, status, created_at, is_demo)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      query = applyGenuinePublicDemoFilter(
        query,
        "saved_content",
        demoCapabilities
      );

      const { data, error } = await query;

      if (error) {
        setMessage(`Could not load saved content: ${error.message}`);
        setLoading(false);
        return;
      }

      setItems(
        parseSavedContentItems(filterGenuineSavedContentJoinRows((data as unknown[]) ?? []))
      );
      setLoading(false);
    }

    void loadSavedContent();
  }, [router]);

  const filteredItems = items.filter((item) =>
    savedStoryMatchesFilter(item.story, activeFilter)
  );

  async function removeSavedItem(storyId: string) {
    if (!userId) return;

    const { error } = await supabase
      .from("saved_content")
      .delete()
      .eq("user_id", userId)
      .eq("story_id", storyId);

    if (error) {
      setMessage(`Could not remove saved content: ${error.message}`);
      return;
    }

    setItems((current) => current.filter((item) => item.story_id !== storyId));
    setMessage("Removed from saved content.");
  }

  const filters: { label: string; value: SavedFilter }[] = [
    { label: "All", value: "all" },
    { label: "Stories", value: "stories" },
    { label: "Videos", value: "videos" },
    { label: "Prayer", value: "prayer" },
    { label: "Praise", value: "praise" },
  ];

  return (
    <AccountCenterDataShell
      icon={<Bookmark className="h-4 w-4" />}
      eyebrow="Content Management"
      title="Saved Content"
      description="Return to stories, videos, prayer requests, and praise moments you saved."
    >
      <div className="mt-6 flex max-w-full gap-2 overflow-x-auto pb-1">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setActiveFilter(filter.value)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ring-1 ${
              activeFilter === filter.value
                ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
                : "bg-white text-slate-600 ring-slate-200"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {message && (
        <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
          {message}
        </div>
      )}

      {loading ? (
        <AccountCenterLoading text="Loading saved content..." />
      ) : filteredItems.length === 0 ? (
        <AccountCenterEmpty text="No saved content in this category yet." />
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {filteredItems.map((item) => (
            <article
              key={item.story_id}
              className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-[#0b63ce]">
                    {item.story.story_type || "Story"}
                  </div>
                  <h2 className="mt-1 break-words font-black text-[#062a57]">
                    {item.story.name || "HTBF Community"}
                  </h2>
                </div>
                <Bookmark className="h-5 w-5 shrink-0 fill-current text-[#0b63ce]" />
              </div>

              <p className="mt-3 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                {item.story.story_text ||
                  item.story.answered_text ||
                  "Saved HTBF media post"}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={
                    item.story.video_url
                      ? `/video-feed?story=${item.story.id}`
                      : "/feed"
                  }
                  className="rounded-full bg-[#0b63ce] px-3 py-2 text-xs font-black text-white"
                >
                  View
                </Link>
                <button
                  type="button"
                  onClick={() => removeSavedItem(item.story_id)}
                  className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200"
                >
                  Remove Saved Item
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AccountCenterDataShell>
  );
}

function BlockedUsersSection() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadBlockedUsers() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const { data: blockData, error: blockError } = await supabase
        .from("blocked_users")
        .select("blocked_user_id, created_at")
        .eq("blocker_user_id", user.id)
        .order("created_at", { ascending: false });

      if (blockError) {
        setMessage(`Could not load blocked users: ${blockError.message}`);
        setLoading(false);
        return;
      }

      const blockRows = parseBlockedRows(blockData);
      const blockedIds = blockRows.map((row) => row.blocked_user_id);

      if (blockedIds.length === 0) {
        setBlockedUsers([]);
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", blockedIds);

      if (profileError) {
        setMessage(`Could not load blocked profiles: ${profileError.message}`);
      }

      const profileMap = parseBlockedProfiles(profileData);

      setBlockedUsers(
        blockRows.map((row) => ({
          ...row,
          display_name: profileMap.get(row.blocked_user_id)?.display_name ?? null,
          username: profileMap.get(row.blocked_user_id)?.username ?? null,
          avatar_url: profileMap.get(row.blocked_user_id)?.avatar_url ?? null,
        }))
      );
      setLoading(false);
    }

    void loadBlockedUsers();
  }, [router]);

  async function unblockUser(blockedUserId: string) {
    if (!userId) return;

    const { error } = await supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_user_id", userId)
      .eq("blocked_user_id", blockedUserId);

    if (error) {
      setMessage(`Could not unblock user: ${error.message}`);
      return;
    }

    setBlockedUsers((current) =>
      current.filter((user) => user.blocked_user_id !== blockedUserId)
    );
    setMessage("User unblocked.");
  }

  return (
    <AccountCenterDataShell
      icon={<UserX className="h-4 w-4" />}
      eyebrow="Privacy & Safety"
      title="Blocked Users"
      description="Blocked accounts are hidden from your Freedom Feed and Video Feed."
    >
      {message && (
        <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
          {message}
        </div>
      )}

      {loading ? (
        <AccountCenterLoading text="Loading blocked users..." />
      ) : blockedUsers.length === 0 ? (
        <AccountCenterEmpty text="You have not blocked anyone." />
      ) : (
        <div className="mt-5 space-y-3">
          {blockedUsers.map((blockedUser) => {
            const name =
              blockedUser.display_name ||
              blockedUser.username ||
              "Blocked HTBF user";

            return (
              <article
                key={blockedUser.blocked_user_id}
                className="flex items-center gap-4 rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100"
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-[#0b63ce] ring-1 ring-slate-200">
                  {blockedUser.avatar_url ? (
                    <Image
                      src={blockedUser.avatar_url}
                      alt={`${name} profile photo`}
                      fill
                      sizes="48px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <UserCircle className="h-9 w-9" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-black text-[#062a57]">
                    {name}
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-500">
                    {blockedUser.username
                      ? `@${blockedUser.username}`
                      : "Profile hidden"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => unblockUser(blockedUser.blocked_user_id)}
                  className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100"
                >
                  Unblock
                </button>
              </article>
            );
          })}
        </div>
      )}
    </AccountCenterDataShell>
  );
}

function AccountCenterDataShell({
  children,
  description,
  eyebrow,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[#f8fbff] pb-mobile-nav-clearance text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ChevronLeft className="h-4 w-4" />
            Profile
          </Link>
          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Account Center
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            {icon}
            {eyebrow}
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-[#062a57]">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            {description}
          </p>
          <AccountCenterIdentity />
          {children}
        </section>
      </div>

    </main>
  );
}

function AccountCenterLoading({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-[1.5rem] bg-slate-50 p-5 text-sm font-semibold text-slate-600 ring-1 ring-slate-100">
      {text}
    </div>
  );
}

function AccountCenterEmpty({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-[1.5rem] bg-slate-50 p-6 text-center text-sm leading-6 text-slate-600 ring-1 ring-slate-100">
      {text}
    </div>
  );
}

function AccountCenterCategoryPage({ content }: { content: CategoryContent }) {
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-mobile-nav-clearance text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ChevronLeft className="h-4 w-4" />
            Profile
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Account Center
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <Sparkles className="h-4 w-4" />
            {content.eyebrow}
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            {content.title}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            {content.description}
          </p>

          <AccountCenterIdentity />

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {content.items.map((item) => (
              <CategoryActionCard
                key={item.title}
                item={item}
                onDeleteAccount={() => setDeleteAccountOpen(true)}
              />
            ))}
          </div>
        </section>
      </div>


      {deleteAccountOpen && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-red-700">
              HYPER TO BE FREE
            </div>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Delete account?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Account deletion is permanent. For now, please contact HTBF
              support so your account, uploads, messages, and prayer activity can
              be handled safely.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setDeleteAccountOpen(false)}
                className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
              >
                Not Yet
              </button>
              <a
                href="mailto:support@hypertobefree.com?subject=Delete%20my%20HTBF%20account"
                className="flex-1 rounded-full bg-red-600 px-5 py-3 text-center text-sm font-black text-white"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function CategoryActionCard({
  item,
  onDeleteAccount,
}: {
  item: CategoryItem;
  onDeleteAccount: () => void;
}) {
  const isDanger = item.tone === "danger";
  const className = `group rounded-[1.5rem] p-4 text-left ring-1 transition ${
    isDanger
      ? "bg-red-50 text-red-800 ring-red-100 hover:bg-red-100"
      : "bg-slate-50 text-slate-900 ring-slate-100 hover:bg-blue-50 hover:ring-blue-100"
  }`;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2
          className={`font-black ${
            isDanger ? "text-red-800" : "text-[#062a57]"
          }`}
        >
          {item.title}
        </h2>
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 ${
            isDanger ? "text-red-500" : "text-[#0b63ce]"
          }`}
        />
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
      {item.badge && (
        <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#0b63ce] ring-1 ring-blue-100">
          {item.badge}
        </span>
      )}
    </>
  );

  if (item.type === "delete-account") {
    return (
      <button type="button" onClick={onDeleteAccount} className={className}>
        {body}
      </button>
    );
  }

  return (
    <Link href={item.href ?? "/profile"} className={className}>
      {body}
    </Link>
  );
}

function EditProfileSection() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [showLocation, setShowLocation] = useState(true);
  const [showRealName, setShowRealName] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "display_name, username, bio, location, show_location, show_real_name"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load profile: ${error.message}`);
        setLoading(false);
        return;
      }

      const profile = data as EditProfileRow | null;

      setDisplayName(profile?.display_name ?? "");
      setUsername(profile?.username ?? "");
      setBio(profile?.bio ?? "");
      setLocation(profile?.location ?? "");
      setShowLocation(profile?.show_location ?? true);
      setShowRealName(profile?.show_real_name ?? false);
      setLoading(false);
    }

    loadProfile();
  }, [router]);

  function cleanUsername(value: string) {
    return value
      .toLowerCase()
      .replace("@", "")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!userId) {
      setMessage("Please sign in again before saving your profile.");
      return;
    }

    const cleanDisplayName = displayName.trim();
    const cleanUsernameValue = cleanUsername(username);

    if (!cleanDisplayName) {
      setMessage("Please add a display name.");
      return;
    }

    if (!cleanUsernameValue || cleanUsernameValue.length < 3) {
      setMessage("Please choose a username with at least 3 characters.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: email || null,
        display_name: cleanDisplayName,
        username: cleanUsernameValue,
        bio: bio.trim() || null,
        location: location.trim() || null,
        show_location: showLocation,
        show_real_name: showRealName,
        profile_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    setSaving(false);

    if (error) {
      if (
        error.message.toLowerCase().includes("duplicate") ||
        error.message.toLowerCase().includes("unique")
      ) {
        setMessage("That username is already taken. Try another one.");
        return;
      }

      setMessage(`Could not save profile: ${error.message}`);
      return;
    }

    setUsername(cleanUsernameValue);
    setMessage("Profile updated.");
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-mobile-nav-clearance text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ChevronLeft className="h-4 w-4" />
            Profile
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Edit Profile
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <Sparkles className="h-4 w-4" />
            Public Profile
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            Edit Profile
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            Update your HTBF identity. Your sign-in email stays private and is
            not shown here.
          </p>

          {message && (
            <div className="mt-5 rounded-[1.5rem] bg-blue-50 p-4 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
              {message}
            </div>
          )}

          {loading ? (
            <div className="mt-6 rounded-[1.5rem] bg-slate-50 p-4 text-sm leading-6 text-slate-600 ring-1 ring-slate-100">
              Loading profile...
            </div>
          ) : (
            <form onSubmit={saveProfile} className="mt-6 space-y-5">
              <Field label="Display name">
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Example: Lou"
                  className="input-style"
                />
              </Field>

              <Field label="Username">
                <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
                  <span className="font-black text-slate-400">@</span>
                  <input
                    value={username}
                    onChange={(event) =>
                      setUsername(cleanUsername(event.target.value))
                    }
                    placeholder="example_username"
                    className="w-full bg-transparent px-2 py-3 outline-none"
                  />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Usernames use lowercase letters, numbers, or underscores.
                </p>
              </Field>

              <Field label="Bio / testimony line">
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Example: Thankful for what God is doing."
                  className="min-h-28 input-style"
                />
              </Field>

              <Field label="Location">
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="City, State, or Country"
                  className="input-style"
                />
              </Field>

              <div className="space-y-3 rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
                <ToggleRow
                  title="Show my location"
                  text="Allow your location to appear with your profile and posts."
                  checked={showLocation}
                  onChange={setShowLocation}
                />
                <ToggleRow
                  title="Show my real name"
                  text="If turned off, HTBF uses your display name instead."
                  checked={showRealName}
                  onChange={setShowRealName}
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <Link
                  href="/profile"
                  className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-center text-sm font-black text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </section>
      </div>

    </main>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getNotificationPreferenceStorageKey(userId: string) {
  return `htbf-notification-preferences-${userId}`;
}

function isNotificationPreferences(
  value: unknown
): value is NotificationPreferences {
  if (!isRecord(value)) return false;

  return (
    typeof value.prayer === "boolean" &&
    typeof value.story === "boolean" &&
    typeof value.praise === "boolean" &&
    typeof value.videoReply === "boolean"
  );
}

function parseSavedContentItems(value: unknown): SavedContentItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.story_id !== "string") {
      return [];
    }

    const relationship = Array.isArray(candidate.stories)
      ? candidate.stories[0]
      : candidate.stories;

    if (!isRecord(relationship) || typeof relationship.id !== "string") {
      return [];
    }

    const story: SavedStory = {
      id: relationship.id,
      user_id: readNullableString(relationship.user_id),
      name: readNullableString(relationship.name),
      story_type: readNullableString(relationship.story_type),
      story_text: readNullableString(relationship.story_text),
      image_url: readNullableString(relationship.image_url),
      video_url: readNullableString(relationship.video_url),
      prayer_status: readNullableString(relationship.prayer_status),
      answered_text: readNullableString(relationship.answered_text),
      status: readNullableString(relationship.status),
      created_at: readNullableString(relationship.created_at),
    };

    if (story.status === "removed") return [];

    return [
      {
        story_id: candidate.story_id,
        saved_at: readNullableString(candidate.created_at),
        story,
      },
    ];
  });
}

function savedStoryMatchesFilter(story: SavedStory, filter: SavedFilter) {
  if (filter === "all") return true;

  const storyType = (story.story_type ?? "").toLowerCase();
  const isVideo = Boolean(story.video_url);
  const isPrayer = storyType.includes("prayer");
  const isPraise =
    storyType.includes("praise") ||
    storyType.includes("answered") ||
    story.prayer_status === "answered" ||
    Boolean(story.answered_text);

  if (filter === "videos") return isVideo;
  if (filter === "prayer") return isPrayer;
  if (filter === "praise") return isPraise;

  return !isVideo && !isPrayer && !isPraise;
}

function parseBlockedRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as { blocked_user_id: string; created_at: string | null }[];
  }

  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.blocked_user_id !== "string") {
      return [];
    }

    return [
      {
        blocked_user_id: candidate.blocked_user_id,
        created_at: readNullableString(candidate.created_at),
      },
    ];
  });
}

function parseBlockedProfiles(value: unknown) {
  const profiles = new Map<
    string,
    {
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
    }
  >();

  if (!Array.isArray(value)) return profiles;

  value.forEach((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string") return;

    profiles.set(candidate.id, {
      display_name: readNullableString(candidate.display_name),
      username: readNullableString(candidate.username),
      avatar_url: readNullableString(candidate.avatar_url),
    });
  });

  return profiles;
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-black text-[#062a57]">{label}</div>
      {children}
    </label>
  );
}

function ToggleRow({
  checked,
  onChange,
  text,
  title,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  text: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div>
        <div className="font-black text-[#062a57]">{title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${
          checked ? "bg-[#0b63ce]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
