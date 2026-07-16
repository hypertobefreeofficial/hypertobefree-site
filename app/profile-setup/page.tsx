"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AtSign,
  Edit3,
  LogOut,
  Mail,
  MapPin,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
type Profile = {
  email: string | null;
  real_name: string | null;
  display_name: string | null;
  username: string | null;
  location: string | null;
  bio: string | null;
  show_location: boolean | null;
  show_real_name: boolean | null;
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "email, real_name, display_name, username, location, bio, show_location, show_real_name"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load profile: ${error.message}`);
        setLoading(false);
        return;
      }

      setProfile({
        email: data?.email ?? user.email ?? null,
        real_name: data?.real_name ?? null,
        display_name: data?.display_name ?? user.email?.split("@")[0] ?? "HTBF User",
        username: data?.username ?? null,
        location: data?.location ?? null,
        bio: data?.bio ?? null,
        show_location: data?.show_location ?? true,
        show_real_name: data?.show_real_name ?? false,
      });

      setLoading(false);
    }

    void loadProfile();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-8 pb-mobile-nav-clearance text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading profile...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fbff] px-4 py-8 pb-mobile-nav-clearance text-slate-900">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-[2rem] bg-gradient-to-br from-[#082f63] to-[#0b63ce] p-6 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/20">
              <UserCircle className="h-12 w-12" />
            </div>

            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-blue-100">
                HTBF Profile
              </div>
              <h1 className="mt-1 break-words text-3xl font-black">
                {profile?.display_name || "HTBF User"}
              </h1>
              {profile?.username && (
                <p className="mt-1 text-sm font-bold text-blue-100">
                  @{profile.username}
                </p>
              )}
            </div>
          </div>
        </section>

        {message && (
          <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-100">
            {message}
          </div>
        )}

        <section className="mt-5 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-[#062a57]">
              Account Details
            </h2>

            <Link
              href="/profile/setup"
              className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-[#0b63ce] ring-1 ring-blue-100 hover:bg-blue-100"
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </Link>
          </div>

          <div className="space-y-3">
            <ProfileRow
              icon={<Mail className="h-5 w-5" />}
              label="Email"
              value={profile?.email || "Not available"}
            />

            <ProfileRow
              icon={<AtSign className="h-5 w-5" />}
              label="Username"
              value={profile?.username ? `@${profile.username}` : "Not set"}
            />

            <ProfileRow
              icon={<MapPin className="h-5 w-5" />}
              label="Location"
              value={
                profile?.show_location
                  ? profile?.location || "Not shared"
                  : "Hidden"
              }
            />

            <ProfileRow
              icon={<ShieldCheck className="h-5 w-5" />}
              label="Real Name"
              value={
                profile?.show_real_name
                  ? profile?.real_name || "Not set"
                  : "Private"
              }
            />
          </div>

          {profile?.bio && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <div className="text-sm font-black text-[#062a57]">Bio</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {profile.bio}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={signOut}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-50 px-5 py-3 text-sm font-black text-red-700 ring-1 ring-red-100 hover:bg-red-100"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </section>
      </div>

    </main>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
          {label}
        </div>
        <div className="mt-1 break-words font-black text-[#062a57]">
          {value}
        </div>
      </div>
    </div>
  );
}
