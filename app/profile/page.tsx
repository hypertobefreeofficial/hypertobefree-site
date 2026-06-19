"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Mail,
  MapPin,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCircle,
} from "lucide-react";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  real_name: string | null;
  display_name: string | null;
  username: string | null;
  location: string | null;
  bio: string | null;
  show_location: boolean | null;
  show_real_name: boolean | null;
  profile_completed: boolean | null;
  profile_visibility?: string | null;
  allow_prayer_notifications?: boolean | null;
  allow_story_notifications?: boolean | null;
  journey_focus?: string | null;
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
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [realName, setRealName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  const [showLocation, setShowLocation] = useState(true);
  const [showRealName, setShowRealName] = useState(false);
  const [allowPrayerNotifications, setAllowPrayerNotifications] =
    useState(true);
  const [allowStoryNotifications, setAllowStoryNotifications] = useState(true);
  const [profileVisibility, setProfileVisibility] = useState("public");
  const [journeyFocus, setJourneyFocus] = useState("encouragement");

  const [editingProfile, setEditingProfile] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [message, setMessage] = useState("");
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

      setUserId(user.id);
      setEmail(userEmail);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "real_name, display_name, username, location, bio, show_location, show_real_name, profile_completed, profile_visibility, allow_prayer_notifications, allow_story_notifications, journey_focus"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load profile: ${error.message}`);
        setLoading(false);
        return;
      }

      const profile = data as ProfileRow | null;
      const hasCompletedProfile = Boolean(
        profile?.profile_completed && profile.display_name && profile.username
      );

      setRealName(profile?.real_name ?? "");
      setDisplayName(profile?.display_name ?? fallbackName);
      setUsername(profile?.username ?? cleanUsername(fallbackName));
      setLocation(profile?.location ?? "");
      setBio(profile?.bio ?? "");
      setShowLocation(profile?.show_location ?? true);
      setShowRealName(profile?.show_real_name ?? false);
      setAllowPrayerNotifications(profile?.allow_prayer_notifications ?? true);
      setAllowStoryNotifications(profile?.allow_story_notifications ?? true);
      setProfileVisibility(profile?.profile_visibility ?? "public");
      setJourneyFocus(profile?.journey_focus ?? "encouragement");
      setEditingProfile(!hasCompletedProfile);
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

  const publicLocation =
    showLocation && location.trim() ? location.trim() : "";

  async function saveProfile() {
    setMessage("");

    if (!userId) {
      setMessage("Please sign in again.");
      return;
    }

    if (!email) {
      setMessage("Could not find your email. Please sign out and sign back in.");
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

    const now = new Date().toISOString();

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      email,
      real_name: realName.trim() || null,
      display_name: cleanDisplayName,
      username: cleanUsernameValue,
      username_last_changed_at: now,
      location: location.trim() || null,
      bio: bio.trim() || null,
      show_location: showLocation,
      show_real_name: showRealName,
      status: "active",
      profile_visibility: profileVisibility,
      allow_prayer_notifications: allowPrayerNotifications,
      allow_story_notifications: allowStoryNotifications,
      journey_focus: journeyFocus,
      profile_completed: true,
      updated_at: now,
    });

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

    setMessage("Profile updated.");
    setEditingProfile(false);
  }

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading your profile...
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
              Profile Control Center
            </div>

            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-white/15 text-white ring-1 ring-white/20">
                  <UserCircle className="h-16 w-16" />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setMessage(
                      "Profile photo uploads need a profile avatar field and storage support before they can be saved."
                    )
                  }
                  className="mt-3 inline-flex w-24 items-center justify-center rounded-full bg-white px-3 py-2 text-[11px] font-black text-[#0b63ce] shadow-sm hover:bg-blue-50"
                >
                  Add Photo
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="break-words text-4xl font-black tracking-tight">
                  {profileName}
                </h1>
                <p className="mt-2 text-sm font-bold text-blue-100">
                  {username ? `@${username}` : "Finish your HTBF profile"}
                </p>

                {bio ? (
                  <p className="mt-3 whitespace-pre-wrap break-words leading-7 text-blue-50">
                    {bio}
                  </p>
                ) : (
                  <p className="mt-3 leading-7 text-blue-50">
                    Add a short testimony line so people know the story God is
                    writing in you.
                  </p>
                )}

                {publicLocation && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold text-blue-50 ring-1 ring-white/15">
                    <MapPin className="h-4 w-4" />
                    {publicLocation}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] shadow-sm hover:bg-blue-50"
              >
                Edit Profile
              </button>
            </div>
          </div>
        </section>

        {message && (
          <section className="rounded-[2rem] bg-blue-50 p-5 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
            {message}
          </section>
        )}

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
              Profile Control Center
            </div>
            <h2 className="mt-1 text-2xl font-black text-[#062a57]">
              Manage your HTBF account
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ControlActionCard
              title="Edit Profile"
              text="Update your photo, name, bio, and location."
              onClick={() => setEditingProfile(true)}
            />
            <ControlActionCard
              title="My Posts"
              text="Review stories and written updates."
              href="#profile-activity"
            />
            <ControlActionCard
              title="My Videos"
              text="See your submitted video testimonies."
              href="#profile-activity"
            />
            <ControlActionCard
              title="My Prayer Requests"
              text="Manage prayer-related activity."
              href="#profile-activity"
            />
            <ControlActionCard
              title="My Praise Reports"
              text="Track answered prayer and praise moments."
              href="#profile-activity"
            />
            <ControlActionCard
              title="Privacy Settings"
              text="Control what others can see."
              href="#account-settings"
            />
            <ControlActionCard
              title="Notification Settings"
              text="Choose HTBF reminders."
              href="#account-settings"
            />
            <ControlActionCard
              title="Account Settings"
              text="Private email, visibility, and sign out."
              href="#account-settings"
            />
          </div>
        </section>

        <section
          id="profile-activity"
          className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200"
        >
          <div className="mb-4">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
              My HTBF Activity
            </div>
            <h2 className="mt-1 text-2xl font-black text-[#062a57]">
              Your personal dashboard
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <ProfileStatCard label="Stories" value={stats.stories} />
            <ProfileStatCard label="Videos" value={stats.videos} />
            <ProfileStatCard label="Prayers" value={stats.prayers} />
            <ProfileStatCard label="Praise" value={stats.praise} />
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
              My Content
            </div>
            <h2 className="mt-1 text-2xl font-black text-[#062a57]">
              Your HTBF posts by type
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ProfileContentCard
              title="Stories"
              count={stats.stories}
              text="Testimonies, encouragement, and written updates you have shared."
            />
            <ProfileContentCard
              title="Videos"
              count={stats.videos}
              text="Video testimonies and moments you have submitted."
            />
            <ProfileContentCard
              title="Prayer"
              count={stats.prayers}
              text="Prayer requests you have invited the HTBF community into."
            />
            <ProfileContentCard
              title="Praise"
              count={stats.praise}
              text="Praise reports and answered-prayer moments from your journey."
            />
          </div>
        </section>

        {editingProfile && (
          <section
            id="profile-edit"
            className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
              <Sparkles className="h-4 w-4" />
              Edit Profile
            </div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
                <UserCircle className="h-8 w-8" />
              </div>

              <div>
                <h2 className="text-3xl font-black tracking-tight text-[#062a57]">
                  Update your profile
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Keep your HTBF identity, bio, and privacy preferences current.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <SettingsPanel
                icon={<UserCircle className="h-5 w-5 text-[#0b63ce]" />}
                title="Profile photo"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.5rem] bg-blue-50 text-[#0b63ce] ring-1 ring-blue-100">
                    <UserCircle className="h-12 w-12" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm leading-6 text-slate-600">
                      Add or change your profile photo once avatar storage is
                      connected.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setMessage(
                          "Profile photo uploads need a profile avatar field and storage support before they can be saved."
                        )
                      }
                      className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-50"
                    >
                      Add Photo
                    </button>
                  </div>
                </div>
              </SettingsPanel>

              <Field label="Real name">
                <input
                  value={realName}
                  onChange={(event) => setRealName(event.target.value)}
                  placeholder="Example: Lou Anthony"
                  className="input-style"
                />
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Private by default unless you choose to show it.
                </p>
              </Field>

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
                  <AtSign className="h-4 w-4 text-slate-400" />
                  <input
                    value={username}
                    onChange={(event) =>
                      setUsername(cleanUsername(event.target.value))
                    }
                    placeholder="example_username"
                    className="w-full bg-transparent px-1 py-3 outline-none"
                  />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Usernames use lowercase letters, numbers, or underscores.
                </p>
              </Field>

              <Field label="Location">
                <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="City, State, or Country"
                    className="w-full bg-transparent px-2 py-3 outline-none"
                  />
                </div>
              </Field>

              <Field label="Bio / testimony line">
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Example: Thankful for what God is doing."
                  className="min-h-24 input-style"
                />
              </Field>

              <SettingsPanel
                icon={<ShieldCheck className="h-5 w-5 text-[#0b63ce]" />}
                title="Privacy defaults"
              >
                <ToggleRow
                  title="Show my location"
                  text="Allow your location to appear with stories and movement views."
                  checked={showLocation}
                  onChange={setShowLocation}
                />

                <ToggleRow
                  title="Show my real name"
                  text="If turned off, HTBF uses your display name instead."
                  checked={showRealName}
                  onChange={setShowRealName}
                />
              </SettingsPanel>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Changes"}
                </button>

                <button
                  type="button"
                  onClick={() => setEditingProfile(false)}
                  className="flex flex-1 items-center justify-center rounded-full bg-slate-100 px-6 py-3 text-sm font-black text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}

        <section
          id="account-settings"
          className="space-y-4 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200"
        >
          <SectionHeading
            icon={<Mail className="h-5 w-5" />}
            label="Private Settings"
            title="Account Settings"
          />

          <p className="text-sm leading-6 text-slate-600">
            These settings are private to you. Your email is not shown in your
            profile header or activity cards.
          </p>

          <InfoRow label="Sign-in email" value={email || "Signed in"} />

          <div className="grid gap-3 lg:grid-cols-3">
            <SettingsPanel
              icon={<ShieldCheck className="h-5 w-5 text-[#0b63ce]" />}
              title="Privacy Settings"
            >
              <ToggleRow
                title="Show my location"
                text="Allow your location to appear on public stories and movement views."
                checked={showLocation}
                onChange={setShowLocation}
              />

              <ToggleRow
                title="Show my real name"
                text="If turned off, HTBF uses your display name instead."
                checked={showRealName}
                onChange={setShowRealName}
              />
            </SettingsPanel>

            <SettingsPanel
              icon={<Bell className="h-5 w-5 text-[#0b63ce]" />}
              title="Notification Preferences"
            >
              <ToggleRow
                title="Prayer notifications"
                text="Receive updates related to prayer activity and answered prayers."
                checked={allowPrayerNotifications}
                onChange={setAllowPrayerNotifications}
              />

              <ToggleRow
                title="Story notifications"
                text="Receive updates about stories, encouragement, and community responses."
                checked={allowStoryNotifications}
                onChange={setAllowStoryNotifications}
              />
            </SettingsPanel>

            <SettingsPanel
              icon={<UserCircle className="h-5 w-5 text-[#0b63ce]" />}
              title="Account Settings"
            >
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setProfileVisibility("public")}
                  className={`rounded-2xl px-4 py-3 text-sm font-black ring-1 ${
                    profileVisibility === "public"
                      ? "bg-blue-50 text-[#0b63ce] ring-blue-100"
                      : "bg-white text-slate-600 ring-slate-200"
                  }`}
                >
                  Public Profile
                </button>
                <button
                  type="button"
                  onClick={() => setProfileVisibility("private")}
                  className={`rounded-2xl px-4 py-3 text-sm font-black ring-1 ${
                    profileVisibility === "private"
                      ? "bg-blue-50 text-[#0b63ce] ring-blue-100"
                      : "bg-white text-slate-600 ring-slate-200"
                  }`}
                >
                  Private Profile
                </button>
              </div>

              <Field label="Journey focus">
                <select
                  value={journeyFocus}
                  onChange={(event) => setJourneyFocus(event.target.value)}
                  className="input-style"
                >
                  <option value="encouragement">Encouragement</option>
                  <option value="prayer">Prayer</option>
                  <option value="testimony">Testimony</option>
                  <option value="praise">Praise</option>
                </select>
              </Field>
            </SettingsPanel>
          </div>

          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </section>

        <section className="space-y-3 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
            Account Actions
          </div>

          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full items-center justify-between rounded-[1.5rem] bg-slate-50 p-4 text-left font-black text-[#062a57] ring-1 ring-slate-200 transition hover:bg-blue-50 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-3">
              <LogOut className="h-5 w-5 text-[#0b63ce]" />
              {signingOut ? "Signing out..." : "Sign Out"}
            </span>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => setDeleteAccountOpen(true)}
            className="flex w-full items-center justify-between rounded-[1.5rem] bg-red-50 p-4 text-left font-black text-red-700 ring-1 ring-red-100 transition hover:bg-red-100"
          >
            <span className="inline-flex items-center gap-3">
              <Trash2 className="h-5 w-5" />
              Delete Account
            </span>
            <ChevronRight className="h-5 w-5 text-red-400" />
          </button>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-black text-[#062a57]">{label}</div>
      {children}
    </label>
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

function ProfileContentCard({
  count,
  text,
  title,
}: {
  count: number;
  text: string;
  title: string;
}) {
  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-[#062a57]">{title}</h3>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
          {count}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function ControlActionCard({
  href,
  onClick,
  text,
  title,
}: {
  href?: string;
  onClick?: () => void;
  text: string;
  title: string;
}) {
  const className =
    "rounded-[1.5rem] bg-slate-50 p-4 text-left ring-1 ring-slate-100 transition hover:bg-blue-50 hover:ring-blue-100";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-black text-[#062a57]">{title}</h3>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#0b63ce]" />
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function SettingsPanel({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="flex items-center gap-2 font-black text-[#062a57]">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  title,
  text,
  checked,
  onChange,
}: {
  title: string;
  text: string;
  checked: boolean;
  onChange: (value: boolean) => void;
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

function SectionHeading({
  icon,
  label,
  title,
}: {
  icon: ReactNode;
  label: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
        {icon}
      </div>
      <div>
        <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
          {label}
        </div>
        <h2 className="text-2xl font-black text-[#062a57]">{title}</h2>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="text-sm font-black text-slate-500">{label}</div>
      <div className="break-words text-right text-sm font-black text-[#062a57]">
        {value}
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
