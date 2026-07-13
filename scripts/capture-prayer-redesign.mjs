import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const baseUrl = process.env.PRAYER_SCREENSHOT_URL || "http://127.0.0.1:3456/prayer";
const outDir = resolve(process.cwd(), ".screenshots");

const viewports = [
  { name: "prayer-premium-1440x900", width: 1440, height: 900 },
  { name: "prayer-premium-1280x800", width: 1280, height: 800 },
  { name: "prayer-premium-1024x768", width: 1024, height: 768 },
  { name: "prayer-premium-430x932", width: 430, height: 932 },
  { name: "prayer-premium-390x844", width: 390, height: 844 },
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext();

for (const viewport of viewports) {
  const page = await context.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: resolve(outDir, `${viewport.name}.png`),
    fullPage: false,
  });
  await page.close();
}

const returningPage = await context.newPage();
await returningPage.addInitScript(() => {
  window.localStorage.setItem(
    "htbf-prayer-search-v1",
    JSON.stringify({
      version: 1,
      configured: true,
      searchMode: "place",
      center: { lat: 33.4484, lng: -112.074, label: "Phoenix, Arizona" },
      radius: 25,
      category: "all",
      sort: "needs-prayer",
      mediaFilter: "all",
      mobileView: "requests",
      placeQuery: "Phoenix, Arizona",
    })
  );
});
await returningPage.setViewportSize({ width: 1440, height: 900 });
await returningPage.goto(baseUrl, { waitUntil: "networkidle", timeout: 60000 });
await returningPage.waitForTimeout(1200);
await returningPage.screenshot({
  path: resolve(outDir, "prayer-premium-1440x900-returning.png"),
  fullPage: false,
});
await returningPage.close();

await browser.close();
console.log("Saved prayer redesign screenshots to .screenshots/");
