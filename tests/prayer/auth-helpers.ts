import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { getPrayerAuthEnv } from "./env";

const RETURNING_PREFS = {
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
};

export async function primePrayerPage(
  page: import("@playwright/test").Page,
  options?: { useMock?: boolean }
) {
  await page.addInitScript(
    ({ prefs, useMock }) => {
      window.localStorage.setItem("htbf-prayer-search-v1", JSON.stringify(prefs));
      window.sessionStorage.setItem("htbf-mobile-splash-shown", "true");
      if (useMock) {
        window.localStorage.setItem("htbf-prayer-force-mock", "1");
      }
    },
    { prefs: RETURNING_PREFS, useMock: options?.useMock ?? false }
  );
}

export function readAccessTokenFromStorageState(statePath: string): string | null {
  if (!fs.existsSync(statePath)) return null;
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
    origins?: { origin: string; localStorage?: { name: string; value: string }[] }[];
  };

  for (const origin of state.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if (!entry.name.includes("-auth-token")) continue;
      try {
        const parsed = JSON.parse(entry.value) as {
          access_token?: string;
        };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // ignore malformed entries
      }
    }
  }
  return null;
}

export async function signOutViaStorage(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const keys = Object.keys(window.localStorage).filter((key) =>
      key.includes("-auth-token")
    );
    keys.forEach((key) => window.localStorage.removeItem(key));
  });
}

export async function signInOnPage(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/(feed|account|prayer)/, { timeout: 60000 });
}

export async function apiFetch(
  baseUrl: string,
  accessToken: string,
  pathname: string,
  init?: RequestInit
) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return { response, json };
}

export function ownerStatePath() {
  return path.join(".playwright", "auth", "owner.json");
}

export function responderStatePath() {
  return path.join(".playwright", "auth", "responder.json");
}

export function thirdStatePath() {
  return path.join(".playwright", "auth", "third.json");
}

export async function readAccessTokenFromPage(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const keys = Object.keys(window.localStorage).filter((key) =>
      key.includes("-auth-token")
    );
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed.access_token) return parsed.access_token;
      } catch {
        // ignore
      }
    }
    return null;
  });
}

export async function getUserIdFromToken(
  accessToken: string
): Promise<string | null> {
  const env = getPrayerAuthEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await client.auth.getUser(accessToken);
  return data.user?.id ?? null;
}
