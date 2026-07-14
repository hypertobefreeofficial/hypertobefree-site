import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const baseUrl =
  process.env.PRAYER_SCREENSHOT_URL || "http://127.0.0.1:3489/prayer";
const outDir = resolve(process.cwd(), ".screenshots/prayer-final-audit");
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

async function newPage(browser, viewport, prefs = returningPrefs, extras) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.addInitScript(
    ({ prefs, extras }) => {
      window.localStorage.setItem(
        "htbf-prayer-search-v1",
        JSON.stringify(prefs)
      );
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
      if (extras?.layout) {
        window.localStorage.setItem(
          "htbf-prayer-results-layout",
          extras.layout
        );
      }
    },
    { prefs, extras }
  );
  return { context, page };
}

async function shot(page, name) {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: false });
  console.log(`captured ${name}`);
}

const browser = await chromium.launch();

// 1. Desktop populated Grid view at 1440px
{
  const { context, page } = await newPage(
    browser,
    { width: 1440, height: 900 },
    returningPrefs,
    { layout: "grid" }
  );
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await shot(page, "01-desktop-grid-1440");
  await context.close();
}

// 2. Desktop populated List view
{
  const { context, page } = await newPage(
    browser,
    { width: 1440, height: 900 },
    returningPrefs,
    { layout: "list" }
  );
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await shot(page, "02-desktop-list");
  await context.close();
}

// 3. Desktop Map view
{
  const { context, page } = await newPage(browser, { width: 1440, height: 900 }, {
    ...returningPrefs,
    mobileView: "map",
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Return to Requests", { timeout: 20000 }).catch(() => {});
  await shot(page, "03-desktop-map");
  await context.close();
}

// 4. Mobile populated Prayer page (390px)
{
  const { context, page } = await newPage(browser, { width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Healing after surgery", { timeout: 20000 });
  await shot(page, "04-mobile-populated");
  await context.close();
}

// 5. Returning-user compact hero with slogan visible
{
  const { context, page } = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("text=Pray without", { timeout: 20000 });
  await shot(page, "05-returning-compact-hero-slogan");
  await context.close();
}

// 6. Updated Respond with Prayer modal
{
  const { context, page } = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(`${baseUrl}?story=${VIDEO_STORY}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("text=Respond with Prayer", { timeout: 20000 });
  await page.getByRole("button", { name: "Respond with Prayer" }).click();
  await page.waitForTimeout(600);
  await shot(page, "06-respond-with-prayer-modal");
  await context.close();
}

// 7. Prayer detail actions
{
  const { context, page } = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(`${baseUrl}?story=${VIDEO_STORY}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("text=I Prayed", { timeout: 20000 });
  await shot(page, "07-detail-actions");
  await context.close();
}

// 8. Video Prayers section
{
  const { context, page } = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(`${baseUrl}?story=${VIDEO_STORY}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("#video-prayers-title", { timeout: 20000 });
  await page.locator("#video-prayers-title").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await shot(page, "08-video-prayers-section");
  await context.close();
}

// 9. Prayer-type search using "del"
{
  const { context, page } = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Post a Prayer Request" }).click();
  await page.fill("#prayer-title", "Prayer for courage");
  await page.fill("#prayer-description", "Please pray for my family this week.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForSelector("#prayer-type-search", { timeout: 10000 });
  await page.fill("#prayer-type-search", "del");
  await page.waitForTimeout(400);
  await shot(page, "09-composer-type-search-del");
  await context.close();
}

// 10. Custom unmatched prayer type using automatic Other
{
  const { context, page } = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Post a Prayer Request" }).click();
  await page.fill("#prayer-title", "Prayer for court tomorrow");
  await page.fill("#prayer-description", "Standing in faith for a fair outcome.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForSelector("#prayer-type-search", { timeout: 10000 });
  await page.fill("#prayer-type-search", "Prayer for court tomorrow");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Use .* as Other/ }).click();
  await page.waitForSelector("#prayer-custom-type", { timeout: 10000 });
  await page.getByRole("checkbox", { name: /as my prayer type/ }).check();
  await page.waitForTimeout(400);
  await shot(page, "10-composer-custom-other");
  await context.close();
}

// 11. Content search results
{
  const { context, page } = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill("#prayer-content-search", "deliverance");
  await page.waitForSelector("text=Breakthrough from bondage", { timeout: 10000 });
  await shot(page, "11-content-search-deliverance");
  await context.close();
}

// 12. No-results state
{
  const { context, page } = await newPage(browser, { width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill("#prayer-content-search", "zzzz-no-match-query");
  await page.waitForSelector("text=No prayer requests matched", { timeout: 10000 });
  await shot(page, "12-no-results");
  await context.close();
}

await browser.close();
console.log(`Saved final-audit prayer screenshots to ${outDir}`);
