import { chromium, type FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";
import { AUTH_MARKER, getPrayerAuthEnv } from "./env";

const authDir = path.join(".playwright", "auth");

async function signInAndSaveState(options: {
  email: string;
  password: string;
  baseUrl: string;
  outputPath: string;
}) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
  });

  await page.goto(`${options.baseUrl}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.getByLabel(/email/i).fill(options.email);
  await page.getByLabel(/password/i).fill(options.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await page.waitForURL(/\/(feed|account|prayer)/, { timeout: 60000 });

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  await context.storageState({ path: options.outputPath });
  await browser.close();
}

export default async function globalSetup(_config: FullConfig) {
  const env = getPrayerAuthEnv();

  fs.mkdirSync(authDir, { recursive: true });

  if (!env.configured) {
    if (env.missing.length > 0) {
      console.log(
        `[prayer tests] Skipping authenticated setup — missing: ${env.missing.join(", ")}`
      );
    }
    if (fs.existsSync(AUTH_MARKER)) fs.unlinkSync(AUTH_MARKER);
    return;
  }

  await signInAndSaveState({
    email: env.ownerEmail!,
    password: env.ownerPassword!,
    baseUrl: env.baseUrl,
    outputPath: path.join(authDir, "owner.json"),
  });

  await signInAndSaveState({
    email: env.responderEmail!,
    password: env.responderPassword!,
    baseUrl: env.baseUrl,
    outputPath: path.join(authDir, "responder.json"),
  });

  if (env.thirdEmail && env.thirdPassword) {
    await signInAndSaveState({
      email: env.thirdEmail,
      password: env.thirdPassword,
      baseUrl: env.baseUrl,
      outputPath: path.join(authDir, "third.json"),
    });
  }

  fs.writeFileSync(AUTH_MARKER, new Date().toISOString(), "utf8");
  console.log("[prayer tests] Authentication storage states saved to .playwright/auth/");
}
