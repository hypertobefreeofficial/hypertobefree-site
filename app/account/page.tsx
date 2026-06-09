"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Eye,
  Lock,
  LogOut,
  Mail,
  MessageCircleHeart,
  Save,
  ShieldAlert,
  Sparkles,
  UserCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type ProfileVisibility = "community" | "private";

type ProfileRow = {
  id: string;
  email: string | null;
  real_name: string | null;
  display_name: string | null;
  username: string | null;
  username_last_changed_at: string | null;
  location: string | null;
  bio: string | null;
  status: string | null;
  profile_visibility: ProfileVisibility | string | null;
  show_location: boolean | null;
  show_real_name: boolean | null;
  journey_focus: string | null;
  profile_completed: boolean | null;

  notify_replies: boolean | null;
  notify_prayers: boolean | null;
  notify_praise: boolean | null;
  notify_journey_updates: boolean | null;
  notify_email_updates: boolean | null;

  allow_video_responses: boolean | null;
  allow_prayer_messages: boolean | null;
  allow_journey_messages: boolean | null;
};

type AccountDeletionRequest = {
  id: string;
  user_id: string;
  email: string | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
};

const USERNAME_COOLDOWN_DAYS = 30;

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [realName, setRealName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [usernameLastChangedAt, setUsernameLastChangedAt] = useState<
    string | null
  >(null);

  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  const [status, setStatus] = useState("active");
  const [profileVisibility, setProfileVisibility] =
    useState<ProfileVisibility>("community");
  const [showLocation, setShowLocation] = useState(true);
  const [showRealName, setShowRealName] = useState(false);
  const [journeyFocus, setJourneyFocus] = useState("encouragement");

  const [notifyReplies, setNotifyReplies] = useState(true);
  const [notifyPrayers, setNotifyPrayers] = useState(true);
  const [notifyPraise, setNotifyPraise] = useState(true);
  const [notifyJourneyUpdates, setNotifyJourneyUpdates] = useState(true);
  const [notifyEmailUpdates, setNotifyEmailUpdates] = useState(false);

  const [allowVideoResponses, setAllowVideoResponses] = useState(true);
  const [allowPrayerMessages, setAllowPrayerMessages] = useState(true);
  const [allowJourneyMessages, setAllowJourneyMessages] = useState(true);

  const [deletionRequest, setDeletionRequest] =
    useState<AccountDeletionRequest | null>(null);

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

      const userEmail = user.email ?? "";

      setUserId(user.id);
      setEmail(userEmail);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          `
          id,
          email,
          real_name,
          display_name,
          username,
          username_last_changed_at,
          location,
          bio,
          status,
          profile_visibility,
          show_location,
          show_real_name,
          journey_focus,
          profile_completed,
          notify_replies,
          notify_prayers,
          notify_praise,
          notify_journey_updates,
          notify_email_updates,
          allow_video_responses,
          allow_prayer_messages,
          allow_journey_messages
          `
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load profile: ${error.message}`);
        setLoading(false);
        return;
      }

      const profile = data as ProfileRow | null;
      const fallbackName = userEmail.split("@")[0] ?? "";
      const savedUsername = profile?.username ?? "";

      setRealName(profile?.real_name ?? "");
      setDisplayName(profile?.display_name ?? fallbackName);
      setUsername(savedUsername);
      setOriginalUsername(savedUsername);
      setUsernameLastChangedAt(profile?.username_last_changed_at ?? null);

      setLocation(profile?.location ?? "");
      setBio(profile?.bio ?? "");

      setStatus(profile?.status ?? "active");

      const savedVisibility = profile?.profile_visibility;
      setProfileVisibility(
        savedVisibility === "private" ? "private" : "community"
      );

      setShowLocation(profile?.show_location ?? true);
      setShowRealName(profile?.show_real_name ?? false);
      setJourneyFocus(profile?.journey_focus ?? "encouragement");

      setNotifyReplies(profile?.notify_replies ?? true);
      setNotifyPrayers(profile?.notify_prayers ?? true);
      setNotifyPraise(profile?.notify_praise ?? true);
      setNotifyJourneyUpdates(profile?.notify_journey_updates ?? true);
      setNotifyEmailUpdates(profile?.notify_email_updates ?? false);

      setAllowVideoResponses(profile?.allow_video_responses ?? true);
      setAllowPrayerMessages(profile?.allow_prayer_messages ?? true);
      setAllowJourneyMessages(profile?.allow_journey_messages ?? true);

      const { data: deletionData, error: deletionError } = await supabase
        .from("account_deletion_requests")
        .select("id, user_id, email, reason, status, created_at")
        .eq("user_id", user.id)
        .in("status", ["submitted", "reviewing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!deletionError && deletionData) {
        setDeletionRequest(deletionData as AccountDeletionRequest);
      }

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

  const usernameChanged = useMemo(() => {
    return cleanUsername(username) !== cleanUsername(originalUsername);
  }, [username, originalUsername]);

  const usernameCooldownInfo = useMemo(() => {
    if (!usernameLastChangedAt) {
      return {
        locked: false,
        daysRemaining: 0,
      };
    }

    const lastChanged = new Date(usernameLastChangedAt);
    const nextAllowed = new Date(lastChanged);
    nextAllowed.setDate(nextAllowed.getDate() + USERNAME_COOLDOWN_DAYS);

    const now = new Date();

    if (now >= nextAllowed) {
      return {
        locked: false,
        daysRemaining: 0,
      };
    }

    const diffMs = nextAllowed.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return {
      locked: true,
      daysRemaining,
    };
  }, [usernameLastChangedAt]);

  async function saveAccount() {
    setMessage("");

    if (!userId) {
      setMessage("Please sign in again.");
      return;
    }

    if (!email) {
      setMessage(
        "Could not find your account email. Please sign out and sign back in."
      );
      return;
    }

    const cleanDisplayName = displayName.trim();
    const cleanUsernameValue = cleanUsername(username);
    const cleanOriginalUsername = cleanUsername(originalUsername);

    if (!cleanDisplayName) {
      setMessage("Please add a display name.");
      return;
    }

    if (!cleanUsernameValue || cleanUsernameValue.length < 3) {
      setMessage("Please choose a username with at least 3 characters.");
      return;
    }

    const isChangingUsername =
      cleanOriginalUsername && cleanUsernameValue !== cleanOriginalUsername;

    if (isChangingUsername && usernameCooldownInfo.locked) {
      setMessage(
        `You can change your username again in ${usernameCooldownInfo.daysRemaining} day${
          usernameCooldownInfo.daysRemaining === 1 ? "" : "s"
        }.`
      );
      return;
    }

    const usernameChangeTimestamp =
      isChangingUsername || !usernameLastChangedAt
        ? new Date().toISOString()
        : usernameLastChangedAt;

    setSaving(true);

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      email,
      real_name: realName.trim() || null,
      display_name: cleanDisplayName,
      username: cleanUsernameValue,
      username_last_changed_at: usernameChangeTimestamp,
      location: location.trim() || null,
      bio: bio.trim() || null,
      status,
      profile_visibility: profileVisibility,
      show_location: showLocation,
      show_real_name: showRealName,
      journey_focus: journeyFocus,
      notify_replies: notifyReplies,
      notify_prayers: notifyPrayers,
      notify_praise: notifyPraise,
      notify_journey_updates: notifyJourneyUpdates,
      notify_email_updates: notifyEmailUpdates,
      allow_video_responses: allowVideoResponses,
      allow_prayer_messages: allowPrayerMessages,
      allow_journey_messages: allowJourneyMessages,
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

    setOriginalUsername(cleanUsernameValue);
    setUsername(cleanUsernameValue);
    setUsernameLastChangedAt(usernameChangeTimestamp);

    setMessage("Account settings saved. Taking you to the feed...");

    window.location.href = "/feed";
  }

  async function requestAccountDeletion() {
    setMessage("");

    if (!userId) {
      setMessage("Please sign in again before requesting account deletion.");
      return;
    }

    if (deletionRequest) {
      setMessage("Your account deletion request is already submitted.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to request account deletion? This will submit a request to HTBF admin for review. Your account will not be deleted instantly."
    );

    if (!confirmed) return;

    const reason = window.prompt(
      "Optional: Tell us why you want to delete your account. You can leave this blank."
    );

    if (reason === null) return;

    setRequestingDeletion(true);

    const { data, error } = await supabase
      .from("account_deletion_requests")
      .insert({
        user_id: userId,
        email: email || null,
        reason: reason.trim() || null,
        status: "submitted",
      })
      .select("id, user_id, email, reason, status, created_at")
      .single();

    setRequestingDeletion(false);

    if (error) {
      setMessage(`Could not submit deletion request: ${error.message}`);
      return;
    }

    setDeletionRequest(data as AccountDeletionRequest);
    setMessage(
      "Your account deletion request was submitted. HTBF admin will review it."
    );
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function formatDate(value: string | null) {
    if (!value) return "date unavailable";

    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
    <main className="min-h-screen bg-[#f8fbff] pb-28 text-slate-900">
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
            Update your profile identity, privacy, notifications, message
            preferences, and Journey settings.
          </p>

          {message && (
            <div
              className={`mt-5 rounded-2xl p-4 text-sm font-bold ${
                message.includes("saved") ||
                message.includes("submitted") ||
                message.includes("already submitted")
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          )}

          {deletionRequest && (
            <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold leading-6 text-red-700 ring-1 ring-red-100">
              Account deletion request submitted on{" "}
              {formatDate(deletionRequest.created_at)}. Status:{" "}
              {deletionRequest.status || "submitted"}.
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
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4">
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
            text="Allow your location to appear with stories and community activity."
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
              onChange={(event) =>
                setProfileVisibility(event.target.value as ProfileVisibility)
              }
              className="input-style"
            >
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
            title="Replies to my videos"
            text="Notify me when someone responds to one of my video testimonies."
            checked={notifyReplies}
            onChange={setNotifyReplies}
          />

          <ToggleRow
            title="Prayer responses"
            text="Notify me when someone prays with me or responds to my prayer request."
            checked={notifyPrayers}
            onChange={setNotifyPrayers}
          />

          <ToggleRow
            title="Praise and Amen activity"
            text="Notify me when people react with Amen, Praise, or encouragement."
            checked={notifyPraise}
            onChange={setNotifyPraise}
          />

          <ToggleRow
            title="Journey inbox updates"
            text="Notify me when I receive Journey messages or encouragement."
            checked={notifyJourneyUpdates}
            onChange={setNotifyJourneyUpdates}
          />

          <ToggleRow
            title="Email updates"
            text="Allow occasional HTBF email updates. You can leave this off for now."
            checked={notifyEmailUpdates}
            onChange={setNotifyEmailUpdates}
          />
        </SettingsSection>

        <SettingsSection
          icon={<MessageCircleHeart className="h-6 w-6" />}
          label="Message Preferences"
          title="Control how others can interact with you"
        >
          <ToggleRow
            title="Allow video responses"
            text="Let people send kind responses or encouragement from your video testimonies."
            checked={allowVideoResponses}
            onChange={setAllowVideoResponses}
          />

          <ToggleRow
            title="Allow prayer messages"
            text="Let people send prayer encouragement from prayer-related posts."
            checked={allowPrayerMessages}
            onChange={setAllowPrayerMessages}
          />

          <ToggleRow
            title="Allow Journey messages"
            text="Let people send encouragement to your Journey inbox."
            checked={allowJourneyMessages}
            onChange={setAllowJourneyMessages}
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
              onClick={requestAccountDeletion}
              disabled={requestingDeletion || Boolean(deletionRequest)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-red-50 px-5 py-3 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ShieldAlert className="h-4 w-4" />
              {requestingDeletion
                ? "Submitting Request..."
                : deletionRequest
                  ? "Deletion Request Submitted"
                  : "Request Account Deletion"}
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] bg-blue-50 p-5 text-sm font-semibold leading-6 text-[#082f63] ring-1 ring-blue-100">
          <div className="mb-2 flex items-center gap-2 font-black">
            <Mail className="h-4 w-4" />
            Need help?
          </div>
          Contact HTBF at{" "}
          <a
            href="mailto:support@hypertobefree.com?subject=HTBF%20Account%20Support"
            className="font-black underline"
          >
            support@hypertobefree.com
          </a>
          .
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
        aria-pressed={checked}
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
