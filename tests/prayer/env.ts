import fs from "fs";
import path from "path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

export type PrayerAuthEnv = {
  configured: boolean;
  missing: string[];
  baseUrl: string;
  ownerEmail?: string;
  ownerPassword?: string;
  responderEmail?: string;
  responderPassword?: string;
  thirdEmail?: string;
  thirdPassword?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  serviceRoleKey?: string;
};

export function getPrayerAuthEnv(): PrayerAuthEnv {
  const missing: string[] = [];

  const ownerEmail = process.env.PLAYWRIGHT_OWNER_EMAIL?.trim();
  const ownerPassword = process.env.PLAYWRIGHT_OWNER_PASSWORD?.trim();
  const responderEmail = process.env.PLAYWRIGHT_RESPONDER_EMAIL?.trim();
  const responderPassword = process.env.PLAYWRIGHT_RESPONDER_PASSWORD?.trim();

  if (!ownerEmail) missing.push("PLAYWRIGHT_OWNER_EMAIL");
  if (!ownerPassword) missing.push("PLAYWRIGHT_OWNER_PASSWORD");
  if (!responderEmail) missing.push("PLAYWRIGHT_RESPONDER_EMAIL");
  if (!responderPassword) missing.push("PLAYWRIGHT_RESPONDER_PASSWORD");

  const configured =
    missing.length === 0;

  return {
    configured,
    missing: [...new Set(missing)],
    baseUrl: process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:3492",
    ownerEmail,
    ownerPassword,
    responderEmail,
    responderPassword,
    thirdEmail: process.env.PLAYWRIGHT_THIRD_USER_EMAIL?.trim(),
    thirdPassword: process.env.PLAYWRIGHT_THIRD_USER_PASSWORD?.trim(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
}

export const AUTH_MARKER = path.join(".playwright", "auth", ".configured");

export function authIsReady(): boolean {
  return fs.existsSync(AUTH_MARKER);
}

export function skipAuthTests(test: { skip: (condition: boolean, reason: string) => void }) {
  const env = getPrayerAuthEnv();
  if (!env.configured || !authIsReady()) {
    const reason = env.missing.length
      ? `Missing: ${env.missing.join(", ")}`
      : "Authentication storage states were not generated.";
    test.skip(true, reason);
  }
}

export const FIXTURE_MARKER = "[PLAYWRIGHT-PRAYER-FIXTURE]";
