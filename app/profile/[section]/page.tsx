"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Sparkles } from "lucide-react";
import LoggedInBottomNav from "../../../components/LoggedInBottomNav";

type PlaceholderContent = {
  eyebrow: string;
  title: string;
  description: string;
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
