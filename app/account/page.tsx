"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  LogOut,
  Save,
  ShieldAlert,
  UserCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  location: string | null;
  status: string | null;
};

export default function AccountPage() {
  const [checkingUser, setCheckingUser] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("active");

  useEffect(() => {
    async function loadAccount() {
      setCheckingUser(true);
      setMessage("");
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? null);

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, display_name, username, location, status")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setErrorMessage(`Could not load profile: ${error.message}`);
        setCheckingUser(false);
        return;
      }

      if (profile) {
        const loadedProfile = profile as Profile;

        setDisplayName(loadedProfile.display_name ?? "");
        setUsername(loadedProfile.username ?? "");
        setLocation(loadedProfile.location ?? "");
        setStatus(loadedProfile.status ?? "active");
      } else {
        const { error: insertError } = await supabase.from("profiles").insert({
          id: user.id,
          display_name: "",
          username: "",
          location: "",
          status: "active",
        });

        if (insertError) {
          setErrorMessage(`Could not create profile: ${insertError.message}`);
        }
      }

      setCheckingUser(false);
    }

    loadAccount();
  }, []);

  async function saveProfile() {
    if (!userId) return;

    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const cleanUsername = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        username: cleanUsername || null,
        location: location.trim() || null,
      })
      .eq("id", userId);

    if (error) {
      setErrorMessage(`Could not save profile: ${error.message}`);
      setSaving(false);
      return;
    }

    setUsername(cleanUsername);
    setMessage("Profile updated.");
    setSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function requestAccountDeletion() {
    if (!userId) return;

    const confirmed = window.confirm(
      "Are you sure you want to request account deletion? Your stories will be removed from the public feed."
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage("");
    setErrorMessage("");

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        status: "deletion_requested",
      })
      .eq("id", userId);

    if (profileError) {
      setErrorMessage(`Could not request deletion: ${profileError.message}`);
      setDeleting(false);
      return;
    }

    const { error: storyError } = await supabase
      .from("stories")
      .update({
        status: "removed",
      })
      .eq("user_id", userId);

    if (storyError) {
      setErrorMessage(
        `Account was marked for deletion, but stories could not be removed: ${storyError.message}`
      );
      setDeleting(false);
      return;
    }

    setStatus("deletion_requested");
    setMessage(
      "Your account has been marked for deletion review and your stories were removed from the public feed."
    );
    setDeleting(false);
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading account...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] pb-28 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
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
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce]">
            <UserCircle className="h-4 w-4" />
            Account Settings
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            Manage your account.
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            Update your profile details, sign out, or request account deletion.
          </p>

          {message && (
            <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-[#082f63]">
              {message}
            </div>
          )}

          {errorMessage && (
            <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 rounded-[1.5rem] bg-slate-50 p-5">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-black text-slate-700">
                  Email
                </label>
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-600">
                  {email}
                </div>
              </div>

              <div>
                <label className="text-sm font-black text-slate-700">
                  Display name
                </label>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Example: Lou"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-[#0b63ce]"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-700">
                  Username
                </label>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="example_username"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-[#0b63ce]"
                />
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Use lowercase letters, numbers, or underscores.
                </p>
              </div>

              <div>
                <label className="text-sm font-black text-slate-700">
                  Location
                </label>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="City, State, or Country"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-[#0b63ce]"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-700">
                  Status
                </label>
                <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-600">
                  {status}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f] disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Profile"}
              </button>

              <button
                onClick={signOut}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-red-100 bg-white p-6 shadow-sm">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700">
            <ShieldAlert className="h-4 w-4" />
            Account Deletion
          </div>

          <h2 className="text-3xl font-black tracking-tight text-red-800">
            Request account deletion
          </h2>

          <p className="mt-3 leading-7 text-slate-600">
            This will mark your account for deletion review and remove your
            stories from the public feed. Permanent deletion should be handled
            later by the Hyper to Be Free team.
          </p>

          <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800">
            <strong>What happens now:</strong> Your profile status will change
            to deletion_requested, and your approved stories will be changed to
            removed so they no longer appear publicly.
          </div>

          <button
            onClick={requestAccountDeletion}
            disabled={deleting || status === "deletion_requested"}
            className="mt-6 rounded-full bg-red-700 px-5 py-3 text-sm font-black text-white hover:bg-red-800 disabled:opacity-60"
          >
            {status === "deletion_requested"
              ? "Deletion Requested"
              : deleting
                ? "Submitting..."
                : "Request Account Deletion"}
          </button>
        </section>
      </div>
    </main>
  );
}
