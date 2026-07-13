import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const baseUrl =
  process.env.PRAYER_SCREENSHOT_URL || "http://127.0.0.1:3478/prayer";
const outDir = resolve(process.cwd(), ".screenshots/prayer-populated");
mkdirSync(outDir, { recursive: true });

const returningPrefs = {
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
};

async function capture(page, name) {
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: resolve(outDir, `${name}.png`),
    fullPage: false,
  });
  console.log(`captured ${name}`);
}

const browser = await chromium.launch();

// 1. Desktop populated Grid view
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
    window.localStorage.setItem("htbf-prayer-results-layout", "grid");
  }, returningPrefs);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await capture(page, "01-desktop-grid");
  await context.close();
}

// 2. Desktop populated List view
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
    window.localStorage.setItem("htbf-prayer-results-layout", "list");
  }, returningPrefs);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await capture(page, "02-desktop-list");
  await context.close();
}

// 3. Desktop Map view
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem(
      "htbf-prayer-search-v1",
      JSON.stringify({ ...prefs, mobileView: "map" })
    );
  }, returningPrefs);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Prayer map", { timeout: 20000 });
  await capture(page, "03-desktop-map");
  await context.close();
}

// 4. Mobile populated Prayer page
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
    window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
  }, returningPrefs);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await capture(page, "04-mobile-populated");
  await context.close();
}

// 5. Prayer detail with response buttons
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
  }, returningPrefs);
  await page.goto(`${baseUrl}?story=mock-prayer-video-1`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("text=I Prayed", { timeout: 20000 });
  await capture(page, "05-detail-response-buttons");
  await context.close();
}

// 6. Detail showing Video Prayers section
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
  }, returningPrefs);
  await page.goto(`${baseUrl}?story=mock-prayer-video-1`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("text=Prayers from the Community", { timeout: 20000 });
  await page.waitForSelector("text=Sarah M.", { timeout: 20000 });
  await page.getByText("Sarah M.").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await capture(page, "06-detail-video-prayers");
  await context.close();
}

// 7. Posting flow searchable prayer-type list
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
  }, returningPrefs);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Post a Prayer Request" }).click();
  await page.fill("#prayer-title", "Prayer for courage");
  await page.fill("#prayer-description", "Please pray for my family this week.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForSelector("#prayer-type-search", { timeout: 10000 });
  await page.fill("#prayer-type-search", "del");
  await capture(page, "07-composer-searchable-types");
  await context.close();
}

// 8. Other selected with custom type
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
  }, returningPrefs);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Post a Prayer Request" }).click();
  await page.fill("#prayer-title", "Prayer for courage");
  await page.fill("#prayer-description", "Please pray for my family this week.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Other" }).click();
  await page.fill("#prayer-custom-type", "Prayer for deliverance");
  await capture(page, "08-composer-other-custom-type");
  await context.close();
}

// 9. Content search results for deliverance
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
  }, returningPrefs);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill("#prayer-content-search", "deliverance");
  await page.waitForSelector("text=Breakthrough from bondage", { timeout: 10000 });
  await capture(page, "09-content-search-deliverance");
  await context.close();
}

// 10. No-results state after valid search
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript((prefs) => {
    window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
  }, returningPrefs);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill("#prayer-content-search", "zzzz-no-match-query");
  await page.waitForSelector("text=No prayer requests matched", { timeout: 10000 });
  await capture(page, "10-content-search-no-results");
  await context.close();
}

await browser.close();
console.log(`Saved populated prayer screenshots to ${outDir}`);
