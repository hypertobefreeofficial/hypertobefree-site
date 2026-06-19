"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  MapPin,
  MoreHorizontal,
  Sparkles,
  UserCircle,
} from "lucide-react";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  display_name: string | null;
  username: string | null;
  location: string | null;
  bio: string | null;
  show_location: boolean | null;
  profile_visibility?: string | null;
};

type ProfileStoryRow = {
  story_type: string | null;
  video_url: string | null;
  prayer_status?: string | null;
  answered_text?: string | null;
  status?: string | null;
};

type ProfileStats = {
  stories: number;
  videos: number;
  prayers: number;
  praise: number;
};

type CompletionItem = {
  complete: boolean;
  helper: string;
  title: string;
};

type AccountAction = {
  badge?: string;
  disabled?: boolean;
  meta?: string;
  onClick?: () => void;
  text: string;
  title: string;
  tone?: "default" | "danger";
};

const emptyProfileStats: ProfileStats = {
  stories: 0,
  videos: 0,
  prayers: 0,
  praise: 0,
};

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState("");
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [showLocation, setShowLocation] = useState(true);
  const [privacyConfigured, setPrivacyConfigured] = useState(false);
  const [stats, setStats] = useState<ProfileStats>(emptyProfileStats);

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

      const userEmail = user.email ?? "";
      setEmail(userEmail);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "display_name, username, location, bio, show_location, profile_visibility"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load profile: ${error.message}`);
        setLoading(false);
        return;
      }

      const profile = data as ProfileRow | null;

      setDisplayName(profile?.display_name ?? "");
      setUsername(profile?.username ?? "");
      setLocation(profile?.location ?? "");
      setBio(profile?.bio ?? "");
      setShowLocation(profile?.show_location ?? true);
      setPrivacyConfigured(
        Boolean(
          profile?.profile_visibility ||
            (profile?.show_location !== null &&
              profile?.show_location !== undefined)
        )
      );

      await loadProfileStats(user.id);

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  async function loadProfileStats(currentUserId: string) {
    const { data, error } = await supabase
      .from("stories")
      .select("story_type, video_url, prayer_status, answered_text, status")
      .eq("user_id", currentUserId);

    if (error || !Array.isArray(data)) {
      setStats(emptyProfileStats);
      return;
    }

    const rows = (data as ProfileStoryRow[]).filter(
      (story) => story.status !== "removed"
    );

    setStats({
      stories: rows.length,
      videos: rows.filter((story) => Boolean(story.video_url)).length,
      prayers: rows.filter((story) => isPrayerType(story.story_type)).length,
      praise: rows.filter(
        (story) =>
          isPraiseType(story.story_type) ||
          story.prayer_status === "answered" ||
          Boolean(story.answered_text)
      ).length,
    });
  }

  const profileName = useMemo(() => {
    return displayName.trim() || username.trim() || "Set up your profile";
  }, [displayName, username]);

  const visibleLocation =
    showLocation && location.trim() ? location.trim() : "";

  const completionItems: CompletionItem[] = [
    {
      complete: false,
      helper: "Photo uploads need avatar storage first.",
      title: "Add photo",
    },
    {
      complete: Boolean(bio.trim()),
      helper: "Add a short testimony line.",
      title: "Add bio",
    },
    {
      complete: username.trim().length >= 3,
      helper: "Choose a clear HTBF username.",
      title: "Confirm username",
    },
    {
      complete: privacyConfigured,
      helper: "Review what appears on your profile.",
      title: "Set privacy preferences",
    },
  ];

  const completedCount = completionItems.filter((item) => item.complete).length;

  const quickActions: AccountAction[] = [
    {
      title: "Edit Profile",
      text: "Update your name, username, bio, and location.",
      onClick: () => showComingSoon("Edit Profile"),
    },
    {
      title: "Change Profile Photo",
      text: "Add or update your HTBF profile image.",
      badge: "Coming next",
      onClick: showPhotoComingSoon,
    },
    {
      title: "View Public Profile",
      text: "Preview how your profile will appear.",
      badge: "Soon",
      onClick: () => showComingSoon("View Public Profile"),
    },
    {
      title: "My Posts",
      text: "Stories and written encouragement.",
      meta: `${stats.stories}`,
      onClick: () => showComingSoon("My Posts"),
    },
    {
      title: "My Videos",
      text: "Video testimonies you have shared.",
      meta: `${stats.videos}`,
      onClick: () => showComingSoon("My Videos"),
    },
    {
      title: "My Prayer Requests",
      text: "Requests you invited prayer around.",
      meta: `${stats.prayers}`,
      onClick: () => showComingSoon("My Prayer Requests"),
    },
    {
      title: "My Praise Reports",
      text: "Praise and answered-prayer moments.",
      meta: `${stats.praise}`,
      onClick: () => showComingSoon("My Praise Reports"),
    },
  ];

  const accountCenterActions: AccountAction[] = [
    {
      title: "Account Info",
      text: "Private sign-in email and account details.",
      meta: email || "Signed in",
      onClick: () => showComingSoon("Account Info"),
    },
    {
      title: "Password & Security",
      text: "Password, sessions, and sign-in protection.",
      onClick: () => showComingSoon("Password & Security"),
    },
    {
      title: "Privacy Settings",
      text: "Profile visibility, location, and name display.",
      onClick: () => showComingSoon("Privacy Settings"),
    },
    {
      title: "Notification Settings",
      text: "Prayer, story, and account notifications.",
      onClick: () => showComingSoon("Notification Settings"),
    },
    {
      title: "Blocked Users",
      text: "Manage people you have blocked.",
      badge: "Soon",
      onClick: () => showComingSoon("Blocked Users"),
    },
    {
      title: "Muted Users",
      text: "Manage accounts you have muted.",
      badge: "Soon",
      onClick: () => showComingSoon("Muted Users"),
    },
    {
      title: "Reported Content",
      text: "Review content reports you have submitted.",
      badge: "Soon",
      onClick: () => showComingSoon("Reported Content"),
    },
    {
      title: "Saved / Bookmarked",
      text: "Return to stories you saved.",
      badge: "Soon",
      onClick: () => showComingSoon("Saved / Bookmarked"),
    },
    {
      title: "Archived / Hidden Content",
      text: "Manage items you hid or archived.",
      badge: "Soon",
      onClick: () => showComingSoon("Archived / Hidden Content"),
    },
    {
      title: "Download My Data",
      text: "Export tools will live here.",
      badge: "Soon",
      onClick: () => showComingSoon("Download My Data"),
    },
    {
      title: "Delete Account",
      text: "Request safe account deletion support.",
      tone: "danger",
      onClick: () => setDeleteAccountOpen(true),
    },
    {
      title: signingOut ? "Signing out..." : "Sign Out",
      text: "Leave this device safely.",
      disabled: signingOut,
      onClick: signOut,
    },
  ];

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  function showComingSoon(label: string) {
    setMessage(`${label} will open in a focused Account Center page next.`);
  }

  function showPhotoComingSoon() {
    setMessage(
      "Profile photo uploads need a profile avatar field and storage support before they can be saved."
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading your profile setup...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/journey"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            HTBF
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Profile
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200">
          <div className="bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-white/15">
              <Sparkles className="h-4 w-4" />
              Profile Setup
            </div>

            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white/15 text-white ring-1 ring-white/20">
                  <UserCircle className="h-20 w-20" />
                </div>
                <button
                  type="button"
                  onClick={showPhotoComingSoon}
                  className="mt-3 inline-flex w-28 items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-black text-[#0b63ce] shadow-sm hover:bg-blue-50"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Add Photo
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="break-words text-4xl font-black tracking-tight">
                  {profileName}
                </h1>
                <p className="mt-2 text-sm font-bold text-blue-100">
                  {username ? `@${username}` : "Set up your HTBF username"}
                </p>

                {bio ? (
                  <p className="mt-3 whitespace-pre-wrap break-words leading-7 text-blue-50">
                    {bio}
                  </p>
                ) : (
                  <p className="mt-3 leading-7 text-blue-50">
                    Add a short testimony line so your profile feels like you.
                  </p>
                )}

                {visibleLocation && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold text-blue-50 ring-1 ring-white/15">
                    <MapPin className="h-4 w-4" />
                    {visibleLocation}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => showComingSoon("Edit Profile")}
                  className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] shadow-sm hover:bg-blue-50"
                >
                  Edit Profile
                </button>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <section className="rounded-[2rem] bg-blue-50 p-5 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
            {message}
          </section>
        )}

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <SectionIntro
            label="Profile Completion"
            title={`${completedCount} of ${completionItems.length} steps complete`}
            text="Finish the essentials so your HTBF identity is ready."
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {completionItems.map((item) => (
              <CompletionCard key={item.title} item={item} />
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <SectionIntro
            label="Quick Actions"
            title="Set up and manage your profile"
            text="Keep the main profile screen focused on the things you use most."
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => (
              <ActionCard key={action.title} action={action} />
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => setMoreOptionsOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-4 rounded-[1.5rem] bg-slate-50 p-4 text-left ring-1 ring-slate-100 transition hover:bg-blue-50 hover:ring-blue-100"
          >
            <span className="inline-flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
                <MoreHorizontal className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-lg font-black text-[#062a57]">
                  More Options
                </span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">
                  Account Center tools, privacy, safety, and sign out.
                </span>
              </span>
            </span>
            <ChevronRight
              className={`h-5 w-5 shrink-0 text-[#0b63ce] transition ${
                moreOptionsOpen ? "rotate-90" : ""
              }`}
            />
          </button>

          {moreOptionsOpen && (
            <div className="mt-5">
              <SectionIntro
                label="Account Center"
                title="More profile and account controls"
                text="These tools are secondary so the main profile page stays clean."
              />

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {accountCenterActions.map((action) => (
                  <ActionCard key={action.title} action={action} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <LoggedInBottomNav />

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

function CompletionCard({ item }: { item: CompletionItem }) {
  return (
    <div className="flex items-start gap-3 rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
      {item.complete ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
      )}
      <div>
        <h3 className="font-black text-[#062a57]">{item.title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{item.helper}</p>
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: AccountAction }) {
  const isDanger = action.tone === "danger";

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={`group rounded-[1.5rem] p-4 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-70 ${
        isDanger
          ? "bg-red-50 text-red-800 ring-red-100 hover:bg-red-100"
          : "bg-slate-50 text-slate-900 ring-slate-100 hover:bg-blue-50 hover:ring-blue-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`text-base font-black ${
            isDanger ? "text-red-800" : "text-[#062a57]"
          }`}
        >
          {action.title}
        </h3>
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 ${
            isDanger ? "text-red-500" : "text-[#0b63ce]"
          }`}
        />
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-600">{action.text}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {action.meta && (
          <span className="inline-flex max-w-full rounded-full bg-white px-3 py-1 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
            <span className="truncate">{action.meta}</span>
          </span>
        )}
        {action.badge && (
          <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#0b63ce] ring-1 ring-blue-100">
            {action.badge}
          </span>
        )}
      </div>
    </button>
  );
}

function SectionIntro({
  label,
  text,
  title,
}: {
  label: string;
  text: string;
  title: string;
}) {
  return (
    <div>
      <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
        {label}
      </div>
      <h2 className="mt-1 text-2xl font-black text-[#062a57]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function isPrayerType(storyType: string | null) {
  return (storyType ?? "").toLowerCase().includes("prayer");
}

function isPraiseType(storyType: string | null) {
  const normalized = (storyType ?? "").toLowerCase();

  return (
    normalized.includes("praise") ||
    normalized.includes("answered") ||
    normalized.includes("testimony")
  );
}
