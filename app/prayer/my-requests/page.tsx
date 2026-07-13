import { redirect } from "next/navigation";

/** My Requests is a tab on the main Prayer page. */
export default function MyPrayerRequestsRedirectPage() {
  redirect("/prayer?tab=my-requests");
}
