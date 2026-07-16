import {
  HandHeart,
  Home,
  Search,
  Sparkles,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";

export type LoggedInNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const loggedInNavItems: LoggedInNavItem[] = [
  { href: "/feed", label: "Feed", icon: Home },
  { href: "/video-feed", label: "Videos", icon: Video },
  { href: "/prayer", label: "Prayer", icon: HandHeart },
  { href: "/journey", label: "Journey", icon: Sparkles },
  { href: "/search", label: "Search", icon: Search },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function isLoggedInNavItemActive(
  pathname: string | null,
  href: string
) {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}
