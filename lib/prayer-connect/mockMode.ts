export function isMockPrayerMode() {
  if (process.env.NEXT_PUBLIC_PRAYER_USE_MOCK === "1") return true;
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("htbf-prayer-force-mock") === "1";
  }
  return false;
}
