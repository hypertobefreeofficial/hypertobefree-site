export type CategoryItem = {
  badge?: string;
  href?: string;
  text: string;
  title: string;
  tone?: "default" | "danger";
  type?: "delete-account";
};

export type CategoryContent = {
  description: string;
  eyebrow: string;
  items: CategoryItem[];
  title: string;
};

export const accountCenterCategoryContent: Record<string, CategoryContent> = {
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
        href: "/profile/change-email",
      },
      {
        title: "Change Password",
        text: "Update your password safely.",
        href: "/profile/change-password",
      },
      {
        title: "Two-Factor Authentication",
        text: "Add an extra layer of account protection.",
        href: "/profile/two-factor-authentication",
      },
      {
        title: "Active Sessions",
        text: "Review devices signed in to your account.",
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

export function getAccountCenterCategoryItem(
  categoryKey: string,
  itemTitle: string
): CategoryItem | undefined {
  return accountCenterCategoryContent[categoryKey]?.items.find(
    (item) => item.title === itemTitle
  );
}
