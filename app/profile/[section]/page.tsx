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
  Lock,
  Mail,
  Save,
  Shield,
  Sparkles,
  UserX,
  UserCircle,
} from "lucide-react";
import {
  ACTIVE_SESSIONS_EXPLANATORY_NOTE,
  ACTIVE_SESSIONS_OTHER_DEVICES_SUCCESS_MESSAGE,
  resolveCurrentSessionDisplay,
  signOutCurrentSession,
  signOutEverywhere,
  signOutOtherSessions,
  type CurrentSessionDisplay,
} from "../../../lib/accountCenter/activeSessions";
import {
  updateAuthenticatedUserPassword,
  HTBF_PASSWORD_MIN_LENGTH,
} from "../../../lib/accountCenter/changePassword";
import {
  EMAIL_CHANGE_DUAL_CONFIRMATION_NOTE,
  formatEmailChangeVerificationMessage,
  requestAuthenticatedEmailChange,
} from "../../../lib/accountCenter/changeEmail";
import {
  resolveAccountInfoDisplay,
  type AccountInfoDisplay,
  type AccountInfoProfileRow,
} from "../../../lib/accountCenter/accountInfo";
import {
  TWO_FACTOR_DISABLE_CONFIRMATION,
  TWO_FACTOR_ENROLLMENT_SUCCESS_MESSAGE,
  TWO_FACTOR_EXPLANATORY_NOTE,
  TWO_FACTOR_INCOMPLETE_ENROLLMENT_MESSAGE,
  TWO_FACTOR_LOST_DEVICE_NOTE,
  TWO_FACTOR_MULTIPLE_FACTORS_NOTE,
  TWO_FACTOR_DISABLED_SUCCESS_MESSAGE,
  beginTotpEnrollment,
  cancelTotpEnrollment,
  disableVerifiedTotpFactor,
  formatTotpFactorCreatedAt,
  loadTwoFactorAuthSnapshot,
  selectPrimaryUnverifiedTotpFactor,
  selectPrimaryVerifiedTotpFactor,
  stepUpTotpForDisable,
  verifyTotpEnrollment,
  type TotpEnrollmentMaterial,
  type TwoFactorAuthSnapshot,
} from "../../../lib/accountCenter/twoFactorAuthentication";
import { isMfaChallengeComplete } from "../../../lib/auth/mfaChallenge";
import {
  accountCenterCategoryContent as categoryContent,
  type CategoryContent,
  type CategoryItem,
} from "../../../lib/accountCenter/categoryContent";
import { supabase } from "../../../lib/supabaseClient";
import AccountCenterDeleteAccountModal from "../../../components/account-center/AccountCenterDeleteAccountModal";

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

const placeholderContent: Record<string, PlaceholderContent> = {
  "change-password": {
    eyebrow: "Account & Security",
    title: "Change Password",
    description:
      "Password update tools will be added here when account security settings are connected.",
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

  if (section === "account-info") {
    return <AccountInfoSection />;
  }

  if (section === "change-password") {
    return <ChangePasswordSection />;
  }

  if (section === "change-email") {
    return <ChangeEmailSection />;
  }

  if (section === "active-sessions") {
    return <ActiveSessionsSection />;
  }

  if (section === "two-factor-authentication") {
    return <TwoFactorAuthenticationSection />;
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

function AccountInfoSection() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profileMessage, setProfileMessage] = useState("");
  const [accountInfo, setAccountInfo] = useState<AccountInfoDisplay | null>(
    null
  );

  useEffect(() => {
    async function loadAccountInfo() {
      setLoading(true);
      setProfileMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setProfileMessage(
          `Could not load profile details: ${error.message}. Your private sign-in information is still shown below.`
        );
      }

      setAccountInfo(
        resolveAccountInfoDisplay(user, (data as AccountInfoProfileRow | null) ?? null)
      );
      setLoading(false);
    }

    void loadAccountInfo();
  }, [router]);

  return (
    <AccountCenterDataShell
      icon={<Shield className="h-4 w-4" />}
      eyebrow="Account & Security"
      title="Account Info"
      description="Private sign-in and account details for your HTBF account. This information is visible only to you."
    >
      {profileMessage && (
        <div className="mt-5 rounded-[1.5rem] bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900 ring-1 ring-amber-100">
          {profileMessage}
        </div>
      )}

      {loading ? (
        <AccountCenterLoading text="Loading account information..." />
      ) : accountInfo && accountInfo.fields.length > 0 ? (
        <div className="mt-6 space-y-4">
          {accountInfo.fields.map((field) => (
            <AccountInfoFieldRow
              key={field.key}
              label={field.label}
              value={field.value}
            />
          ))}
        </div>
      ) : (
        <AccountCenterEmpty text="No account information is available right now. Try signing in again from the login page." />
      )}

      <p className="mt-5 text-xs font-semibold leading-5 text-slate-500">
        Your sign-in email stays private and is not shown on your public HTBF
        profile.
      </p>
    </AccountCenterDataShell>
  );
}

function AccountInfoFieldRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 break-all text-sm font-bold leading-6 text-[#062a57]">
        {value}
      </div>
    </div>
  );
}

function ActiveSessionsSection() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessionDisplay, setSessionDisplay] =
    useState<CurrentSessionDisplay | null>(null);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<
    "local" | "others" | "global" | null
  >(null);
  const [confirmEverywhereOpen, setConfirmEverywhereOpen] = useState(false);

  useEffect(() => {
    async function loadCurrentSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSessionDisplay(resolveCurrentSessionDisplay(user, session));
      setLoading(false);
    }

    void loadCurrentSession();
  }, [router]);

  async function handleSignOutCurrentDevice() {
    if (actionInFlight) {
      return;
    }

    setMessage("");
    setSuccess(false);
    setActionInFlight("local");

    const result = await signOutCurrentSession(supabase);

    setActionInFlight(null);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      setMessage(result.message);
      return;
    }

    router.push("/login");
  }

  async function handleSignOutOtherDevices() {
    if (actionInFlight) {
      return;
    }

    setMessage("");
    setSuccess(false);
    setActionInFlight("others");

    const result = await signOutOtherSessions(supabase);

    setActionInFlight(null);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      setMessage(result.message);
      return;
    }

    setSuccess(true);
    setMessage(ACTIVE_SESSIONS_OTHER_DEVICES_SUCCESS_MESSAGE);
  }

  async function handleSignOutEverywhere() {
    if (actionInFlight) {
      return;
    }

    setMessage("");
    setSuccess(false);
    setActionInFlight("global");
    setConfirmEverywhereOpen(false);

    const result = await signOutEverywhere(supabase);

    setActionInFlight(null);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      setMessage(result.message);
      return;
    }

    router.push("/login");
  }

  return (
    <AccountCenterDataShell
      icon={<Shield className="h-4 w-4" />}
      eyebrow="Account & Security"
      title="Active Sessions"
      description="Review this browser session and manage HTBF sign-in security without guessing about other devices."
    >
      <p className="mt-5 text-sm font-semibold leading-6 text-slate-600">
        {ACTIVE_SESSIONS_EXPLANATORY_NOTE}
      </p>

      {loading ? (
        <AccountCenterLoading text="Loading session security..." />
      ) : sessionDisplay ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-[1.75rem] bg-slate-50 p-5 ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-black text-[#062a57]">Current Session</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-emerald-700 ring-1 ring-emerald-100">
                This session
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {sessionDisplay.signInEmail ? (
                <AccountInfoFieldRow
                  label="Signed-in email"
                  value={sessionDisplay.signInEmail}
                />
              ) : null}

              {sessionDisplay.signInProvider ? (
                <AccountInfoFieldRow
                  label="Authentication provider"
                  value={sessionDisplay.signInProvider}
                />
              ) : null}

              {sessionDisplay.sessionExpiresAt ? (
                <AccountInfoFieldRow
                  label="Session expiration"
                  value={sessionDisplay.sessionExpiresAt}
                />
              ) : null}
            </div>
          </div>

          {message ? (
            <div
              className={`rounded-[1.5rem] p-4 text-sm font-bold leading-6 ring-1 ${
                success
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                  : "bg-red-50 text-red-700 ring-red-100"
              }`}
            >
              {message}
            </div>
          ) : null}

          <div className="space-y-3">
            <h2 className="text-lg font-black text-[#062a57]">Security Actions</h2>

            <button
              type="button"
              onClick={() => void handleSignOutCurrentDevice()}
              disabled={Boolean(actionInFlight)}
              className="inline-flex w-full items-center justify-center rounded-full bg-slate-100 px-6 py-3 text-sm font-black text-slate-800 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionInFlight === "local"
                ? "Signing out this device..."
                : "Sign out on this device"}
            </button>

            <button
              type="button"
              onClick={() => void handleSignOutOtherDevices()}
              disabled={Boolean(actionInFlight)}
              className="inline-flex w-full items-center justify-center rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionInFlight === "others"
                ? "Signing out other devices..."
                : "Sign out other devices"}
            </button>

            <button
              type="button"
              onClick={() => setConfirmEverywhereOpen(true)}
              disabled={Boolean(actionInFlight)}
              className="inline-flex w-full items-center justify-center rounded-full bg-red-50 px-6 py-3 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionInFlight === "global"
                ? "Signing out everywhere..."
                : "Sign out everywhere"}
            </button>
          </div>
        </div>
      ) : (
        <AccountCenterEmpty text="No session information is available right now. Try signing in again from the login page." />
      )}

      {confirmEverywhereOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-red-700">
              Session Security
            </div>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Sign out everywhere?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will revoke all HTBF sessions, including this browser. You
              will need to sign in again on every device. Other devices may
              keep using an already-issued access token until it expires.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirmEverywhereOpen(false)}
                disabled={Boolean(actionInFlight)}
                className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSignOutEverywhere()}
                disabled={Boolean(actionInFlight)}
                className="flex-1 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Sign out everywhere
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AccountCenterDataShell>
  );
}

function ChangeEmailSection() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadCurrentEmail() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setCurrentEmail(user.email ?? "");
      setLoading(false);
    }

    void loadCurrentEmail();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving || success) {
      return;
    }

    setMessage("");
    setSaving(true);

    const result = await requestAuthenticatedEmailChange(supabase, {
      newEmail,
      confirmEmail,
      emailRedirectTo: `${window.location.origin}/profile/account-info`,
    });

    setSaving(false);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      setMessage(result.message);
      return;
    }

    setNewEmail("");
    setConfirmEmail("");
    setSuccess(true);
    setMessage(
      result.verificationRequired
        ? formatEmailChangeVerificationMessage(result.pendingEmail)
        : `Your sign-in email was updated to ${result.pendingEmail}.`
    );
  }

  return (
    <AccountCenterDataShell
      icon={<Shield className="h-4 w-4" />}
      eyebrow="Account & Security"
      title="Change Email"
      description="Update the private email address you use to sign in to HTBF. Your sign-in email is never shown on your public profile."
    >
      <p className="mt-5 text-sm font-semibold leading-6 text-slate-600">
        {EMAIL_CHANGE_DUAL_CONFIRMATION_NOTE}
      </p>
      {loading ? (
        <AccountCenterLoading text="Checking your sign-in session..." />
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <label className="block">
            <div className="mb-2 text-sm font-black text-[#062a57]">
              Current sign-in email
            </div>
            <input
              value={currentEmail}
              readOnly
              disabled
              className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-black text-[#062a57]">
              New email address
            </div>
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
              <Mail className="h-4 w-4 text-slate-400" />
              <input
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent px-3 py-3 outline-none"
              />
            </div>
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-black text-[#062a57]">
              Confirm new email address
            </div>
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
              <Mail className="h-4 w-4 text-slate-400" />
              <input
                type="email"
                autoComplete="email"
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value)}
                placeholder="Re-enter new email"
                className="w-full bg-transparent px-3 py-3 outline-none"
              />
            </div>
          </label>

          {message && (
            <div
              className={`rounded-[1.5rem] p-4 text-sm font-bold leading-6 ring-1 ${
                success
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                  : "bg-red-50 text-red-700 ring-red-100"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || success}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Sending verification..." : "Update Email"}
            <Save className="h-4 w-4" />
          </button>
        </form>
      )}
    </AccountCenterDataShell>
  );
}

function ChangePasswordSection() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setLoading(false);
    }

    void checkAuth();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving || success) {
      return;
    }

    setMessage("");
    setSaving(true);

    const result = await updateAuthenticatedUserPassword(supabase, {
      password,
      confirmPassword,
    });

    setSaving(false);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      setMessage(result.message);
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
    setMessage("Your password was updated.");
  }

  return (
    <AccountCenterDataShell
      icon={<Shield className="h-4 w-4" />}
      eyebrow="Account & Security"
      title="Change Password"
      description="Update your HTBF password while signed in. HTBF uses your active Supabase session for this change and does not currently require your current password."
    >
      {loading ? (
        <AccountCenterLoading text="Checking your sign-in session..." />
      ) : (
        <>
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <label className="block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                New password
              </div>
              <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
                <Lock className="h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={`At least ${HTBF_PASSWORD_MIN_LENGTH} characters`}
                  className="w-full bg-transparent px-3 py-3 outline-none"
                />
              </div>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-black text-[#062a57]">
                Confirm new password
              </div>
              <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-200 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
                <Lock className="h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full bg-transparent px-3 py-3 outline-none"
                />
              </div>
            </label>

            {message && (
              <div
                className={`rounded-[1.5rem] p-4 text-sm font-bold leading-6 ring-1 ${
                  success
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-red-50 text-red-700 ring-red-100"
                }`}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || success}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Updating..." : "Update Password"}
              <Save className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-5 text-sm leading-6 text-slate-600">
            Forgot your current password?{" "}
            <Link
              href="/forgot-password"
              className="font-black text-[#0b63ce] underline"
            >
              Use password recovery
            </Link>
            .
          </p>
        </>
      )}
    </AccountCenterDataShell>
  );
}

function TwoFactorAuthenticationSection() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<TwoFactorAuthSnapshot | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollmentMaterial | null>(
    null
  );
  const [verifyCode, setVerifyCode] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [operationInFlight, setOperationInFlight] = useState<
    "enroll" | "verify" | "cancel" | "step_up" | "disable" | null
  >(null);
  const [disableStep, setDisableStep] = useState<"idle" | "step_up" | "confirm">(
    "idle"
  );
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  async function refreshSnapshot() {
    const loaded = await loadTwoFactorAuthSnapshot(supabase);
    if (loaded.ok === false) {
      router.push("/login");
      return null;
    }

    setSnapshot(loaded.snapshot);
    return loaded.snapshot;
  }

  useEffect(() => {
    async function initialize() {
      const loaded = await loadTwoFactorAuthSnapshot(supabase);
      if (loaded.ok === false) {
        router.push("/login");
        return;
      }

      setSnapshot(loaded.snapshot);
      setLoading(false);
    }

    void initialize();
  }, [router]);

  useEffect(() => {
    return () => {
      setEnrollment(null);
      setVerifyCode("");
      setStepUpCode("");
      setShowSecret(false);
    };
  }, []);

  const primaryVerifiedFactor = selectPrimaryVerifiedTotpFactor(
    snapshot?.verifiedTotpFactors
  );
  const primaryUnverifiedFactor = selectPrimaryUnverifiedTotpFactor(
    snapshot?.unverifiedTotpFactors ?? []
  );
  const hasVerifiedTotp = Boolean(primaryVerifiedFactor);
  const hasIncompleteEnrollment = Boolean(primaryUnverifiedFactor) && !enrollment;

  async function handleBeginEnrollment() {
    if (operationInFlight) {
      return;
    }

    setMessage("");
    setSuccess(false);
    setOperationInFlight("enroll");

    const result = await beginTotpEnrollment(supabase);

    setOperationInFlight(null);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      setMessage(result.message);
      return;
    }

    setEnrollment(result.enrollment);
    setVerifyCode("");
    setShowSecret(false);
  }

  async function handleVerifyEnrollment() {
    if (!enrollment || operationInFlight) {
      return;
    }

    setMessage("");
    setSuccess(false);
    setOperationInFlight("verify");

    const result = await verifyTotpEnrollment(
      supabase,
      enrollment.factorId,
      verifyCode
    );

    setOperationInFlight(null);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      setMessage(result.message);
      return;
    }

    setEnrollment(null);
    setVerifyCode("");
    setShowSecret(false);
    setSuccess(true);
    setMessage(TWO_FACTOR_ENROLLMENT_SUCCESS_MESSAGE);
    await refreshSnapshot();
  }

  async function handleCancelEnrollment(factorId: string) {
    if (operationInFlight) {
      return;
    }

    setMessage("");
    setSuccess(false);
    setOperationInFlight("cancel");

    const result = await cancelTotpEnrollment(supabase, factorId);

    setOperationInFlight(null);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      setMessage(result.message);
      return;
    }

    setEnrollment(null);
    setVerifyCode("");
    setShowSecret(false);
    await refreshSnapshot();
  }

  async function handleStepUpForDisable() {
    if (!primaryVerifiedFactor || operationInFlight) {
      return;
    }

    setMessage("");
    setSuccess(false);
    setOperationInFlight("step_up");

    const result = await stepUpTotpForDisable(
      supabase,
      primaryVerifiedFactor.id,
      stepUpCode
    );

    setOperationInFlight(null);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      setMessage(result.message);
      return;
    }

    setStepUpCode("");
    setDisableStep("confirm");
    setConfirmDisableOpen(true);
  }

  async function handleDisableVerifiedFactor() {
    if (!primaryVerifiedFactor || operationInFlight) {
      return;
    }

    setMessage("");
    setSuccess(false);
    setOperationInFlight("disable");
    setConfirmDisableOpen(false);
    setDisableStep("idle");

    const result = await disableVerifiedTotpFactor(
      supabase,
      primaryVerifiedFactor.id
    );

    setOperationInFlight(null);

    if (result.ok === false) {
      if (result.code === "not_authenticated") {
        router.push("/login");
        return;
      }

      if (result.code === "insufficient_aal") {
        setDisableStep("step_up");
      }

      setMessage(result.message);
      return;
    }

    setStepUpCode("");
    setSuccess(true);
    setMessage(TWO_FACTOR_DISABLED_SUCCESS_MESSAGE);
    await refreshSnapshot();
  }

  function beginDisableFlow() {
    if (!primaryVerifiedFactor || operationInFlight) {
      return;
    }

    setMessage("");
    setSuccess(false);

    if (snapshot?.assurance && isMfaChallengeComplete(snapshot.assurance)) {
      setDisableStep("confirm");
      setConfirmDisableOpen(true);
      return;
    }

    setDisableStep("step_up");
  }

  return (
    <AccountCenterDataShell
      icon={<Shield className="h-4 w-4" />}
      eyebrow="Account & Security"
      title="Two-Factor Authentication"
      description="Protect your HTBF account with an authenticator app using Supabase native TOTP."
    >
      <p className="mt-5 text-sm font-semibold leading-6 text-slate-600">
        {TWO_FACTOR_EXPLANATORY_NOTE}
      </p>

      {loading ? (
        <AccountCenterLoading text="Loading two-factor authentication..." />
      ) : (
        <div className="mt-6 space-y-6">
          <div className="rounded-[1.75rem] bg-slate-50 p-5 ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-black text-[#062a57]">
                Authenticator app
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ring-1 ${
                  hasVerifiedTotp
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-slate-100 text-slate-600 ring-slate-200"
                }`}
              >
                {hasVerifiedTotp ? "Enabled" : "Off"}
              </span>
            </div>

            {hasVerifiedTotp && primaryVerifiedFactor ? (
              <div className="mt-4 space-y-4">
                {primaryVerifiedFactor.friendly_name ? (
                  <AccountInfoFieldRow
                    label="Authenticator label"
                    value={primaryVerifiedFactor.friendly_name}
                  />
                ) : null}

                {formatTotpFactorCreatedAt(primaryVerifiedFactor.created_at) ? (
                  <AccountInfoFieldRow
                    label="Enabled on"
                    value={
                      formatTotpFactorCreatedAt(primaryVerifiedFactor.created_at) ??
                      ""
                    }
                  />
                ) : null}

                {(snapshot?.verifiedTotpFactors.length ?? 0) > 1 ? (
                  <p className="text-sm leading-6 text-slate-600">
                    {TWO_FACTOR_MULTIPLE_FACTORS_NOTE}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Two-factor authentication is not enabled for this account.
              </p>
            )}
          </div>

          {hasIncompleteEnrollment && primaryUnverifiedFactor ? (
            <div className="rounded-[1.75rem] bg-amber-50 p-5 ring-1 ring-amber-100">
              <h3 className="text-base font-black text-[#062a57]">
                Setup incomplete
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {TWO_FACTOR_INCOMPLETE_ENROLLMENT_MESSAGE}
              </p>
              <button
                type="button"
                onClick={() =>
                  void handleCancelEnrollment(primaryUnverifiedFactor.id)
                }
                disabled={Boolean(operationInFlight)}
                className="mt-4 inline-flex items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {operationInFlight === "cancel"
                  ? "Canceling..."
                  : "Cancel incomplete setup"}
              </button>
            </div>
          ) : null}

          {enrollment ? (
            <div className="rounded-[1.75rem] bg-white p-5 ring-1 ring-slate-200">
              <h3 className="text-base font-black text-[#062a57]">
                Set up your authenticator app
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Scan the QR code with your authenticator app, or enter the setup
                key manually. Then enter the 6-digit code to finish setup.
              </p>

              <div className="mt-5 flex justify-center rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
                <img
                  src={enrollment.qrCode}
                  alt="Authenticator app QR code"
                  className="h-48 w-48"
                />
              </div>

              <div className="mt-5">
                <div className="mb-2 text-sm font-black text-[#062a57]">
                  Manual setup key
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="font-mono text-sm tracking-[0.18em] text-slate-700">
                    {showSecret ? enrollment.secret : "••••••••••••••••"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSecret((current) => !current)}
                    className="mt-3 text-sm font-black text-[#0b63ce]"
                  >
                    {showSecret ? "Hide setup key" : "Show setup key"}
                  </button>
                </div>
              </div>

              <label className="mt-5 block">
                <div className="mb-2 text-sm font-black text-[#062a57]">
                  Verification code
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(event) =>
                    setVerifyCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6)
                    )
                  }
                  placeholder="000000"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 tracking-[0.35em] outline-none focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
                />
              </label>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleVerifyEnrollment()}
                  disabled={Boolean(operationInFlight)}
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {operationInFlight === "verify"
                    ? "Verifying..."
                    : "Verify and enable"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleCancelEnrollment(enrollment.factorId)
                  }
                  disabled={Boolean(operationInFlight)}
                  className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-[#0b63ce] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {operationInFlight === "cancel"
                    ? "Canceling..."
                    : "Cancel setup"}
                </button>
              </div>
            </div>
          ) : null}

          {!hasVerifiedTotp && !enrollment && !hasIncompleteEnrollment ? (
            <button
              type="button"
              onClick={() => void handleBeginEnrollment()}
              disabled={Boolean(operationInFlight)}
              className="inline-flex w-full items-center justify-center rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {operationInFlight === "enroll"
                ? "Starting setup..."
                : "Set up authenticator"}
            </button>
          ) : null}

          {hasVerifiedTotp && primaryVerifiedFactor ? (
            <div className="space-y-4">
              {disableStep === "step_up" ? (
                <div className="rounded-[1.75rem] bg-white p-5 ring-1 ring-slate-200">
                  <h3 className="text-base font-black text-[#062a57]">
                    Verify before disabling
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Enter the current code from your authenticator app to
                    continue.
                  </p>
                  <label className="mt-4 block">
                    <div className="mb-2 text-sm font-black text-[#062a57]">
                      Authenticator code
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={stepUpCode}
                      onChange={(event) =>
                        setStepUpCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      placeholder="000000"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 tracking-[0.35em] outline-none focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    />
                  </label>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void handleStepUpForDisable()}
                      disabled={Boolean(operationInFlight)}
                      className="inline-flex flex-1 items-center justify-center rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {operationInFlight === "step_up"
                        ? "Verifying..."
                        : "Continue"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDisableStep("idle");
                        setStepUpCode("");
                      }}
                      disabled={Boolean(operationInFlight)}
                      className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-[#0b63ce] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={beginDisableFlow}
                  disabled={Boolean(operationInFlight)}
                  className="inline-flex w-full items-center justify-center rounded-full border border-red-200 bg-red-50 px-6 py-3 text-sm font-black text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Disable two-factor authentication
                </button>
              )}
            </div>
          ) : null}

          {message ? (
            <div
              className={`rounded-[1.5rem] p-4 text-sm font-bold leading-6 ring-1 ${
                success
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                  : "bg-red-50 text-red-700 ring-red-100"
              }`}
            >
              {message}
            </div>
          ) : null}

          <p className="text-sm leading-6 text-slate-600">
            {TWO_FACTOR_LOST_DEVICE_NOTE}
          </p>
        </div>
      )}

      {confirmDisableOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-xl font-black text-[#062a57]">
              Disable two-factor authentication?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {TWO_FACTOR_DISABLE_CONFIRMATION}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleDisableVerifiedFactor()}
                disabled={Boolean(operationInFlight)}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {operationInFlight === "disable"
                  ? "Disabling..."
                  : "Disable two-factor authentication"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDisableOpen(false);
                  setDisableStep("idle");
                }}
                disabled={Boolean(operationInFlight)}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-[#0b63ce] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep enabled
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AccountCenterDataShell>
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

      const { data, error } = await supabase
        .from("saved_content")
        .select(
          "story_id, created_at, stories(id, user_id, name, story_type, story_text, image_url, video_url, prayer_status, answered_text, status, created_at)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(`Could not load saved content: ${error.message}`);
        setLoading(false);
        return;
      }

      setItems(parseSavedContentItems(data));
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


      <AccountCenterDeleteAccountModal
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
      />
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
