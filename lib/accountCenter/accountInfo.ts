import type { User } from "@supabase/supabase-js";

export type AccountInfoProfileRow = {
  display_name: string | null;
  username: string | null;
};

export type AccountInfoFieldKey =
  | "signInEmail"
  | "userId"
  | "accountCreated"
  | "username"
  | "displayName"
  | "signInProvider"
  | "emailVerificationStatus";

export type AccountInfoField = {
  key: AccountInfoFieldKey;
  label: string;
  value: string;
};

export type AccountInfoDisplay = {
  fields: AccountInfoField[];
};

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email",
  google: "Google",
  apple: "Apple",
  facebook: "Facebook",
  github: "GitHub",
};

export function formatSignInProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  return PROVIDER_LABELS[normalized] ?? provider;
}

export function resolveSignInProvider(
  user: Pick<User, "app_metadata" | "identities">
): string | null {
  const identityProvider = user.identities?.find(
    (identity) => typeof identity.provider === "string" && identity.provider.trim()
  )?.provider;

  if (identityProvider) {
    return formatSignInProvider(identityProvider);
  }

  const metadataProvider = user.app_metadata?.provider;
  if (typeof metadataProvider === "string" && metadataProvider.trim()) {
    return formatSignInProvider(metadataProvider);
  }

  return null;
}

export function resolveEmailVerificationStatus(
  user: Pick<User, "email_confirmed_at" | "confirmed_at" | "identities">
): "Verified" | "Not verified" | null {
  if (user.email_confirmed_at || user.confirmed_at) {
    return "Verified";
  }

  const provider = user.identities?.[0]?.provider?.trim().toLowerCase();
  if (provider === "email") {
    return "Not verified";
  }

  return null;
}

export function formatAccountCreatedDate(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function readTrimmedString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveAccountInfoDisplay(
  user: User,
  profile: AccountInfoProfileRow | null
): AccountInfoDisplay {
  const fields: AccountInfoField[] = [];

  const signInEmail = readTrimmedString(user.email);
  if (signInEmail) {
    fields.push({
      key: "signInEmail",
      label: "Sign-in Email",
      value: signInEmail,
    });
  }

  const userId = readTrimmedString(user.id);
  if (userId) {
    fields.push({
      key: "userId",
      label: "User ID",
      value: userId,
    });
  }

  if (user.created_at) {
    const formattedCreatedAt = formatAccountCreatedDate(user.created_at);
    if (formattedCreatedAt) {
      fields.push({
        key: "accountCreated",
        label: "Account Created",
        value: formattedCreatedAt,
      });
    }
  }

  const username = readTrimmedString(profile?.username ?? null);
  if (username) {
    fields.push({
      key: "username",
      label: "Username",
      value: `@${username}`,
    });
  }

  const displayName = readTrimmedString(profile?.display_name ?? null);
  if (displayName) {
    fields.push({
      key: "displayName",
      label: "Display Name",
      value: displayName,
    });
  }

  const signInProvider = resolveSignInProvider(user);
  if (signInProvider) {
    fields.push({
      key: "signInProvider",
      label: "Sign-in Provider",
      value: signInProvider,
    });
  }

  const emailVerificationStatus = resolveEmailVerificationStatus(user);
  if (emailVerificationStatus) {
    fields.push({
      key: "emailVerificationStatus",
      label: "Email Verification Status",
      value: emailVerificationStatus,
    });
  }

  return { fields };
}

export function accountInfoRequiresAuthentication(
  user: User | null | undefined
): user is User {
  return Boolean(user?.id);
}
