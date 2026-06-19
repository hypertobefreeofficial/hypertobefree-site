"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ChevronRight,
  MapPin,
  Sparkles,
  UserCircle,
} from "lucide-react";
import LoggedInBottomNav from "../../components/LoggedInBottomNav";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  username: string | null;
  location: string | null;
  bio: string | null;
  show_location: boolean | null;
};

type AccountAction = {
  badge?: string;
  disabled?: boolean;
  href?: string;
  meta?: string;
  onClick?: () => void;
  text: string;
  title: string;
  tone?: "default" | "danger";
};

const PROFILE_AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfilePage() {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState("");

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(
    null
  );
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [showLocation, setShowLocation] = useState(true);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

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
      setUserId(user.id);
      setEmail(userEmail);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "avatar_url, display_name, username, location, bio, show_location"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        setMessage(`Could not load profile: ${error.message}`);
        setLoading(false);
        return;
      }

      const profile = data as ProfileRow | null;

      setAvatarUrl(profile?.avatar_url ?? "");
      setDisplayName(profile?.display_name ?? "");
      setUsername(profile?.username ?? "");
      setLocation(profile?.location ?? "");
      setBio(profile?.bio ?? "");
      setShowLocation(profile?.show_location ?? true);

      await loadUnreadNotificationCount(user.id);

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  async function loadUnreadNotificationCount(currentUserId: string) {
    const { count, error } = await supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId)
      .eq("read", false)
      .is("hidden_at", null);

    setUnreadNotificationCount(error ? 0 : count ?? 0);
  }

  const profileName = useMemo(() => {
    return displayName.trim() || username.trim() || "Set up your profile";
  }, [displayName, username]);

  const visibleLocation =
    showLocation && location.trim() ? location.trim() : "";

  const accountCenterActions: AccountAction[] = [
    {
      title: "Account & Security",
      text: "Email, password, active sessions, delete account.",
      href: "/profile/account-security",
    },
    {
      title: "Privacy & Safety",
      text: "Profile visibility, blocked users, muted users, reports.",
      href: "/profile/privacy-safety",
    },
    {
      title: "Notifications",
      text: "Prayer, story, praise, email notifications.",
      meta:
        unreadNotificationCount > 0
          ? `${Math.min(unreadNotificationCount, 99)}${
              unreadNotificationCount > 99 ? "+" : ""
            } unread`
          : undefined,
      href: "/profile/notifications",
    },
    {
      title: "Content Management",
      text: "Posts, videos, prayer requests, praise reports, saved content.",
      href: "/profile/content-management",
    },
    {
      title: "Support",
      text: "Help center, report a problem, policies, terms.",
      href: "/profile/support",
    },
    {
      title: signingOut ? "Signing out..." : "Sign Out",
      text: "Leave this device safely.",
      disabled: signingOut,
      onClick: signOut,
    },
  ];

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  function openAvatarPicker() {
    avatarInputRef.current?.click();
  }

  async function uploadAvatar() {
    setMessage("");

    const file = selectedAvatarFile;

    if (!file) {
      setMessage("Choose a profile photo before saving.");
      return;
    }

    if (!userId) {
      setMessage("Please sign in again before changing your profile photo.");
      return;
    }

    const extensionFromName = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : extensionFromName === "jpeg"
            ? "jpeg"
            : "jpg";
    const filePath = `${userId}/avatar.${extension}`;

    setUploadingAvatar(true);
    setMessage("Uploading profile photo...");

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_AVATAR_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      setUploadingAvatar(false);
      setMessage(`Could not upload profile photo: ${uploadError.message}`);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from(PROFILE_AVATAR_BUCKET)
      .getPublicUrl(filePath);

    const nextAvatarUrl = publicUrlData.publicUrl;

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: email || null,
        avatar_url: nextAvatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (profileError) {
      setUploadingAvatar(false);
      setMessage(`Could not save profile photo: ${profileError.message}`);
      return;
    }

    setAvatarUrl(`${nextAvatarUrl}?v=${Date.now()}`);
    setSelectedAvatarFile(null);
    setAvatarPreviewUrl("");
    setUploadingAvatar(false);
    setMessage("Profile photo updated.");
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setMessage("");

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setSelectedAvatarFile(null);
      setAvatarPreviewUrl("");
      setMessage("Choose a JPG, JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setSelectedAvatarFile(null);
      setAvatarPreviewUrl("");
      setMessage("Profile photo must be 5 MB or smaller.");
      return;
    }

    setSelectedAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    setMessage("Preview ready. Tap Save Photo to upload it.");
  }

  function cancelAvatarPreview() {
    setSelectedAvatarFile(null);
    setAvatarPreviewUrl("");
    setMessage("");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fbff] px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          Loading your profile setup...
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

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200">
          <div className="bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-white/15">
              <Sparkles className="h-4 w-4" />
              Profile Setup
            </div>

            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={openAvatarPicker}
                  disabled={uploadingAvatar}
                  className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] bg-white/15 text-white ring-1 ring-white/20 transition hover:bg-white/20 disabled:opacity-70"
                  aria-label="Change profile photo"
                >
                  {avatarPreviewUrl ? (
                    <img
                      src={avatarPreviewUrl}
                      alt="Selected profile preview"
                      className="h-full w-full object-cover"
                    />
                  ) : avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Profile photo"
                      fill
                      sizes="112px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <UserCircle className="h-20 w-20" />
                  )}

                  {uploadingAvatar && (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#062a57]/60 text-[11px] font-black uppercase tracking-[0.12em] text-white">
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Uploading
                    </span>
                  )}
                </button>
                <div className="mt-3 flex w-28 flex-col gap-2">
                  <button
                    type="button"
                    onClick={openAvatarPicker}
                    disabled={uploadingAvatar}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-black text-[#0b63ce] shadow-sm hover:bg-blue-50 disabled:opacity-70"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {avatarUrl ? "Change Photo" : "Add Photo"}
                  </button>

                  {selectedAvatarFile && (
                    <>
                      <button
                        type="button"
                        onClick={uploadAvatar}
                        disabled={uploadingAvatar}
                        className="rounded-full bg-[#062a57] px-3 py-2 text-[11px] font-black text-white shadow-sm hover:bg-[#041f41] disabled:opacity-70"
                      >
                        {uploadingAvatar ? "Saving..." : "Save Photo"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelAvatarPreview}
                        disabled={uploadingAvatar}
                        className="rounded-full bg-white/10 px-3 py-2 text-[11px] font-black text-white ring-1 ring-white/20 hover:bg-white/15 disabled:opacity-70"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="break-words text-4xl font-black tracking-tight">
                  {profileName}
                </h1>
                <p className="mt-2 text-sm font-bold text-blue-100">
                  {username ? `@${username}` : "Set up your HTBF username"}
                </p>

                {bio ? (
                  <p className="mt-3 whitespace-pre-wrap break-words leading-7 text-blue-50">
                    {bio}
                  </p>
                ) : (
                  <p className="mt-3 leading-7 text-blue-50">
                    Add a short testimony line so your profile feels like you.
                  </p>
                )}

                {visibleLocation && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold text-blue-50 ring-1 ring-white/15">
                    <MapPin className="h-4 w-4" />
                    {visibleLocation}
                  </div>
                )}

                <Link
                  href="/profile/edit"
                  className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b63ce] shadow-sm hover:bg-blue-50"
                >
                  Edit Profile
                </Link>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <section className="rounded-[2rem] bg-blue-50 p-5 text-sm font-bold text-[#082f63] ring-1 ring-blue-100">
            {message}
          </section>
        )}

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <SectionIntro
            label="Account Center"
            title="Choose what you need"
            text="Focused profile, privacy, content, notification, and support tools live one tap away."
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accountCenterActions.map((action) => (
              <ActionCard key={action.title} action={action} />
            ))}
          </div>
        </section>
      </div>

      <LoggedInBottomNav />
    </main>
  );
}

function ActionCard({ action }: { action: AccountAction }) {
  const isDanger = action.tone === "danger";
  const className = `group rounded-[1.5rem] p-4 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-70 ${
    isDanger
      ? "bg-red-50 text-red-800 ring-red-100 hover:bg-red-100"
      : "bg-slate-50 text-slate-900 ring-slate-100 hover:bg-blue-50 hover:ring-blue-100"
  }`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`text-base font-black ${
            isDanger ? "text-red-800" : "text-[#062a57]"
          }`}
        >
          {action.title}
        </h3>
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 ${
            isDanger ? "text-red-500" : "text-[#0b63ce]"
          }`}
        />
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-600">{action.text}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {action.meta && (
          <span className="inline-flex max-w-full rounded-full bg-white px-3 py-1 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100">
            <span className="truncate">{action.meta}</span>
          </span>
        )}
        {action.badge && (
          <span className="inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#0b63ce] ring-1 ring-blue-100">
            {action.badge}
          </span>
        )}
      </div>
    </>
  );

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={className}
    >
      {content}
    </button>
  );
}

function SectionIntro({
  label,
  text,
  title,
}: {
  label: string;
  text: string;
  title: string;
}) {
  return (
    <div>
      <div className="text-sm font-black uppercase tracking-[0.18em] text-[#0b63ce]">
        {label}
      </div>
      <h2 className="mt-1 text-2xl font-black text-[#062a57]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
