#!/usr/bin/env node
/**
 * Validates local test environment without printing secret values.
 * Usage: node scripts/verify-test-env.mjs
 */
import fs from "fs";
import path from "path";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PLAYWRIGHT_OWNER_EMAIL",
  "PLAYWRIGHT_OWNER_PASSWORD",
  "PLAYWRIGHT_RESPONDER_EMAIL",
  "PLAYWRIGHT_RESPONDER_PASSWORD",
];

const OPTIONAL = [
  "PLAYWRIGHT_BASE_URL",
  "PLAYWRIGHT_THIRD_USER_EMAIL",
  "PLAYWRIGHT_THIRD_USER_PASSWORD",
  "PLAYWRIGHT_ADMIN_EMAIL",
  "PLAYWRIGHT_ADMIN_PASSWORD",
];

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

const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
const optionalMissing = OPTIONAL.filter((key) => !process.env[key]?.trim());

console.log(
  JSON.stringify(
    {
      ready: missing.length === 0,
      missingRequired: missing,
      missingOptional: optionalMissing,
      authMarkerExists: fs.existsSync(
        path.join(".playwright", "auth", ".configured")
      ),
    },
    null,
    2
  )
);

process.exit(missing.length === 0 ? 0 : 1);
