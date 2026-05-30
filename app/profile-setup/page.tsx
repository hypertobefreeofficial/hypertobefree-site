"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, UserCircle } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function ProfileSetupPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [realName, setRealName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const emailName = user.email?.split("@")[0] ?? "";

      const { data } = await supabase
        .from("profiles")
        .select("real_name, display_name, username, location, bio, profile_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (data?.profile_completed) {
        router.push("/feed");
        return;
      }

      setRealName(data?.real_name ?? "");
      setDisplayName(data?.display_name ?? emailName);
      setUsername(data?.username ?? "");
      setLocation(data?.location ?? "");
      setBio(data?.bio ?? "");

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

  async function saveProfile() {
    setMessage("");

    if (!userId) {
      setMessage("Please sign in again.");
      return;
    }

    const cleanDisplayName = displayName.trim();
    const cleanRealName = realName.trim();
    const cleanUserName = cleanUsername(username);

    if (!cleanDisplayName) {
      setMessage("Please add a display name.");
      return;
    }

    if (!cleanUserName || cleanUserName.length < 3) {
      setMessage("Please choose a username with at least 3 characters.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      real_name: cleanRealName,
      display_name: cleanDisplayName,
      username: cleanUserName,
      location: location.trim() || null,
      bio: bio.trim() || null,
      profile_completed: true,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
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
          Loading profile setup...
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
                Set up your profile
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                This helps people recognize your stories, prayers, and
                testimonies.
              </p>
            </div>
          </div>

          {message && (
            <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
              {message}
            </div>
          )}

          <div className="space-y-4">
            <Field label="Real name">
              <input
                value={realName}
                onChange={(event) => setRealName(event.target.value)}
                placeholder="Lou Anthony"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </Field>

            <Field label="Display name">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Lou"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
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
                  placeholder="greengmc1971"
                  className="w-full bg-transparent px-1 py-3 outline-none"
                />
              </div>
            </Field>

            <Field label="Location">
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Buckeye, AZ"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </Field>

            <Field label="Short bio or testimony line">
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Thankful for what God is doing."
                className="min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </Field>

            <button
              onClick={saveProfile}
              disabled={saving}
              className="w-full rounded-full bg-[#0b63ce] px-6 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Profile"}
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
