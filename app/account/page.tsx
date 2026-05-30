"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Eye,
  Lock,
  LogOut,
  Save,
  ShieldAlert,
  Sparkles,
  UserCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  id: string;
  real_name: string | null;
  display_name: string | null;
  username: string | null;
  location: string | null;
  bio: string | null;
  status: string | null;
  profile_visibility: string | null;
  allow_prayer_notifications: boolean | null;
  allow_story_notifications: boolean | null;
  show_location: boolean | null;
  show_real_name: boolean | null;
  journey_focus: string | null;
  profile_completed: boolean | null;
};

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [realName, setRealName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  const [status, setStatus] = useState("active");
  const [profileVisibility, setProfileVisibility] = useState("public");
  const [showLocation, setShowLocation] = useState(true);
  const [showRealName, setShowRealName] = useState(false);
  const [allowPrayerNotifications, setAllowPrayerNotifications] =
    useState(true);
  const [allowStoryNotifications, setAllowStoryNotifications] = useState(true);
  const [journeyFocus, setJourneyFocus] = useState("encouragement");

  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadAccount() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, real_name, display_name, username, location, bio, status, profile_visibility, allow_prayer_notifications, allow_story_notifications, show_location, show_real_name, journey_focus, profile_completed"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load profile: ${error.message}`);
        setLoading(false);
        return;
      }

      const profile = data as ProfileRow | null;

      const fallbackName = user.email?.split("@")[0] ?? "";

      setRealName(profile?.real_name ?? "");
      setDisplayName(profile?.display_name ?? fallbackName);
      setUsername(profile?.username ?? "");
      setLocation(profile?.location ?? "");
      setBio(profile?.bio ?? "");

      setStatus(profile?.status ?? "active");
      setProfileVisibility(profile?.profile_visibility ?? "public");
      setShowLocation(profile?.show_location ?? true);
      setShowRealName(profile?.show_real_name ?? false);
      setAllowPrayerNotifications(
        profile?.allow_prayer_notifications ?? true
      );
      setAllowStoryNotifications(profile?.allow_story_notifications ?? true);
      setJourneyFocus(profile?.journey_focus ?? "encouragement");

      setLoading(false);
    }

    loadAccount();
  }, []);

  function cleanUsername(value: string) {
    return value
      .toLowerCase()
      .replace("@", "")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24);
  }

  async function saveAccount() {
    setMessage("");

    if (!userId) {
      setMessage("Please sign in again.");
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

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      real_name: realName.trim() || null,
      display_name: cleanDisplayName,
      username: cleanUsernameValue,
      location: location.trim() || null,
      bio: bio.trim() || null,
      status,
      profile_visibility: profileVisibility,
      allow_prayer_notifications: allowPrayerNotifications,
      allow_story_notifications: allowStoryNotifications,
      show_location: showLocation,
      show_real_name: showRealName,
      journey_focus: journeyFocus,
      profile_completed: true,
      updated_at: new Date().toISOString(),
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

      setMessage(`Could not save account settings: ${error.message}`);
      return;
    }

    setMessage("Account settings saved.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading account settings...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 text-sm font-black text-[#082f63]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Feed
          </Link>

          <div className="text-sm font-black uppercase tracking-[0.22em] text-[#0b63ce]">
            Profile
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <UserCircle className="h-4 w-4" />
            Account Settings
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            Manage your account.
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Update your profile identity, privacy, notifications, and Journey
            preferences.
          </p>

          {message && (
            <div
              className={`mt-5 rounded-2xl p-4 text-sm font-bold ${
                message.includes("saved")
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          )}
        </section>

        <SettingsSection
          icon={<UserCircle className="h-6 w-6" />}
          label="Profile Identity"
          title="How people see you on HTBF"
        >
          <Field label="Email">
            <input
              value={email}
              disabled
              className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500"
            />
          </Field>

          <Field label="Real name">
            <input
              value={realName}
              onChange={(event) => setRealName(event.target.value)}
              placeholder="Example: Lou Anthony"
              className="input-style"
            />
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
              <span className="font-black text-slate-400">@</span>
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
              Use lowercase letters, numbers, or underscores.
            </p>
          </Field>

          <Field label="Location">
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="City, State, or Country"
              className="input-style"
            />
          </Field>

          <Field label="Bio / testimony line">
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Example: Thankful for what God is doing."
              className="min-h-24 input-style"
            />
          </Field>
        </SettingsSection>

        <SettingsSection
          icon={<Eye className="h-6 w-6" />}
          label="Privacy"
          title="Control what appears publicly"
        >
          <ToggleRow
            title="Show my location"
            text="Allow your location to appear with stories and on movement views."
            checked={showLocation}
            onChange={setShowLocation}
          />

          <ToggleRow
            title="Show my real name"
            text="If turned off, HTBF uses your display name instead."
            checked={showRealName}
            onChange={setShowRealName}
          />

          <Field label="Profile visibility">
            <select
              value={profileVisibility}
              onChange={(event) => setProfileVisibility(event.target.value)}
              className="input-style"
            >
              <option value="public">Public</option>
              <option value="community">HTBF community only</option>
              <option value="private">Private</option>
            </select>
          </Field>
        </SettingsSection>

        <SettingsSection
          icon={<Bell className="h-6 w-6" />}
          label="Notifications"
          title="Choose what you want to be notified about"
        >
          <ToggleRow
            title="Prayer notifications"
            text="Notify me when people pray with my prayer request."
            checked={allowPrayerNotifications}
            onChange={setAllowPrayerNotifications}
          />

          <ToggleRow
            title="Story response notifications"
            text="Notify me when people respond to my stories."
            checked={allowStoryNotifications}
            onChange={setAllowStoryNotifications}
          />
        </SettingsSection>

        <SettingsSection
          icon={<Sparkles className="h-6 w-6" />}
          label="Journey Preferences"
          title="Personalize your Journey page"
        >
          <Field label="Main Journey focus">
            <select
              value={journeyFocus}
              onChange={(event) => setJourneyFocus(event.target.value)}
              className="input-style"
            >
              <option value="encouragement">Encouragement</option>
              <option value="prayer">Prayer</option>
              <option value="testimony">Testimony</option>
              <option value="healing">Healing</option>
              <option value="praise">Praise</option>
              <option value="reflection">Reflection</option>
            </select>
          </Field>
        </SettingsSection>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <button
            onClick={saveAccount}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Account Settings"}
          </button>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
              <Lock className="h-6 w-6" />
            </div>

            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                Account
              </div>
              <h2 className="text-2xl font-black text-[#062a57]">
                Sign out or request deletion
              </h2>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={signOut}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>

            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-red-50 px-5 py-3 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100"
            >
              <ShieldAlert className="h-4 w-4" />
              Request Account Deletion
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function SettingsSection({
  icon,
  label,
  title,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-5 flex items-center gap-3">
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

      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-black text-[#062a57]">{label}</div>
      {children}
    </label>
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
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
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
