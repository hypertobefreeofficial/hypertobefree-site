import { redirect } from "next/navigation";

/** Prayer Connect is now the main /prayer experience. */
export default function PrayerConnectRedirectPage() {
  redirect("/prayer");
}
