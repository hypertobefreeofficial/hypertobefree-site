import { redirect } from "next/navigation";

export default function AnsweredPrayersPage() {
  redirect("/prayer?tab=answered");
}
