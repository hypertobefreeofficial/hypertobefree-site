/**
 * Gate A synthetic-user authentication helpers.
 * Never logs emails, passwords, keys, tokens, or user IDs.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  assertSyntheticUserEmail,
  GATE_A_USER_EMAIL_PATTERN,
} from "./stagingGuards.mjs";

const CREDENTIAL_PATTERNS = [
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bloadtest_user_\d{4}@staging\.htbf\.test\b/i,
  /\bLt-[A-Za-z0-9_-]{10,}\b/,
  /\bsb_[a-z]+_[A-Za-z0-9_-]{10,}\b/i,
  /\bSUPABASE_(?:SERVICE_ROLE|ANON)_KEY\b/i,
  /\baccess_token\b/i,
  /\brefresh_token\b/i,
];

export function parseUserPoolFirstEntry(csvContent) {
  const lines = csvContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("email,"));

  if (lines.length === 0) {
    throw new Error("User pool is empty.");
  }

  const line = lines[0];
  const comma = line.indexOf(",");
  if (comma <= 0) {
    throw new Error("User pool row is malformed.");
  }

  const email = line.slice(0, comma).trim();
  const password = line.slice(comma + 1).trim();

  return { email, password };
}

export function readUserPoolFirstEntry(poolFilePath) {
  const raw = readFileSync(poolFilePath, "utf8");
  return parseUserPoolFirstEntry(raw);
}

export function validateSyntheticPoolEntry({ email, password }) {
  return {
    poolEntryExists: Boolean(email && password),
    emailMatchesPattern: GATE_A_USER_EMAIL_PATTERN.test(email),
    passwordNonEmpty: Boolean(password?.length),
  };
}

export function findAuthUsersByEmail(users, email) {
  const normalized = email.toLowerCase();
  return users.filter(
    (user) => user.email?.toLowerCase() === normalized
  );
}

export function describeAuthUserState(user) {
  if (!user) {
    return {
      authUserExists: false,
      emailConfirmed: false,
      userBanned: false,
    };
  }

  const banned =
    user.banned_until != null &&
    new Date(user.banned_until).getTime() > Date.now();

  return {
    authUserExists: true,
    emailConfirmed: Boolean(user.email_confirmed_at),
    userBanned: banned,
  };
}

export function classifySupabaseAuthError(error) {
  if (!error) {
    return {
      code: null,
      category: "none",
      message: null,
    };
  }

  const code = error.code || error.error_code || null;
  const message = error.message || String(error);
  const normalized = `${code || ""} ${message}`.toLowerCase();

  if (
    normalized.includes("invalid api key") ||
    normalized.includes("invalid_api_key") ||
    code === "invalid_api_key"
  ) {
    return {
      code: code || "invalid_api_key",
      category: "invalid_api_key",
      message: "invalid API key",
    };
  }

  if (
    normalized.includes("email not confirmed") ||
    code === "email_not_confirmed"
  ) {
    return {
      code: code || "email_not_confirmed",
      category: "email_not_confirmed",
      message: "email not confirmed",
    };
  }

  if (
    normalized.includes("user banned") ||
    normalized.includes("banned") ||
    code === "user_banned"
  ) {
    return {
      code: code || "user_banned",
      category: "user_banned",
      message: "user banned",
    };
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials") ||
    code === "invalid_credentials"
  ) {
    return {
      code: code || "invalid_credentials",
      category: "invalid_credentials",
      message: "Invalid login credentials",
    };
  }

  return {
    code,
    category: "authentication_failed",
    message: message.slice(0, 120),
  };
}

export function createGateAAdminClient(supabaseUrl, serviceRoleKey) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createGateAAnonClient(supabaseUrl, anonKey) {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function listAllAuthUsers(adminClient) {
  const users = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Could not list auth users: ${error.message}`);
    }

    users.push(...(data.users || []));

    if (!data.users?.length || data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

export async function syncOneSyntheticUserPassword(adminClient, email, password) {
  assertSyntheticUserEmail(email);

  const users = await listAllAuthUsers(adminClient);
  const matches = findAuthUsersByEmail(users, email);

  if (matches.length > 1) {
    throw new Error("Ambiguous auth user match for synthetic pool entry.");
  }

  const existing = matches[0];
  if (!existing?.id) {
    return {
      userFound: false,
      passwordUpdateSucceeded: false,
      emailConfirmed: false,
      userBanned: false,
    };
  }

  const before = describeAuthUserState(existing);

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    existing.id,
    {
      password,
      email_confirm: true,
    }
  );

  if (updateError) {
    throw new Error(`Could not synchronize synthetic user password: ${updateError.message}`);
  }

  const { data: refreshed, error: fetchError } =
    await adminClient.auth.admin.getUserById(existing.id);

  if (fetchError) {
    throw new Error(`Could not verify synthetic user after password sync: ${fetchError.message}`);
  }

  const after = describeAuthUserState(refreshed.user);

  return {
    userFound: true,
    passwordUpdateSucceeded: true,
    emailConfirmed: after.emailConfirmed,
    userBanned: after.userBanned || before.userBanned,
  };
}

export async function signInSyntheticUserWithOfficialClient(anonClient, email, password) {
  const { data, error } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  const classified = classifySupabaseAuthError(error);
  const status = error?.status ?? (data.session ? 200 : 401);

  return {
    status,
    errorCode: classified.code,
    errorCategory: classified.category,
    errorMessage: classified.message,
    sessionReceived: Boolean(data?.session),
    accessTokenReceived: Boolean(data?.session?.access_token),
    userReceived: Boolean(data?.user),
    authenticationAttempts: 1,
  };
}

export function textContainsCredentialLeak(text) {
  if (!text) return false;
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeLogPayload(payload) {
  const serialized = JSON.stringify(payload);
  if (textContainsCredentialLeak(serialized)) {
    throw new Error("Refusing to log payload that may contain credentials.");
  }
  return payload;
}
