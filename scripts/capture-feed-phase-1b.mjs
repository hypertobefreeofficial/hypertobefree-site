import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const base = process.env.FEED_BASE_URL || "http://localhost:3492";
const outDir = resolve(process.cwd(), ".screenshots/feed-phase-1b");
mkdirSync(outDir, { recursive: true });

async function newPage(browser, width, height = 900) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: width < 1024,
    hasTouch: width < 1024,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
  });
  return { context, page };
}

async function waitForFeed(page, path = "/feed?fixture=1") {
  await page.goto(`${base}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2200);
  const feedSection = page.locator("#stories");
  await feedSection.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
}

const browser = await chromium.launch();

const mobileWidths = [390, 430];
for (const width of mobileWidths) {
  const { context, page } = await newPage(browser, width, 844);
  await waitForFeed(page, "/feed");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-top-${width}.png`),
    fullPage: false,
  });

  await waitForFeed(page, "/feed?fixture=1");
  await page.evaluate(() => window.scrollBy(0, 420));
  await page.waitForTimeout(600);
  await page.screenshot({
    path: resolve(outDir, `mobile-mid-${width}.png`),
    fullPage: false,
  });
  await context.close();
}

for (const width of [768, 1024, 1440]) {
  const height = width >= 1024 ? 1000 : 900;
  const { context, page } = await newPage(browser, width, height);
  await waitForFeed(page, "/feed");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `layout-${width}.png`),
    fullPage: false,
  });

  if (width >= 1024) {
    await waitForFeed(page, "/feed?fixture=1");
    await page.evaluate(() => window.scrollBy(0, 520));
    await page.waitForTimeout(600);
    await page.screenshot({
      path: resolve(outDir, `desktop-mid-${width}.png`),
      fullPage: false,
    });
  }
  await context.close();
}

await browser.close();
console.log(`Screenshots saved to ${outDir}`);
