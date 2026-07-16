import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const base = process.env.FEED_BASE_URL || "http://localhost:3492";
const fixturePath = "/feed?fixture=1";
const outDir = resolve(process.cwd(), ".screenshots/feed-phase-2-verified");
mkdirSync(outDir, { recursive: true });

const FIRST_POST_SNIPPET = "God met me in a season of waiting";

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

const browser = await chromium.launch();

for (const width of [390, 430]) {
  const { context, page } = await newPage(browser, width, 844);
  await openFeed(page);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-top-${width}.png`),
    fullPage: false,
  });

  const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
  await danielPost.scrollIntoViewIfNeeded();
  await danielPost.getByRole("button", { name: /^React/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-reaction-selector-${width}.png`),
    fullPage: false,
  });
  await page.keyboard.press("Escape");

  await page.locator("#freedom-feed-story-fixture-text-testimony").scrollIntoViewIfNeeded();
  await page
    .locator("#freedom-feed-story-fixture-text-testimony")
    .getByRole("button", { name: "Post options" })
    .click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-overflow-${width}.png`),
    fullPage: false,
  });
  await page.keyboard.press("Escape");

  await page.locator("#freedom-feed-story-fixture-praise-portrait-video").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-praise-portrait-${width}.png`),
    fullPage: false,
  });

  await page.locator("#freedom-feed-story-fixture-prayer-request").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-prayer-${width}.png`),
    fullPage: false,
  });

  await page.getByRole("button", { name: "Load more" }).click();
  await page.waitForTimeout(800);

  await page.locator("#freedom-feed-story-fixture-prayer-owner").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-owner-${width}.png`),
    fullPage: false,
  });

  await page.locator("#freedom-feed-story-fixture-answered-prayer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-answered-${width}.png`),
    fullPage: false,
  });

  await page.locator("#freedom-feed-response-fixture-video-response").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-video-response-${width}.png`),
    fullPage: false,
  });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, `mobile-end-${width}.png`),
    fullPage: false,
  });

  await context.close();
}

for (const width of [768, 1024, 1440]) {
  const height = width >= 1024 ? 1200 : 900;
  const { context, page } = await newPage(browser, width, height);
  await openFeed(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `layout-${width}.png`),
    fullPage: false,
  });
  await context.close();
}

await browser.close();

const contactFiles = [
  "mobile-top-390.png",
  "mobile-reaction-selector-390.png",
  "mobile-overflow-390.png",
  "mobile-praise-portrait-390.png",
  "mobile-prayer-390.png",
  "mobile-owner-390.png",
  "mobile-answered-390.png",
  "mobile-video-response-390.png",
  "mobile-end-390.png",
  "layout-768.png",
  "layout-1024.png",
  "layout-1440.png",
];

const contactHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; background: #0f172a; color: #fff; font-family: system-ui, sans-serif; }
    h1 { padding: 16px 20px 8px; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 12px 16px 24px; }
    figure { margin: 0; background: #111827; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
    img { display: block; width: 100%; height: auto; }
    figcaption { padding: 8px 10px 10px; font-size: 12px; color: #cbd5e1; }
  </style>
</head>
<body>
  <h1>Phase 2 Verified Contact Sheet</h1>
  <div class="grid">
    ${contactFiles
      .map(
        (file) => `<figure><img src="${file}" alt="${file}" /><figcaption>${file}</figcaption></figure>`
      )
      .join("")}
  </div>
</body>
</html>`;

writeFileSync(resolve(outDir, "contact-sheet.html"), contactHtml);

const sheetBrowser = await chromium.launch();
const sheetContext = await sheetBrowser.newContext({
  viewport: { width: 1600, height: 3200 },
  deviceScaleFactor: 1,
});
const sheetPage = await sheetContext.newPage();
await sheetPage.goto(`file://${resolve(outDir, "contact-sheet.html")}`);
await sheetPage.waitForTimeout(500);
await sheetPage.screenshot({
  path: resolve(outDir, "contact-sheet-phase-2-verified.png"),
  fullPage: true,
});
await sheetContext.close();
await sheetBrowser.close();

console.log(`Verified screenshots saved to ${outDir}`);
