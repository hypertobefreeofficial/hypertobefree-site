"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Bookmark,
  Camera,
  ChevronRight,
  Eye,
  FileText,
  HandHeart,
  Image as ImageIcon,
  LifeBuoy,
  LogOut,
  MapPin,
  Menu,
  Pencil,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  UserCog,
  UserCircle,
  Video,
  X,
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

type ContentTab = "videos" | "photos" | "posts" | "prayer" | "praise";

type OwnedStoryRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  story_type: string | null;
  story_text: string | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  status: string | null;
  prayer_status: string | null;
  answered_text: string | null;
  created_at: string | null;
  edited_at: string | null;
  removed_at: string | null;
};

type OwnedStory = OwnedStoryRow & {
  signed_image_url: string | null;
  signed_video_url: string | null;
};

const PROFILE_AVATAR_BUCKET = "profile-avatars";
const STORY_IMAGE_BUCKET = "story-images";
const STORY_VIDEO_BUCKET = "story-videos";
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfilePage() {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

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
  const [myContent, setMyContent] = useState<OwnedStory[]>([]);
  const [contentLoading, setContentLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ContentTab>("videos");
  const [viewingStory, setViewingStory] = useState<OwnedStory | null>(null);
  const [editingStory, setEditingStory] = useState<OwnedStory | null>(null);
  const [editStoryText, setEditStoryText] = useState("");
  const [savingStoryEdit, setSavingStoryEdit] = useState(false);
  const [storyPendingRemoval, setStoryPendingRemoval] =
    useState<OwnedStory | null>(null);
  const [removingStoryId, setRemovingStoryId] = useState<string | null>(null);

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
        await Promise.all([
          loadUnreadNotificationCount(user.id),
          loadMyContent(user.id),
        ]);
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

      await Promise.all([
        loadUnreadNotificationCount(user.id),
        loadMyContent(user.id),
      ]);

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

  function getStoragePath(value: string, bucket: string) {
    if (!value || value.startsWith("http")) return null;

    if (value.includes(`${bucket}/`)) {
      const afterBucket = value.split(`${bucket}/`)[1];
      return decodeURIComponent(afterBucket.split("?")[0]);
    }

    return value;
  }

  async function getMediaUrl(
    value: string | null,
    bucket: string
  ): Promise<string | null> {
    if (!value) return null;
    if (value.startsWith("http")) return value;

    const storagePath = getStoragePath(value, bucket);
    if (!storagePath) return null;

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 60 * 60);

    if (error) {
      console.error(`Could not load ${bucket} preview:`, error);
      return null;
    }

    return data.signedUrl;
  }

  async function loadMyContent(currentUserId: string) {
    setContentLoading(true);

    const { data, error } = await supabase
      .from("stories")
      .select(
        "id, user_id, name, story_type, story_text, image_url, video_url, thumbnail_url, status, prayer_status, answered_text, created_at, edited_at, removed_at"
      )
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !Array.isArray(data)) {
      setMyContent([]);
      setContentLoading(false);
      if (error) setMessage(`Could not load your content: ${error.message}`);
      return;
    }

    const rawRows: unknown[] = data;
    const rows = rawRows
      .filter(isOwnedStoryRow)
      .filter((story) => story.status !== "removed");

    const nextContent = await Promise.all(
      rows.map(async (story) => ({
        ...story,
        signed_image_url: await getMediaUrl(
          story.image_url,
          STORY_IMAGE_BUCKET
        ),
        signed_video_url: await getMediaUrl(
          story.video_url,
          STORY_VIDEO_BUCKET
        ),
      }))
    );

    setMyContent(nextContent);
    setContentLoading(false);
  }

  const profileName = useMemo(() => {
    return displayName.trim() || username.trim() || "Set up your profile";
  }, [displayName, username]);

  const visibleLocation =
    showLocation && location.trim() ? location.trim() : "";

  const accountMenuLinks = [
    {
      label: "Account & Security",
      href: "/profile/account-security",
      icon: Shield,
    },
    {
      label: "Privacy & Safety",
      href: "/profile/privacy-safety",
      icon: UserCog,
    },
    {
      label: "Notification Settings",
      href: "/profile/notifications",
      icon: Bell,
    },
    {
      label: "Content Management",
      href: "/profile/content-management",
      icon: Bookmark,
    },
    {
      label: "Support",
      href: "/profile/support",
      icon: LifeBuoy,
    },
  ];

  const tabCounts = useMemo(() => {
    return {
      videos: myContent.filter((story) => Boolean(story.video_url)).length,
      photos: myContent.filter((story) => Boolean(story.image_url)).length,
      posts: myContent.filter(isPublicTextPost).length,
      prayer: myContent.filter(isPrayerStory).length,
      praise: myContent.filter(isPraiseStory).length,
    };
  }, [myContent]);

  const filteredContent = useMemo(() => {
    if (activeTab === "videos") {
      return myContent.filter((story) => Boolean(story.video_url));
    }

    if (activeTab === "photos") {
      return myContent.filter((story) => Boolean(story.image_url));
    }

    if (activeTab === "prayer") return myContent.filter(isPrayerStory);
    if (activeTab === "praise") return myContent.filter(isPraiseStory);

    return myContent.filter(isPublicTextPost);
  }, [activeTab, myContent]);

  const uploadButtonLabel =
    activeTab === "videos"
      ? "Upload New Video"
      : activeTab === "photos"
        ? "Upload New Photo"
        : activeTab === "prayer"
          ? "Share Prayer Request"
          : activeTab === "praise"
            ? "Share Praise Report"
            : "Write New Post";

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  }

  function startEditingStory(story: OwnedStory) {
    setEditingStory(story);
    setEditStoryText(story.story_text ?? "");
    setMessage("");
  }

  async function saveStoryEdit() {
    if (!userId || !editingStory) return;

    const cleanText = editStoryText.trim();

    if (!cleanText) {
      setMessage("Please enter text before saving.");
      return;
    }

    setSavingStoryEdit(true);
    setMessage("");

    const { error } = await supabase.rpc("edit_my_story", {
      story_id: editingStory.id,
      new_story_text: cleanText,
    });

    setSavingStoryEdit(false);

    if (error) {
      setMessage(`Could not save edit: ${error.message}`);
      return;
    }

    const editedAt = new Date().toISOString();
    setMyContent((current) =>
      current.map((story) =>
        story.id === editingStory.id
          ? { ...story, story_text: cleanText, edited_at: editedAt }
          : story
      )
    );
    setEditingStory(null);
    setEditStoryText("");
    setMessage("Post updated.");
  }

  async function removeStory() {
    if (!userId || !storyPendingRemoval) return;

    if (storyPendingRemoval.user_id !== userId) {
      setMessage("You can only remove your own content.");
      setStoryPendingRemoval(null);
      return;
    }

    setRemovingStoryId(storyPendingRemoval.id);
    setMessage("");

    const { error } = await supabase.rpc("remove_my_story", {
      story_id: storyPendingRemoval.id,
    });

    setRemovingStoryId(null);

    if (error) {
      setMessage(`Could not remove content: ${error.message}`);
      return;
    }

    const removedId = storyPendingRemoval.id;
    setMyContent((current) =>
      current.filter((story) => story.id !== removedId)
    );
    setStoryPendingRemoval(null);
    setViewingStory((current) =>
      current?.id === removedId ? null : current
    );
    setMessage("Content removed from public view.");
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

          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              aria-label="Open notifications"
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce] ring-1 ring-blue-100 transition hover:bg-blue-100"
            >
              <Bell className="h-5 w-5" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                  {unreadNotificationCount > 99
                    ? "99+"
                    : unreadNotificationCount}
                </span>
              )}
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((current) => !current)}
                aria-label="Open Account Center menu"
                aria-expanded={accountMenuOpen}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#0b63ce] ring-1 ring-blue-100 transition hover:bg-blue-100"
              >
                {accountMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>

              {accountMenuOpen && (
                <div className="absolute right-0 top-14 z-[70] w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] bg-white p-2 shadow-2xl ring-1 ring-slate-200">
                  <div className="px-3 pb-2 pt-3 text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                    Account Center
                  </div>

                  {accountMenuLinks.map((item) => {
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-black text-slate-700 transition hover:bg-blue-50 hover:text-[#0b63ce]"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">{item.label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </Link>
                    );
                  })}

                  <button
                    type="button"
                    onClick={signOut}
                    disabled={signingOut}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" />
                    {signingOut ? "Signing Out..." : "Sign Out"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setDeleteAccountOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black text-red-700 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Account
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {accountMenuOpen && (
        <button
          type="button"
          aria-label="Close Account Center menu"
          onClick={() => setAccountMenuOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-black/10"
        />
      )}

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        <section className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200">
          <div className="bg-gradient-to-br from-[#082f63] via-[#0b63ce] to-[#69b7ff] p-6 text-white">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-black text-blue-100 ring-1 ring-white/15">
              <Sparkles className="h-4 w-4" />
              My Profile
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionIntro
              label="My Content"
              title="Your HTBF uploads"
              text="View and manage the stories, media, prayers, and praise you have shared."
            />

            <Link
              href="/share-your-story"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white hover:bg-[#084f9f]"
            >
              <Plus className="h-4 w-4" />
              {uploadButtonLabel}
            </Link>
          </div>

          <div className="mt-5 flex max-w-full gap-2 overflow-x-auto pb-1">
            <ContentTabButton
              active={activeTab === "videos"}
              count={tabCounts.videos}
              icon={<Video className="h-4 w-4" />}
              label="Videos"
              onClick={() => setActiveTab("videos")}
            />
            <ContentTabButton
              active={activeTab === "photos"}
              count={tabCounts.photos}
              icon={<ImageIcon className="h-4 w-4" />}
              label="Photos"
              onClick={() => setActiveTab("photos")}
            />
            <ContentTabButton
              active={activeTab === "posts"}
              count={tabCounts.posts}
              icon={<FileText className="h-4 w-4" />}
              label="Posts"
              onClick={() => setActiveTab("posts")}
            />
            <ContentTabButton
              active={activeTab === "prayer"}
              count={tabCounts.prayer}
              icon={<HandHeart className="h-4 w-4" />}
              label="Prayer"
              onClick={() => setActiveTab("prayer")}
            />
            <ContentTabButton
              active={activeTab === "praise"}
              count={tabCounts.praise}
              icon={<Sparkles className="h-4 w-4" />}
              label="Praise"
              onClick={() => setActiveTab("praise")}
            />
          </div>

          {contentLoading ? (
            <div className="mt-5 rounded-[1.5rem] bg-slate-50 p-5 text-sm font-semibold text-slate-600 ring-1 ring-slate-100">
              Loading your content...
            </div>
          ) : filteredContent.length === 0 ? (
            <div className="mt-5 rounded-[1.5rem] bg-slate-50 p-6 text-center ring-1 ring-slate-100">
              <div className="font-black text-[#062a57]">
                Nothing in this section yet
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use {uploadButtonLabel} to share something with HTBF.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {filteredContent.map((story) => (
                <OwnedContentCard
                  key={story.id}
                  story={story}
                  removing={removingStoryId === story.id}
                  onView={() => setViewingStory(story)}
                  onEdit={() => startEditingStory(story)}
                  onRemove={() => setStoryPendingRemoval(story)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <LoggedInBottomNav />

      {viewingStory && (
        <StoryPreviewModal
          story={viewingStory}
          onClose={() => setViewingStory(null)}
          onEdit={() => {
            const story = viewingStory;
            setViewingStory(null);
            startEditingStory(story);
          }}
        />
      )}

      {editingStory && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
                  Edit Caption / Text
                </div>
                <h2 className="mt-1 text-2xl font-black text-[#062a57]">
                  Update your post
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingStory(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label="Close editor"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              value={editStoryText}
              onChange={(event) => setEditStoryText(event.target.value)}
              className="mt-5 min-h-40 w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 leading-7 outline-none focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
              placeholder="Update your caption or story text..."
            />

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={saveStoryEdit}
                disabled={savingStoryEdit}
                className="flex-1 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {savingStoryEdit ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditingStory(null)}
                className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {storyPendingRemoval && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-red-700">
              HYPER TO BE FREE
            </div>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Remove this content?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              It will no longer appear in public feeds, search, or video areas.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setStoryPendingRemoval(null)}
                disabled={Boolean(removingStoryId)}
                className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700"
              >
                Not Yet
              </button>
              <button
                type="button"
                onClick={removeStory}
                disabled={Boolean(removingStoryId)}
                className="flex-1 rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {removingStoryId ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteAccountOpen && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-red-700">
              HYPER TO BE FREE
            </div>
            <h2 className="mt-2 text-2xl font-black text-[#062a57]">
              Delete account?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Account deletion is permanent. Contact HTBF support so your
              uploads, messages, and prayer activity can be handled safely.
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

function ContentTabButton({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-black ring-1 transition ${
        active
          ? "bg-[#0b63ce] text-white ring-[#0b63ce]"
          : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-blue-50"
      }`}
    >
      {icon}
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] ${
          active ? "bg-white/15 text-white" : "bg-white text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function OwnedContentCard({
  onEdit,
  onRemove,
  onView,
  removing,
  story,
}: {
  onEdit: () => void;
  onRemove: () => void;
  onView: () => void;
  removing: boolean;
  story: OwnedStory;
}) {
  const preview =
    story.story_text?.trim() ||
    story.answered_text?.trim() ||
    story.story_type ||
    "No caption added yet.";

  return (
    <article className="overflow-hidden rounded-[1.5rem] bg-slate-50 ring-1 ring-slate-200">
      {story.signed_image_url ? (
        <div className="aspect-[4/3] overflow-hidden bg-slate-100">
          <img
            src={story.signed_image_url}
            alt={story.story_type || "HTBF photo"}
            className="h-full w-full object-cover"
          />
        </div>
      ) : story.signed_video_url ? (
        <div className="aspect-video overflow-hidden bg-black">
          <video
            src={story.signed_video_url}
            poster={story.thumbnail_url || undefined}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className="flex min-h-36 items-center justify-center bg-gradient-to-br from-blue-50 to-white p-5 text-[#0b63ce]">
          {isPrayerStory(story) ? (
            <HandHeart className="h-10 w-10" />
          ) : isPraiseStory(story) ? (
            <Sparkles className="h-10 w-10" />
          ) : (
            <FileText className="h-10 w-10" />
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StoryStatusBadge status={story.status} />
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#0b63ce] ring-1 ring-blue-100">
            {story.story_type || "Story"}
          </span>
        </div>

        <p className="mt-3 line-clamp-4 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-700">
          {preview}
        </p>
        <div className="mt-3 text-xs font-semibold text-slate-500">
          Shared {formatProfileDate(story.created_at)}
          {story.edited_at ? ` · Edited ${formatProfileDate(story.edited_at)}` : ""}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onView}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#0b63ce] ring-1 ring-blue-100"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 ring-1 ring-red-100 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {removing ? "Removing" : "Delete"}
          </button>
        </div>
      </div>
    </article>
  );
}

function StoryPreviewModal({
  onClose,
  onEdit,
  story,
}: {
  onClose: () => void;
  onEdit: () => void;
  story: OwnedStory;
}) {
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/70 p-4">
      <div className="mx-auto my-6 w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#0b63ce]">
              Private Preview
            </div>
            <div className="mt-1 font-black text-[#062a57]">
              {story.story_type || "HTBF Story"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {story.signed_image_url && (
          <img
            src={story.signed_image_url}
            alt={story.story_type || "HTBF photo"}
            className="max-h-[65vh] w-full object-contain bg-black"
          />
        )}
        {story.signed_video_url && (
          <video
            src={story.signed_video_url}
            poster={story.thumbnail_url || undefined}
            controls
            playsInline
            className="max-h-[65vh] w-full bg-black object-contain"
          />
        )}

        <div className="p-5">
          <StoryStatusBadge status={story.status} />
          <p className="mt-4 whitespace-pre-wrap break-words leading-7 text-slate-700">
            {story.story_text ||
              story.answered_text ||
              "No caption or story text added yet."}
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#0b63ce] px-5 py-3 text-sm font-black text-white"
          >
            <Pencil className="h-4 w-4" />
            Edit Caption / Text
          </button>
        </div>
      </div>
    </div>
  );
}

function StoryStatusBadge({ status }: { status: string | null }) {
  const normalized = status || "pending";
  const styles =
    normalized === "approved"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : normalized === "removed"
        ? "bg-red-50 text-red-700 ring-red-100"
        : "bg-amber-50 text-amber-700 ring-amber-100";
  const label = normalized === "submitted" ? "Pending" : normalized;

  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-black capitalize ring-1 ${styles}`}
    >
      {label}
    </span>
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

function isPrayerStory(story: OwnedStory) {
  return (story.story_type ?? "").toLowerCase().includes("prayer");
}

function isOwnedStoryRow(value: unknown): value is OwnedStoryRow {
  if (typeof value !== "object" || value === null) return false;

  return (
    "id" in value &&
    typeof value.id === "string" &&
    "user_id" in value &&
    (typeof value.user_id === "string" || value.user_id === null) &&
    "name" in value &&
    (typeof value.name === "string" || value.name === null) &&
    "story_type" in value &&
    (typeof value.story_type === "string" || value.story_type === null) &&
    "story_text" in value &&
    (typeof value.story_text === "string" || value.story_text === null) &&
    "image_url" in value &&
    (typeof value.image_url === "string" || value.image_url === null) &&
    "video_url" in value &&
    (typeof value.video_url === "string" || value.video_url === null) &&
    "thumbnail_url" in value &&
    (typeof value.thumbnail_url === "string" || value.thumbnail_url === null) &&
    "status" in value &&
    (typeof value.status === "string" || value.status === null) &&
    "prayer_status" in value &&
    (typeof value.prayer_status === "string" || value.prayer_status === null) &&
    "answered_text" in value &&
    (typeof value.answered_text === "string" || value.answered_text === null) &&
    "created_at" in value &&
    (typeof value.created_at === "string" || value.created_at === null) &&
    "edited_at" in value &&
    (typeof value.edited_at === "string" || value.edited_at === null) &&
    "removed_at" in value &&
    (typeof value.removed_at === "string" || value.removed_at === null)
  );
}

function isPraiseStory(story: OwnedStory) {
  const storyType = (story.story_type ?? "").toLowerCase();

  return (
    storyType.includes("praise") ||
    storyType.includes("answered") ||
    story.prayer_status === "answered" ||
    Boolean(story.answered_text)
  );
}

function isPublicTextPost(story: OwnedStory) {
  return (
    !story.video_url &&
    !story.image_url &&
    !isPrayerStory(story) &&
    !isPraiseStory(story)
  );
}

function formatProfileDate(value: string | null) {
  if (!value) return "recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
