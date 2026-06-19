"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Sparkles } from "lucide-react";
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
