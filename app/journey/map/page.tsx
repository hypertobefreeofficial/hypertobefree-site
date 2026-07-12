import { redirect } from "next/navigation";

/** Prayer discovery map entry now lives inside /prayer. */
export default function JourneyMapPage() {
  redirect("/prayer");
}
