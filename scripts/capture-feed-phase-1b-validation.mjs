import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const base = process.env.FEED_BASE_URL || "http://localhost:3492";
const fixturePath = "/feed?fixture=1";
const outDir = resolve(process.cwd(), ".screenshots/feed-phase-1b-validation");
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

async function openFeed(page, path = fixturePath) {
  await page.goto(`${base}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.locator("#stories").waitFor({ state: "visible", timeout: 30000 });
  await page.getByText("Fixture: Text testimony").first().waitFor({
    state: "visible",
    timeout: 30000,
  });
  await page.waitForTimeout(1200);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1
  );
  if (overflow) {
    throw new Error(`Horizontal overflow detected: ${label}`);
  }
}

const browser = await chromium.launch();
const heroWidths = [320, 359, 390, 430];

for (const width of heroWidths) {
  const { context, page } = await newPage(browser, width, 700);
  await openFeed(page);
  await assertNoHorizontalOverflow(page, `hero-${width}`);
  await context.close();
}

for (const width of [390, 430]) {
  const { context, page } = await newPage(browser, width, 844);
  await openFeed(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `mobile-top-${width}.png`),
    fullPage: false,
  });

  await page.evaluate(() => window.scrollTo(0, 980));
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, `mobile-mid-${width}.png`),
    fullPage: false,
  });

  await page.getByRole("button", { name: "Load more" }).click();
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(outDir, `mobile-lower-${width}.png`),
    fullPage: false,
  });

  await context.close();
}

for (const width of [768, 1024, 1440]) {
  const height = width >= 1024 ? 1100 : 900;
  const { context, page } = await newPage(browser, width, height);
  await openFeed(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: resolve(outDir, `layout-${width}.png`),
    fullPage: false,
  });

  if (width >= 1024) {
    await page.evaluate(() => window.scrollTo(0, 760));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(outDir, `desktop-mid-${width}.png`),
      fullPage: false,
    });
  }

  await context.close();
}

// Landscape mobile orientation check
{
  const { context, page } = await newPage(browser, 844, 390);
  await openFeed(page);
  await assertNoHorizontalOverflow(page, "landscape-mobile");
  await page.screenshot({
    path: resolve(outDir, "hero-landscape-844x390.png"),
    fullPage: false,
  });
  await context.close();
}

await browser.close();

const contactFiles = [
  "mobile-top-390.png",
  "mobile-mid-390.png",
  "mobile-lower-390.png",
  "layout-768.png",
  "layout-1024.png",
  "desktop-mid-1440.png",
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
  <h1>Phase 1B Validation Contact Sheet</h1>
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
  viewport: { width: 1600, height: 2200 },
  deviceScaleFactor: 1,
});
const sheetPage = await sheetContext.newPage();
await sheetPage.goto(`file://${resolve(outDir, "contact-sheet.html")}`);
await sheetPage.waitForTimeout(500);
await sheetPage.screenshot({
  path: resolve(outDir, "contact-sheet.png"),
  fullPage: true,
});
await sheetContext.close();
await sheetBrowser.close();

console.log(`Screenshots saved to ${outDir}`);
console.log(`Contact sheet: ${resolve(outDir, "contact-sheet.png")}`);
