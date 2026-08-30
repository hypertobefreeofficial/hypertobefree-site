/**
 * Declarative permanent-account-deletion policy (Option B — hybrid).
 * Planning only — this module does NOT execute deletions.
 */

export type AccountDeletionTableAction =
  | "hard_delete"
  | "anonymize"
  | "preserve_minimal"
  | "preserve"
  | "preserve_anonymized"
  | "manual_review";

/** Execution-aligned storage policy used by Phase 1A manifest and Phase 1D engine. */
export type AccountDeletionStorageAction =
  | "preserve_public"
  | "preserve_shared"
  | "delete_private"
  | "block_unresolved"
  | "skip_unknown";

export const ACCOUNT_DELETION_TABLE_POLICY = {
  profiles: "hard_delete",
  stories: "anonymize",
  prayer_video_responses: "anonymize",
  prayer_written_responses: "anonymize",
  prayer_updates: "anonymize",
  story_reactions: "hard_delete",
  story_video_replies: "hard_delete",
  saved_content: "hard_delete",
  prayer_follows: "hard_delete",
  prayer_search_preferences: "hard_delete",
  blocked_users: "hard_delete",
  inbox_messages_recipient_owned: "hard_delete",
  inbox_messages_sent_to_other_user: "preserve_anonymized",
  content_reports: "preserve_minimal",
  admin_action_logs: "preserve",
  account_deletion_requests: "preserve_minimal",
} as const satisfies Record<string, AccountDeletionTableAction>;

export type AccountDeletionPolicyTable =
  keyof typeof ACCOUNT_DELETION_TABLE_POLICY;

export const STORY_ANONYMIZATION_PII_FIELDS = [
  "user_id",
  "name",
  "email",
  "location",
  "public_lat",
  "public_lng",
  "public_location_label",
] as const;

export type StoryAnonymizationField =
  (typeof STORY_ANONYMIZATION_PII_FIELDS)[number];

export const ACCOUNT_DELETION_STORAGE_BUCKET_POLICY = {
  "profile-avatars": "delete_private",
  "story-images": "preserve_public",
  "story-videos": "preserve_public",
  "story-thumbnails": "preserve_public",
  "journey-private-media": "delete_private",
} as const satisfies Record<string, AccountDeletionStorageAction>;

export type AccountDeletionStorageBucket =
  keyof typeof ACCOUNT_DELETION_STORAGE_BUCKET_POLICY;

export const ACCOUNT_DELETION_SCHEMA_REQUIREMENTS = [
  "profiles.id has no FK to auth.users — explicit profile delete required before or after auth removal",
  "stories.user_id has no FK to auth.users — explicit story anonymization/delete required",
  "content_reports.reported_user_id has no FK — stale UUID may remain unless manually cleared",
  "account_deletion_requests.user_id ON DELETE SET NULL — request row survives auth deletion; target_user_id_snapshot retains audit identity",
  "protect_profile_roles trigger blocks DELETE on profiles where is_owner = true",
] as const;

export const LEGACY_COMPLETED_STATUS_NOTE =
  "Legacy administrative closure (completed or legacy_completed) — the account was not permanently deleted.";

export const BLOCKED_OWNER_ACCOUNT_CODE = "BLOCKED_OWNER_ACCOUNT" as const;

export function classifyTableAction(
  table: AccountDeletionPolicyTable
): AccountDeletionTableAction {
  return ACCOUNT_DELETION_TABLE_POLICY[table];
}

export function classifyStorageBucketAction(
  bucket: AccountDeletionStorageBucket
): AccountDeletionStorageAction {
  return ACCOUNT_DELETION_STORAGE_BUCKET_POLICY[bucket];
}

export function isDeletableStorageBucketPolicy(
  action: AccountDeletionStorageAction
): boolean {
  return action === "delete_private";
}

export function isPreservedStorageBucketPolicy(
  action: AccountDeletionStorageAction
): boolean {
  return action === "preserve_public" || action === "preserve_shared";
}
