import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const baseUrl =
  process.env.PRAYER_SCREENSHOT_URL || "http://127.0.0.1:3490/prayer";
const outDir = resolve(process.cwd(), ".screenshots/prayer-mobile-refinement");
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

const VIDEO_STORY = "mock-prayer-video-1";
const PHONE = { width: 390, height: 844 };

async function newPage(browser, viewport, prefs = returningPrefs, extras) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: viewport.width < 1024,
    hasTouch: viewport.width < 1024,
  });
  const page = await context.newPage();
  await page.addInitScript(
    ({ prefs, extras }) => {
      window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
      if (extras?.layout) {
        window.localStorage.setItem("htbf-prayer-results-layout", extras.layout);
      }
    },
    { prefs, extras }
  );
  return { context, page };
}

async function shot(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: false });
  console.log(`captured ${name}`);
}

async function load(page, url = baseUrl) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
}

const browser = await chromium.launch();

// 1. Mobile populated prayer grid (2-column)
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page);
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await shot(page, "01-mobile-grid");
  await context.close();
}

// 2. Hamburger menu open
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page);
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await page.getByRole("button", { name: "Open Prayer menu" }).click();
  await page.waitForTimeout(400);
  await shot(page, "02-hamburger-menu");
  await context.close();
}

// 3. Three-dot overflow menu open
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page);
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await page.getByRole("button", { name: "More prayer options" }).click();
  await page.waitForTimeout(400);
  await shot(page, "03-overflow-menu");
  await context.close();
}

// 4. Mobile search active
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page);
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await page.getByRole("button", { name: "Search prayers" }).click();
  await page.waitForSelector("#prayer-content-search", { timeout: 10000 });
  await page.fill("#prayer-content-search", "deliverance");
  await page.waitForTimeout(600);
  await shot(page, "04-search-active");
  await context.close();
}

// 5. Filter sheet
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page);
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await page.getByRole("button", { name: "More prayer options" }).click();
  await page.getByRole("button", { name: "Filter" }).click();
  await page.waitForSelector("text=Prayer type", { timeout: 10000 });
  await shot(page, "05-filter-sheet");
  await context.close();
}

// 6. Selected-prayer detail (collapsed / top)
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page, `${baseUrl}?story=${VIDEO_STORY}`);
  await page.waitForSelector("text=I Prayed", { timeout: 20000 });
  await shot(page, "06-selected-prayer-top");
  await context.close();
}

// 7. Expanded selected-prayer details (scrolled)
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page, `${baseUrl}?story=${VIDEO_STORY}`);
  await page.waitForSelector("#video-prayers-title", { timeout: 20000 });
  await page.evaluate(() => {
    document
      .querySelector("#video-prayers-title")
      ?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(600);
  await shot(page, "07-selected-prayer-expanded");
  await context.close();
}

// 8. Respond with Prayer modal
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page, `${baseUrl}?story=${VIDEO_STORY}`);
  await page.waitForSelector("text=Respond with Prayer", { timeout: 20000 });
  await page.getByRole("button", { name: "Respond with Prayer" }).click();
  await page.waitForTimeout(600);
  await shot(page, "08-respond-modal");
  await context.close();
}

// 9. Video Prayers section
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page, `${baseUrl}?story=${VIDEO_STORY}`);
  await page.waitForSelector("#video-prayers-title", { timeout: 20000 });
  await page.evaluate(() => {
    document
      .querySelector("#video-prayers-title")
      ?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(700);
  await shot(page, "09-video-prayers");
  await context.close();
}

// 10. Full-screen Prayer Map
{
  const { context, page } = await newPage(browser, PHONE, {
    ...returningPrefs,
    mobileView: "map",
  });
  await load(page);
  await page.waitForTimeout(1500);
  await shot(page, "10-mobile-map");
  await context.close();
}

// 11. Mobile Prayer composer
{
  const { context, page } = await newPage(browser, PHONE);
  await load(page);
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await page.getByRole("button", { name: "Post a prayer request" }).click();
  await page.waitForSelector("#prayer-title", { timeout: 10000 });
  await page.waitForTimeout(500);
  await shot(page, "11-mobile-composer");
  await context.close();
}

// 12. Desktop Prayer grid regression check (1440)
{
  const { context, page } = await newPage(
    browser,
    { width: 1440, height: 900 },
    returningPrefs,
    { layout: "grid" }
  );
  await load(page);
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await shot(page, "12-desktop-grid-regression");
  await context.close();
}

// 13. Responsive breakpoint sweep of the grid
const breakpoints = [320, 375, 390, 430, 768, 1024, 1280, 1440];
for (const width of breakpoints) {
  const { context, page } = await newPage(browser, { width, height: 900 });
  await load(page);
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await shot(page, `bp-${width}`);
  await context.close();
}

await browser.close();
console.log(`Saved mobile prayer screenshots to ${outDir}`);
