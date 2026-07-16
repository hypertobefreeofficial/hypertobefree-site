import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const base = process.env.FEED_BASE_URL || "http://localhost:3492";
const fixturePath = "/feed?fixture=1";
const outDir = resolve(process.cwd(), ".screenshots/feed-responsive-final");
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

{
  const { context, page } = await newPage(browser, 390, 844);
  await openFeed(page);
  await page.getByText("Hannah L.").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, "mobile-prayer-390.png"),
    fullPage: false,
  });
  await context.close();
}

{
  const { context, page } = await newPage(browser, 430, 844);
  await openFeed(page);
  await page.getByRole("button", { name: "Load more" }).click();
  await page.waitForTimeout(700);
  await page.getByText("Sarah W.").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, "mobile-owner-430.png"),
    fullPage: false,
  });
  await context.close();
}

{
  const { context, page } = await newPage(browser, 430, 844);
  await openFeed(page);
  await page.getByRole("button", { name: "Load more" }).click();
  await page.waitForTimeout(700);
  await page.locator("#freedom-feed-story-fixture-answered-prayer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, "mobile-answered-430.png"),
    fullPage: false,
  });
  await context.close();
}

{
  const { context, page } = await newPage(browser, 430, 844);
  await openFeed(page);
  await page.getByRole("button", { name: "Load more" }).click();
  await page.waitForTimeout(700);
  await page.locator("#freedom-feed-response-fixture-video-response").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, "mobile-video-response-430.png"),
    fullPage: false,
  });
  await context.close();
}

{
  const { context, page } = await newPage(browser, 430, 844);
  await openFeed(page);
  const danielPost = page.locator("#freedom-feed-story-fixture-portrait-video");
  await danielPost.scrollIntoViewIfNeeded();
  await danielPost.getByRole("button", { name: /^React/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, "mobile-reaction-sheet-430.png"),
    fullPage: false,
  });
  await context.close();
}

{
  const { context, page } = await newPage(browser, 430, 844);
  await openFeed(page);
  while (await page.getByRole("button", { name: "Load more" }).isVisible()) {
    await page.getByRole("button", { name: "Load more" }).click();
    await page.waitForTimeout(600);
  }
  await page.getByText("You've reached the end of the feed.").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, "mobile-end-clearance-430.png"),
    fullPage: false,
  });
  await context.close();
}

{
  const { context, page } = await newPage(browser, 844, 390);
  await openFeed(page);
  await page.getByText("Daniel P.").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, "mobile-landscape.png"),
    fullPage: false,
  });
  await context.close();
}

for (const width of [1024, 1440]) {
  const { context, page } = await newPage(browser, width, 900);
  await openFeed(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `layout-${width}.png`),
    fullPage: false,
  });

  await page.getByText("Daniel P.").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, `desktop-mid-${width}.png`),
    fullPage: false,
  });

  await context.close();
}

const contactPaths = [
  "mobile-prayer-390.png",
  "mobile-owner-430.png",
  "mobile-answered-430.png",
  "mobile-video-response-430.png",
  "mobile-reaction-sheet-430.png",
  "mobile-end-clearance-430.png",
  "mobile-landscape.png",
  "layout-1024.png",
  "layout-1440.png",
  "desktop-mid-1024.png",
  "desktop-mid-1440.png",
];

const contactHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Feed Responsive Final Contact Sheet</title>
  <style>
    body { margin: 0; padding: 24px; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    h1 { font-size: 1.25rem; margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    figure { margin: 0; background: #1e293b; border-radius: 12px; overflow: hidden; }
    img { display: block; width: 100%; height: auto; }
    figcaption { padding: 8px 12px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Community Feed — Responsive Shell Final</h1>
  <div class="grid">
    ${contactPaths
      .map(
        (file) => `<figure><img src="./${file}" alt="${file}" /><figcaption>${file}</figcaption></figure>`
      )
      .join("\n")}
  </div>
</body>
</html>`;

writeFileSync(resolve(outDir, "contact-sheet.html"), contactHtml);

await browser.close();
console.log(`Saved responsive final screenshots to ${outDir}`);
