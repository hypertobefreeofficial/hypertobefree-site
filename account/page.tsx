"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  LogOut,
  ShieldCheck,
  Trash2,
  UserCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  location: string | null;
  profile_status: string | null;
  deletion_requested_at: string | null;
};

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadAccount() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, email, display_name, username, location, profile_status, deletion_requested_at"
        )
        .eq("id", user.id)
        .single();

      if (error) {
        setMessage(`Could not load profile: ${error.message}`);
      } else {
        setProfile(data as Profile);
      }

      setCheckingUser(false);
    }

    loadAccount();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function requestAccountDeletion() {
    setMessage("");

    if (!userId) {
      setMessage("You must be signed in to request account deletion.");
      return;
    }

    if (!confirmDelete) {
      setMessage("Please check the confirmation box first.");
      return;
    }

    setSubmitting(true);

    const now = new Date().toISOString();

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        profile_status: "deletion_requested",
        deletion_requested_at: now,
        updated_at: now,
      })
      .eq("id", userId);

    if (profileError) {
      setMessage(`Could not request deletion: ${profileError.message}`);
      setSubmitting(false);
      return;
    }

    const { error: storiesError } = await supabase
      .from("stories")
      .update({
        status: "removed",
      })
      .eq("user_id", userId);

    if (storiesError) {
      setMessage(
        `Your profile was marked for deletion, but stories could not be removed: ${storiesError.message}`
      );
      setSubmitting(false);
      return;
    }

    setProfile((current) =>
      current
        ? {
            ...current,
            profile_status: "deletion_requested",
            deletion_requested_at: now,
          }
        : current
    );

    setMessage(
      "Your account deletion request was submitted. Your public stories have been removed from the feed pending review."
    );

    setSubmitting(false);
  }

  if (checkingUser) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-8 shadow-sm">
          Loading account...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] text-slate-900">
      <section className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b63ce] hover:text-[#084f9f]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#0b63ce]">
            <UserCircle className="h-4 w-4" />
            Account Settings
          </div>

          <h1 className="text-4xl font-black tracking-tight text-[#062a57]">
            Manage your account.
          </h1>

          <p className="mt-4 leading-7 text-slate-600">
            View your account details, sign out, or request account deletion.
          </p>

          {profile && (
            <div className="mt-8 rounded-3xl bg-slate-50 p-5">
              <div className="grid gap-4 text-sm text-slate-700">
                <div>
                  <span className="font-black text-[#062a57]">Email:</span>{" "}
                  {profile.email || "Not available"}
                </div>

                <div>
                  <span className="font-black text-[#062a57]">
                    Display name:
                  </span>{" "}
                  {profile.display_name || "Not set"}
                </div>

                <div>
                  <span className="font-black text-[#062a57]">Username:</span>{" "}
                  {profile.username ? `@${profile.username}` : "Not set"}
                </div>

                <div>
                  <span className="font-black text-[#062a57]">Location:</span>{" "}
                  {profile.location || "Not set"}
                </div>

                <div>
                  <span className="font-black text-[#062a57]">Status:</span>{" "}
                  {profile.profile_status || "active"}
                </div>
              </div>
            </div>
          )}

          {message && (
            <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#082f63]">
              {message}
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={signOut}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>

        <div className="mt-8 rounded-[2.5rem] border border-red-100 bg-white p-8 shadow-sm">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Account Deletion
          </div>

          <h2 className="text-3xl font-black tracking-tight text-red-800">
            Request account deletion
          </h2>

          <p className="mt-4 leading-7 text-slate-600">
            This will mark your account for deletion and remove your stories
            from the public feed. Permanent deletion will be reviewed by the
            Hyper to Be Free team before your account is fully removed.
          </p>

          <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800">
            <div className="mb-1 flex items-center gap-2 font-black">
              <ShieldCheck className="h-4 w-4" />
              What happens now
            </div>
            Your profile will be marked as deletion requested, and your stories
            will be changed to removed so they no longer appear publicly.
          </div>

          <label className="mt-5 flex gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmDelete}
              onChange={(event) => setConfirmDelete(event.target.checked)}
            />
            <span>
              I understand that requesting account deletion will remove my
              stories from the public feed and mark my account for review.
            </span>
          </label>

          <button
            onClick={requestAccountDeletion}
            disabled={submitting}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-4 text-base font-bold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
          >
            <Trash2 className="h-4 w-4" />
            {submitting ? "Submitting request..." : "Request Account Deletion"}
          </button>
        </div>
      </section>
    </main>
  );
}
