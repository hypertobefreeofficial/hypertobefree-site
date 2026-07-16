import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve } from "path";

const base = process.env.FEED_BASE_URL || "http://localhost:3492";
const fixturePath = "/feed?fixture=1";
const outDir = resolve(process.cwd(), ".screenshots/feed-media-response");
mkdirSync(outDir, { recursive: true });

const FIRST_POST_SNIPPET = "God met me in a season of waiting";

async function newPage(browser, width, height = 844) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: width < 1024,
    hasTouch: width < 1024,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
    const style = document.createElement("style");
    style.textContent = `
      nextjs-portal,
      [data-nextjs-toast],
      #__next-build-watcher { display: none !important; }
    `;
    document.documentElement.appendChild(style);
  });
  return { context, page };
}

async function openFeed(page) {
  await page.goto(`${base}${fixturePath}`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page.locator("#stories").waitFor({ state: "visible", timeout: 30000 });
  await page.getByText(FIRST_POST_SNIPPET).first().waitFor({
    state: "visible",
    timeout: 30000,
  });
  await page.waitForTimeout(800);
}

async function capturePost(page, selector, filename) {
  const post = page.locator(selector);
  await post.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await post.screenshot({
    path: resolve(outDir, filename),
  });
}

const browser = await chromium.launch();

const { context: mobileContext, page: mobilePage } = await newPage(
  browser,
  430
);
await openFeed(mobilePage);

await capturePost(
  mobilePage,
  "#freedom-feed-story-fixture-landscape-photo",
  "mobile-photo-430.png"
);
await capturePost(
  mobilePage,
  "#freedom-feed-story-fixture-template-card",
  "mobile-template-430.png"
);
await capturePost(
  mobilePage,
  "#freedom-feed-story-fixture-creator-studio",
  "mobile-creator-studio-430.png"
);
await capturePost(
  mobilePage,
  "#freedom-feed-story-fixture-portrait-video",
  "mobile-video-430.png"
);

await mobileContext.close();

const { context: desktopContext, page: desktopPage } = await newPage(
  browser,
  1440,
  900
);
await openFeed(desktopPage);
await desktopPage
  .locator("#freedom-feed-story-fixture-landscape-photo")
  .scrollIntoViewIfNeeded();
await desktopPage.waitForTimeout(500);
await desktopPage.screenshot({
  path: resolve(outDir, "desktop-feed-1440.png"),
  fullPage: false,
});

await desktopContext.close();
await browser.close();

console.log(`Saved screenshots to ${outDir}`);
