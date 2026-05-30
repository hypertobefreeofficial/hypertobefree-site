"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function ProfileSetupPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const [realName, setRealName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  const [showLocation, setShowLocation] = useState(true);
  const [showRealName, setShowRealName] = useState(false);

  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSetup() {
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
          "real_name, display_name, username, location, bio, show_location, show_real_name, profile_completed"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load profile setup: ${error.message}`);
        setLoading(false);
        return;
      }

      if (data?.display_name && data?.username) {
        router.push("/feed");
        return;
      }

      setRealName(data?.real_name ?? "");
      setDisplayName(data?.display_name ?? fallbackName);
      setUsername(data?.username ?? cleanUsername(fallbackName));
      setLocation(data?.location ?? "");
      setBio(data?.bio ?? "");
      setShowLocation(data?.show_location ?? true);
      setShowRealName(data?.show_real_name ?? false);

      setLoading(false);
    }

    loadSetup();
  }, [router]);

  function cleanUsername(value: string) {
    return value
      .toLowerCase()
      .replace("@", "")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24);
  }

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
      profile_visibility: "public",
      allow_prayer_notifications: true,
      allow_story_notifications: true,
      journey_focus: "encouragement",
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

    router.push("/feed");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Setting up your profile...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-xl">
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <Sparkles className="h-4 w-4" />
            Welcome to HTBF
          </div>

          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
              <UserCircle className="h-8 w-8" />
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight text-[#062a57]">
                Create your profile
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Choose how people will recognize you before posting, praying, or
                sharing stories.
              </p>
            </div>
          </div>

          {message && (
            <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
              {message}
            </div>
          )}

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

            <div className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
              <div className="mb-3 flex items-center gap-2 font-black text-[#062a57]">
                <ShieldCheck className="h-5 w-5 text-[#0b63ce]" />
                Privacy defaults
              </div>

              <ToggleRow
                title="Show my location"
                text="Allow your location to appear with stories and movement views."
                checked={showLocation}
                onChange={setShowLocation}
              />

              <div className="mt-3">
                <ToggleRow
                  title="Show my real name"
                  text="If turned off, HTBF uses your display name instead."
                  checked={showRealName}
                  onChange={setShowRealName}
                />
              </div>
            </div>

            <button
              onClick={saveProfile}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? "Saving..." : "Complete Profile"}
            </button>
          </div>
        </section>
      </div>
    </main>
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
