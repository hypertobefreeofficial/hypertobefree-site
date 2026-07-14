import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const baseUrl =
  process.env.PRAYER_SCREENSHOT_URL || "http://127.0.0.1:3478/prayer";
const outDir = resolve(process.cwd(), ".screenshots");
mkdirSync(outDir, { recursive: true });

const returningPrefs = (mobileView) => ({
  version: 1,
  configured: true,
  searchMode: "place",
  center: { lat: 33.4484, lng: -112.074, label: "Phoenix, Arizona" },
  radius: 25,
  category: "all",
  sort: "needs-prayer",
  mediaFilter: "all",
  mobileView,
  placeQuery: "Phoenix, Arizona",
});

const shots = [
  // First visit — geographic onboarding, map prominent, restored bottom nav
  { name: "correction-first-visit-1440", width: 1440, height: 900, prefs: null },
  { name: "correction-first-visit-390", width: 390, height: 844, prefs: null },

  // Returning — full-width requests grid, no reserved map, bottom nav
  {
    name: "correction-returning-requests-1440",
    width: 1440,
    height: 900,
    prefs: returningPrefs("requests"),
  },
  {
    name: "correction-returning-requests-1280",
    width: 1280,
    height: 800,
    prefs: returningPrefs("requests"),
  },
  {
    name: "correction-returning-requests-1024",
    width: 1024,
    height: 768,
    prefs: returningPrefs("requests"),
  },
  {
    name: "correction-returning-requests-430",
    width: 430,
    height: 932,
    prefs: returningPrefs("requests"),
  },

  // Returning — View Map: desktop 62/38 split, mobile full-screen map
  {
    name: "correction-returning-map-1440",
    width: 1440,
    height: 900,
    prefs: returningPrefs("map"),
  },
  {
    name: "correction-returning-map-430",
    width: 430,
    height: 932,
    prefs: returningPrefs("map"),
  },
];

const browser = await chromium.launch();

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
  });
  if (shot.prefs) {
    const value = JSON.stringify(shot.prefs);
    await context.addInitScript((v) => {
      window.localStorage.setItem("htbf-prayer-search-v1", v);
    }, value);
  }
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2600);
  await page.screenshot({
    path: resolve(outDir, `${shot.name}.png`),
    fullPage: false,
  });
  await context.close();
  console.log(`captured ${shot.name}`);
}

await browser.close();
console.log("Saved prayer correction screenshots to .screenshots/");
