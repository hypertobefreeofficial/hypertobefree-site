import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3492";
const outDir = resolve(".screenshots/app-shell-desktop-fix");

const shots = [
  { name: "feed-1024.png", path: "/feed?fixture=1", width: 1024, height: 900 },
  { name: "feed-1440.png", path: "/feed?fixture=1", width: 1440, height: 900 },
  {
    name: "prayer-1024.png",
    path: "/prayer",
    width: 1024,
    height: 900,
    mockPrayer: true,
  },
  {
    name: "prayer-1440.png",
    path: "/prayer",
    width: 1440,
    height: 900,
    mockPrayer: true,
  },
  { name: "profile-1024.png", path: "/profile", width: 1024, height: 900 },
  { name: "profile-1440.png", path: "/profile", width: 1440, height: 900 },
  { name: "search-1024.png", path: "/search", width: 1024, height: 900 },
  { name: "journey-1024.png", path: "/journey", width: 1024, height: 900 },
  {
    name: "mobile-feed-430.png",
    path: "/feed?fixture=1",
    width: 430,
    height: 844,
    mobile: true,
  },
  {
    name: "mobile-prayer-430.png",
    path: "/prayer",
    width: 430,
    height: 844,
    mobile: true,
    mockPrayer: true,
  },
];

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();

  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      isMobile: Boolean(shot.mobile),
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
    });

    if (shot.mockPrayer) {
      await page.addInitScript(() => {
        window.localStorage.setItem("htbf-prayer-force-mock", "1");
        window.localStorage.setItem(
          "htbf-prayer-search-v1",
          JSON.stringify({
            version: 1,
            configured: true,
            searchMode: "place",
            center: { lat: 33.4484, lng: -112.074, label: "Phoenix, Arizona" },
            radius: 120,
            category: "all",
            sort: "needs-prayer",
            mediaFilter: "all",
            mobileView: "requests",
            placeQuery: "Phoenix, Arizona",
          })
        );
      });
    }

    await page.goto(`${BASE}${shot.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(shot.mockPrayer ? 2500 : 1500);

    await page.screenshot({
      path: resolve(outDir, shot.name),
      fullPage: shot.mobile ?? false,
    });
    await context.close();
    console.log("Captured", shot.name);
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>App Shell Desktop Fix</title>
<style>
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
figure{margin:0;background:#1e293b;border-radius:12px;overflow:hidden}
img{width:100%;display:block;background:#fff}
figcaption{padding:10px 12px;font-size:13px}
</style></head><body>
<h1>HTBF Desktop App Shell Fix</h1>
<div class="grid">
${shots.map((s) => `<figure><img src="./${s.name}" alt="${s.name}"/><figcaption>${s.name}</figcaption></figure>`).join("\n")}
</div></body></html>`;

  writeFileSync(resolve(outDir, "contact-sheet.html"), html);

  const contactPage = await browser.newPage({ viewport: { width: 1800, height: 2400 } });
  await contactPage.goto(`file://${resolve(outDir, "contact-sheet.html")}`);
  await contactPage.waitForTimeout(500);
  await contactPage.screenshot({
    path: resolve(outDir, "contact-sheet-app-shell.png"),
    fullPage: true,
  });

  await browser.close();
  console.log("Contact sheet saved");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
