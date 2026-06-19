"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Mail, MapPin, Sparkles, UserCircle } from "lucide-react";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  display_name: string | null;
  username: string | null;
  location: string | null;
  bio: string | null;
  show_location: boolean | null;
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

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [showLocation, setShowLocation] = useState(true);
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
      const fallbackName = userEmail.split("@")[0] ?? "";

      setEmail(userEmail);

      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, username, location, bio, show_location")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load profile: ${error.message}`);
        setLoading(false);
        return;
      }

      const profile = data as ProfileRow | null;

      setDisplayName(profile?.display_name ?? fallbackName);
      setUsername(profile?.username ?? cleanUsername(fallbackName));
      setLocation(profile?.location ?? "");
      setBio(profile?.bio ?? "");
      setShowLocation(profile?.show_location ?? true);

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

  function cleanUsername(value: string) {
    return value
      .toLowerCase()
      .replace("@", "")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24);
  }

  const profileName = useMemo(() => {
    return displayName.trim() || username.trim() || email.split("@")[0] || "HTBF";
  }, [displayName, email, username]);

  const visibleLocation =
    showLocation && location.trim() ? location.trim() : "";

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  function showComingSoon(label: string) {
    setMessage(`${label} will open in a focused Account Center page next.`);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading your account center...
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
              Account Center
            </div>

            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-white/15 text-white ring-1 ring-white/20">
                  <UserCircle className="h-16 w-16" />
                </div>
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
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <AccountQuickCard
              title="Edit Profile"
              text="Name, username, bio, and location."
              onClick={() => showComingSoon("Edit Profile")}
            />
            <AccountQuickCard
              title="Change Profile Photo"
              text="Coming next after avatar storage is connected."
              badge="Coming next"
              onClick={() =>
                setMessage(
                  "Profile photo uploads need a profile avatar field and storage support before they can be saved."
                )
              }
            />
            <AccountQuickCard
              title="View Public Profile"
              text="Preview mode is coming next."
              badge="Soon"
              onClick={() => showComingSoon("View Public Profile")}
            />
          </div>
        </section>

        {message && (
          <section className="rounded-[2rem] bg-blue-50 p-5 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
            {message}
          </section>
        )}

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <SectionIntro
            label="Account Center"
            title="Manage your HTBF profile"
            text="Choose a focused area below. Detailed pages will live here next, keeping this screen clean."
          />

          <div className="mt-5 space-y-5">
            <AccountSection
              title="Public Profile"
              items={[
                {
                  title: "Edit Profile",
                  text: "Display name, username, bio, and location.",
                  onClick: () => showComingSoon("Edit Profile"),
                },
                {
                  title: "Change Profile Photo",
                  text: "Avatar uploads are coming next.",
                  badge: "Coming next",
                  onClick: () =>
                    setMessage(
                      "Profile photo uploads need a profile avatar field and storage support before they can be saved."
                    ),
                },
                {
                  title: "My Content",
                  text: "Stories, videos, prayer requests, and praise reports.",
                  href: "#my-content",
                },
              ]}
            />

            <AccountSection
              title="Privacy & Preferences"
              items={[
                {
                  title: "Privacy Settings",
                  text: "Location, real name, and profile visibility.",
                  onClick: () => showComingSoon("Privacy Settings"),
                },
                {
                  title: "Notification Settings",
                  text: "Prayer and story notification preferences.",
                  onClick: () => showComingSoon("Notification Settings"),
                },
              ]}
            />

            <AccountSection
              title="Account"
              items={[
                {
                  title: "Account Info",
                  text: "Private email and account details.",
                  onClick: () => showComingSoon("Account Info"),
                },
                {
                  title: "Password & Security",
                  text: "Security settings will live here.",
                  onClick: () => showComingSoon("Password & Security"),
                },
                {
                  title: signingOut ? "Signing out..." : "Sign Out",
                  text: "Leave this device safely.",
                  onClick: signOut,
                  disabled: signingOut,
                },
              ]}
            />
          </div>
        </section>

        <section
          id="my-content"
          className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200"
        >
          <SectionIntro
            label="My Content"
            title="Your HTBF activity"
            text="A quick count of what you have shared through HTBF."
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <ProfileStatCard label="Stories" value={stats.stories} />
            <ProfileStatCard label="Videos" value={stats.videos} />
            <ProfileStatCard label="Prayers" value={stats.prayers} />
            <ProfileStatCard label="Praise" value={stats.praise} />
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                Private Account Info
              </div>
              <h2 className="mt-1 text-2xl font-black text-[#062a57]">
                Email stays private
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Your sign-in email will belong under Account Info in the next
                phase. It is not shown in the profile summary card.
              </p>
            </div>
          </div>
        </section>
      </div>

      <LoggedInBottomNav />
    </main>
  );
}

function AccountQuickCard({
  badge,
  onClick,
  text,
  title,
}: {
  badge?: string;
  onClick: () => void;
  text: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[1.5rem] bg-slate-50 p-4 text-left ring-1 ring-slate-100 transition hover:bg-blue-50 hover:ring-blue-100"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-black text-[#062a57]">{title}</h3>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#0b63ce]" />
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
      {badge && (
        <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#0b63ce] ring-1 ring-blue-100">
          {badge}
        </span>
      )}
    </button>
  );
}

function AccountSection({
  items,
  title,
}: {
  items: AccountSectionItem[];
  title: string;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-[#082f63]">
        {title}
      </h3>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <AccountCenterCard key={item.title} item={item} />
        ))}
      </div>
    </div>
  );
}

type AccountSectionItem = {
  badge?: string;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  text: string;
  title: string;
};

function AccountCenterCard({ item }: { item: AccountSectionItem }) {
  const className =
    "group rounded-[1.5rem] bg-slate-50 p-4 text-left ring-1 ring-slate-100 transition hover:bg-blue-50 hover:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-70";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-base font-black text-[#062a57]">{item.title}</h4>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#0b63ce] transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
      {item.badge && (
        <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#0b63ce] ring-1 ring-blue-100">
          {item.badge}
        </span>
      )}
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={item.onClick}
      disabled={item.disabled}
      className={className}
    >
      {content}
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

function ProfileStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] bg-blue-50 p-4 ring-1 ring-blue-100">
      <div className="text-3xl font-black text-[#0b63ce]">{value}</div>
      <div className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-[#062a57]">
        {label}
      </div>
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
