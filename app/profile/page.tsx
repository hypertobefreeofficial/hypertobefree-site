"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  CheckCircle2,
  ChevronRight,
  Inbox,
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

  const profileName = useMemo(() => {
    return displayName.trim() || username.trim() || email.split("@")[0] || "HTBF";
  }, [displayName, email, username]);

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

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white shadow-xl shadow-blue-950/10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-white/15">
            <Sparkles className="h-4 w-4" />
            HTBF Profile
          </div>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.75rem] bg-white/15 text-white ring-1 ring-white/20">
              <UserCircle className="h-12 w-12" />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="break-words text-4xl font-black tracking-tight">
                {profileName}
              </h1>
              <p className="mt-2 text-sm font-bold text-blue-100">
                {username ? `@${username}` : "Finish your HTBF profile"}
              </p>
              {bio && (
                <p className="mt-3 whitespace-pre-wrap break-words leading-7 text-blue-50">
                  {bio}
                </p>
              )}
            </div>
          </div>
        </section>

        {message && (
          <section className="rounded-[2rem] bg-blue-50 p-5 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
            {message}
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setEditingProfile((current) => !current)}
            className="rounded-[2rem] bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <UserCircle className="h-6 w-6" />
            </div>
            <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
              Edit Profile
            </div>
            <h2 className="mt-1 text-2xl font-black text-[#062a57]">
              Profile setup
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Update your name, username, location, bio, and profile defaults.
            </p>
          </button>

          <Link
            href="/journey/inbox"
            className="rounded-[2rem] bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-blue-50"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <Inbox className="h-6 w-6" />
            </div>
            <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
              Journey Inbox
            </div>
            <h2 className="mt-1 text-2xl font-black text-[#062a57]">
              Messages
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Open your private HTBF messages, prayer replies, and updates.
            </p>
          </Link>
        </section>

        {editingProfile && (
          <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
              <Sparkles className="h-4 w-4" />
              Profile Setup
            </div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
                <UserCircle className="h-8 w-8" />
              </div>

              <div>
                <h2 className="text-3xl font-black tracking-tight text-[#062a57]">
                  Create your profile
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Choose how people will recognize you before posting, praying,
                  or sharing stories.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Email">
                <input
                  value={email}
                  disabled
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500"
                />
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Your email is locked to your sign-in account.
                </p>
              </Field>

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

              <button
                type="button"
                onClick={saveProfile}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </section>
        )}

        <section className="space-y-4 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <SectionHeading
            icon={<Mail className="h-5 w-5" />}
            label="Account Settings"
            title="Your account"
          />

          <InfoRow label="Email" value={email || "Signed in"} />
          <InfoRow label="Profile visibility" value={profileVisibility} />

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setProfileVisibility("public")}
              className={`rounded-2xl px-4 py-3 text-sm font-black ring-1 ${
                profileVisibility === "public"
                  ? "bg-blue-50 text-[#0b63ce] ring-blue-100"
                  : "bg-slate-50 text-slate-600 ring-slate-200"
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
                  : "bg-slate-50 text-slate-600 ring-slate-200"
              }`}
            >
              Private Profile
            </button>
          </div>

          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Account Settings"}
          </button>
        </section>

        <section className="space-y-4 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <SectionHeading
            icon={<Bell className="h-5 w-5" />}
            label="Notification Settings"
            title="What HTBF can remind you about"
          />

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

          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Notification Settings"}
          </button>
        </section>

        <section className="space-y-4 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <SectionHeading
            icon={<ShieldCheck className="h-5 w-5" />}
            label="Privacy Settings"
            title="Control what people see"
          />

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

          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Privacy Settings"}
          </button>
        </section>

        <section className="space-y-3 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
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
