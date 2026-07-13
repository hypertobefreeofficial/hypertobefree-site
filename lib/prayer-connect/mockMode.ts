export function isMockPrayerMode() {
  return process.env.NEXT_PUBLIC_PRAYER_USE_MOCK === "1";
}
