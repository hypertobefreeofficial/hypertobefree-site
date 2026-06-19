"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import LoggedInBottomNav from "../../../components/LoggedInBottomNav";
import { supabase } from "../../../lib/supabaseClient";

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
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
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

      <LoggedInBottomNav />
    </main>
  );
}

function AccountCenterCategoryPage({ content }: { content: CategoryContent }) {
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
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
    <main className="min-h-screen bg-[#f8fbff] pb-24 text-slate-900">
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

      <LoggedInBottomNav />
    </main>
  );
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
