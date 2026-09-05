/**
 * Database retention and mutation policy for permanent account deletion (Phase 4C.7B.1E.1 / 1E.1B).
 * Declarative only — no SQL execution in this module.
 */

import { STORY_ANONYMIZATION_PII_FIELDS } from "./accountDeletionPolicy";
import {
  isSchemaExecutionReadyFromLiveProbe,
  type AccountDeletionSchemaProbeResult,
} from "./accountDeletionSchemaProbe";
import {
  ACCOUNT_DELETION_STORY_CROSS_USER_INVARIANT,
  STORY_LIFECYCLE_STORAGE_NOTES,
} from "./accountDeletionStoryLifecycle";

export type AccountDeletionDatabaseAction =
  | "HARD_DELETE"
  | "ANONYMIZE"
  | "PRESERVE"
  | "DETACH"
  | "BLOCK_UNRESOLVED";

export type AccountDeletionDatabaseFkBehavior =
  | "CASCADE"
  | "SET NULL"
  | "RESTRICT"
  | "NO ACTION"
  | "NONE";

export type AccountDeletionTransitiveCascadeClassification =
  | "EXPECTED_PRIVATE_CLEANUP"
  | "SAFE_SET_NULL"
  | "UNSAFE_PRESERVED_DATA_LOSS"
  | "IRRELEVANT_TO_ACCOUNT_DELETION";

export type AccountDeletionModerationPiiRetention =
  | "PRESERVE"
  | "REDACT_IDENTITY"
  | "PRESERVE_MINIMUM_AUDIT"
  | "REVIEW_REQUIRED";

export type AccountDeletionNonFkUuidPolicy =
  | "NULL_ON_EXECUTION"
  | "SNAPSHOT_RETAIN"
  | "PRESERVE"
  | "REDACT";

export type AccountDeletionDatabaseTablePolicy = {
  table: string;
  action: AccountDeletionDatabaseAction;
  selector: string;
  reason: string;
  identityFields?: readonly string[];
  orderHint: number;
  fkNotes?: readonly string[];
  rlsNotes?: readonly string[];
};

export type AccountDeletionSchemaPrerequisiteVerificationSource =
  | "baseline_migration"
  | "hardening_migration_designed"
  | "target_environment_verified";

export type AccountDeletionSchemaPrerequisite = {
  id: string;
  table: string;
  column: string;
  currentState: string;
  requiredState: string;
  reason: string;
  /**
   * True only after target-environment schema verification confirms the
   * hardening migration is applied. Never true from local file existence alone.
   */
  satisfied: boolean;
  /** Phase 4C.7B.1E.2A migration file implementing this prerequisite. */
  migrationFile: string;
  verificationSource: AccountDeletionSchemaPrerequisiteVerificationSource;
};

export const ACCOUNT_DELETION_SCHEMA_HARDENING_MIGRATION = {
  version: "20260830100000",
  filename: "20260830100000_account_deletion_schema_hardening_phase4c7b1e2a.sql",
  relativePath:
    "supabase/migrations/20260830100000_account_deletion_schema_hardening_phase4c7b1e2a.sql",
  phase: "4C.7B.1E.2A",
} as const;

export const ACCOUNT_DELETION_SCHEMA_READINESS_MODEL_NOTE =
  "schemaExecutionReady requires target-environment verification of all prerequisites — designing the hardening migration locally does not enable destructive execution." as const;

export const ACCOUNT_DELETION_STORY_VIDEO_REPLIES_FK_DEFERRAL_NOTE =
  "story_video_replies.story_id ON DELETE CASCADE is deferred — 1E.1 lifecycle blocks parent story HARD_DELETE for public/tombstone stories and never-published stories with replies." as const;

export type AccountDeletionDirectAuthFkEntry = {
  table: string;
  column: string;
  references: string;
  onDelete: AccountDeletionDatabaseFkBehavior;
  columnNullable: boolean;
  executionNote?: string;
};

export type AccountDeletionTransitiveCascadeEntry = {
  id: string;
  chain: readonly string[];
  classification: AccountDeletionTransitiveCascadeClassification;
  currentBehavior: string;
  requiredFutureBehavior?: string;
  executionNote?: string;
};

export const ACCOUNT_DELETION_STORY_VIDEO_REPLIES_FK_HARDENING_NOTE =
  "Before auth.users deletion, story_video_replies.user_id and recipient_user_id require ON DELETE SET NULL hardening so auth delete cannot CASCADE-delete a surviving party's shared reply row." as const;

export const DELETED_PUBLIC_AUTHOR_DISPLAY_NAME = "Deleted User" as const;

export const APPROVED_PUBLIC_STORY_STATUSES = ["approved"] as const;

export const NON_PUBLIC_STORY_STATUSES = [
  "pending",
  "submitted",
  "rejected",
] as const;

export const PUBLIC_TESTIMONY_TABLES = [
  "stories",
  "prayer_video_responses",
  "prayer_written_responses",
  "prayer_updates",
] as const;

export type PublicTestimonyTable = (typeof PUBLIC_TESTIMONY_TABLES)[number];

export const STORY_ANONYMIZATION_IDENTITY_FIELDS = STORY_ANONYMIZATION_PII_FIELDS;

export const NON_PUBLIC_STORY_HARD_DELETE_NOTE =
  "Non-public target-owned stories are hard-deleted; linked storage media cleanup is a future coordinated 1D change — do not silently delete public buckets.";

export const PROFILE_ANONYMIZATION_IDENTITY_FIELDS = [
  "email",
  "display_name",
  "username",
  "real_name",
  "location",
  "avatar_url",
  "bio",
  "deletion_requested_at",
] as const;

export const PROFILE_HARD_DELETE_TABLE = "profiles" as const;

export const PRAYER_VIDEO_RESPONSE_ANONYMIZATION_FIELDS = [] as const;

export const PRAYER_VIDEO_RESPONSE_IDENTITY_DETACH_FIELDS = ["user_id"] as const;

export const PRAYER_WRITTEN_RESPONSE_ANONYMIZATION_FIELDS = [] as const;

export const PRAYER_WRITTEN_RESPONSE_IDENTITY_DETACH_FIELDS = [
  "author_user_id",
] as const;

export const PRAYER_UPDATE_ANONYMIZATION_FIELDS = [] as const;

export const PRAYER_UPDATE_IDENTITY_DETACH_FIELDS = ["author_user_id"] as const;

export const INBOX_SURVIVING_COPY_ANONYMIZATION_FIELDS = [
  "title",
  "body",
] as const;

export const CONTENT_REPORT_DETACH_FIELDS = ["reported_user_id"] as const;

export const CONTENT_REPORT_STORY_DETACH_FIELDS = ["story_id"] as const;

const SCHEMA_HARDENING_MIGRATION_FILE =
  ACCOUNT_DELETION_SCHEMA_HARDENING_MIGRATION.relativePath;

export const ACCOUNT_DELETION_SCHEMA_PREREQUISITES: AccountDeletionSchemaPrerequisite[] =
  [
    {
      id: "stories_user_id_nullable",
      table: "stories",
      column: "user_id",
      currentState: "uuid NOT NULL, no auth.users FK (baseline 20260816183000)",
      requiredState: "uuid NULLABLE, no auth.users FK",
      reason:
        "Planned public-story anonymization sets user_id NULL; cannot succeed on current schema.",
      satisfied: false,
      migrationFile: SCHEMA_HARDENING_MIGRATION_FILE,
      verificationSource: "hardening_migration_designed",
    },
    {
      id: "prayer_video_responses_user_id_set_null",
      table: "prayer_video_responses",
      column: "user_id",
      currentState:
        "uuid NOT NULL, prayer_video_responses_user_id_fkey ON DELETE CASCADE → auth.users",
      requiredState: "uuid NULLABLE, ON DELETE SET NULL → auth.users",
      reason:
        "Auth delete before anonymize cascade-deletes approved public prayer video responses.",
      satisfied: false,
      migrationFile: SCHEMA_HARDENING_MIGRATION_FILE,
      verificationSource: "hardening_migration_designed",
    },
    {
      id: "prayer_written_responses_author_set_null",
      table: "prayer_written_responses",
      column: "author_user_id",
      currentState:
        "uuid NOT NULL, prayer_written_responses_author_user_id_fkey ON DELETE CASCADE → auth.users",
      requiredState: "uuid NULLABLE, ON DELETE SET NULL → auth.users",
      reason:
        "Auth delete before anonymize cascade-deletes visible written prayer responses.",
      satisfied: false,
      migrationFile: SCHEMA_HARDENING_MIGRATION_FILE,
      verificationSource: "hardening_migration_designed",
    },
    {
      id: "prayer_updates_author_set_null",
      table: "prayer_updates",
      column: "author_user_id",
      currentState:
        "uuid NOT NULL, prayer_updates_author_user_id_fkey ON DELETE CASCADE → auth.users",
      requiredState: "uuid NULLABLE, ON DELETE SET NULL → auth.users",
      reason:
        "Auth delete before anonymize cascade-deletes visible prayer updates and can transitively delete inbox rows.",
      satisfied: false,
      migrationFile: SCHEMA_HARDENING_MIGRATION_FILE,
      verificationSource: "hardening_migration_designed",
    },
    {
      id: "inbox_messages_prayer_update_id_set_null",
      table: "inbox_messages",
      column: "prayer_update_id",
      currentState:
        "uuid NULLABLE, inbox_messages_prayer_update_id_fkey ON DELETE CASCADE → prayer_updates",
      requiredState: "uuid NULLABLE, ON DELETE SET NULL → prayer_updates",
      reason:
        "Deleting/anonymizing prayer updates must not cascade-delete inbox rows belonging to surviving users.",
      satisfied: false,
      migrationFile: SCHEMA_HARDENING_MIGRATION_FILE,
      verificationSource: "hardening_migration_designed",
    },
    {
      id: "content_reports_story_id_set_null",
      table: "content_reports",
      column: "story_id",
      currentState:
        "uuid NULLABLE, content_reports_story_id_fkey ON DELETE CASCADE → stories",
      requiredState: "uuid NULLABLE, ON DELETE SET NULL → stories",
      reason:
        "Non-public story HARD_DELETE must not cascade-delete preserved moderation reports.",
      satisfied: false,
      migrationFile: SCHEMA_HARDENING_MIGRATION_FILE,
      verificationSource: "hardening_migration_designed",
    },
  ];

export const ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY: AccountDeletionDirectAuthFkEntry[] =
  [
    {
      table: "account_deletion_requests",
      column: "user_id",
      references: "auth.users(id)",
      onDelete: "SET NULL",
      columnNullable: true,
      executionNote:
        "Phase 4C.7B.1B applied in Production — request row survives auth deletion; snapshots retain target identity.",
    },
    {
      table: "account_deletion_requests",
      column: "approved_by",
      references: "auth.users(id)",
      onDelete: "SET NULL",
      columnNullable: true,
    },
    {
      table: "admin_action_logs",
      column: "actor_user_id",
      references: "auth.users(id)",
      onDelete: "SET NULL",
      columnNullable: true,
    },
    {
      table: "admin_action_logs",
      column: "target_user_id",
      references: "auth.users(id)",
      onDelete: "SET NULL",
      columnNullable: true,
    },
    {
      table: "blocked_users",
      column: "blocker_user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
    },
    {
      table: "blocked_users",
      column: "blocked_user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
    },
    {
      table: "content_reports",
      column: "reporter_user_id",
      references: "auth.users(id)",
      onDelete: "SET NULL",
      columnNullable: true,
    },
    {
      table: "inbox_messages",
      column: "user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
      executionNote:
        "Recipient-owned copies delete with target auth user unless explicitly hard-deleted first.",
    },
    {
      table: "inbox_messages",
      column: "sender_user_id",
      references: "auth.users(id)",
      onDelete: "SET NULL",
      columnNullable: true,
      executionNote:
        "Surviving sent copies in other users' inboxes must never be hard-deleted.",
    },
    {
      table: "prayer_follows",
      column: "user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
    },
    {
      table: "prayer_search_preferences",
      column: "user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
    },
    {
      table: "prayer_updates",
      column: "author_user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
      executionNote:
        "BLOCKER — auth delete before anonymize destroys public prayer updates.",
    },
    {
      table: "prayer_video_responses",
      column: "user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
      executionNote:
        "BLOCKER — auth delete before anonymize destroys approved public responses.",
    },
    {
      table: "prayer_video_responses",
      column: "moderated_by",
      references: "auth.users(id)",
      onDelete: "SET NULL",
      columnNullable: true,
    },
    {
      table: "prayer_written_responses",
      column: "author_user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
      executionNote:
        "BLOCKER — auth delete before anonymize destroys visible written responses.",
    },
    {
      table: "saved_content",
      column: "user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
    },
    {
      table: "story_reactions",
      column: "user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
    },
    {
      table: "story_video_replies",
      column: "user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: false,
    },
    {
      table: "story_video_replies",
      column: "recipient_user_id",
      references: "auth.users(id)",
      onDelete: "CASCADE",
      columnNullable: true,
    },
  ];

/** @deprecated Use ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY — retained for compatibility. */
export const ACCOUNT_DELETION_DATABASE_FK_REGISTRY = [
  ...ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY.map((entry) => ({
    table: entry.table,
    column: entry.column,
    references: entry.references,
    onDelete: entry.onDelete,
    executionNote: entry.executionNote,
  })),
  {
    table: "content_reports",
    column: "reported_user_id",
    references: null,
    onDelete: "NONE" as const,
    executionNote: "No FK — stale UUID unless executor clears during DETACH.",
  },
  {
    table: "content_reports",
    column: "story_id",
    references: "public.stories(id)",
    onDelete: "CASCADE" as const,
    executionNote:
      "BLOCKER for non-public story HARD_DELETE — preserved reports would cascade-delete unless story_id detached or FK changed to SET NULL.",
  },
  {
    table: "inbox_messages",
    column: "parent_message_id",
    references: "inbox_messages(id)",
    onDelete: "SET NULL" as const,
  },
  {
    table: "inbox_messages",
    column: "prayer_update_id",
    references: "public.prayer_updates(id)",
    onDelete: "CASCADE" as const,
    executionNote:
      "UNSAFE transitive chain: auth.users delete → prayer_updates CASCADE → inbox_messages CASCADE in surviving users' inboxes.",
  },
  {
    table: "profiles",
    column: "id",
    references: null,
    onDelete: "NONE" as const,
    executionNote:
      "No FK to auth.users — explicit profile delete required; protect_profile_roles blocks owner delete.",
  },
  {
    table: "stories",
    column: "user_id",
    references: null,
    onDelete: "NONE" as const,
    executionNote:
      "No auth.users FK — explicit anonymization required; column is NOT NULL today so user_id → NULL requires schema migration.",
  },
] as const satisfies ReadonlyArray<{
  table: string;
  column: string;
  references: string | null;
  onDelete: AccountDeletionDatabaseFkBehavior;
  executionNote?: string;
}>;

export const ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY: AccountDeletionTransitiveCascadeEntry[] =
  [
    {
      id: "auth_prayer_updates_inbox_messages",
      chain: [
        "auth.users(target)",
        "→ prayer_updates.author_user_id ON DELETE CASCADE",
        "→ inbox_messages.prayer_update_id ON DELETE CASCADE",
      ],
      classification: "UNSAFE_PRESERVED_DATA_LOSS",
      currentBehavior:
        "Target auth delete removes target-authored prayer updates, which can delete inbox notification rows in other users' inboxes.",
      requiredFutureBehavior:
        "prayer_updates.author_user_id nullable + SET NULL; inbox_messages.prayer_update_id ON DELETE SET NULL; anonymize updates before auth delete.",
    },
    {
      id: "auth_prayer_video_responses_public_loss",
      chain: [
        "auth.users(target)",
        "→ prayer_video_responses.user_id ON DELETE CASCADE",
      ],
      classification: "UNSAFE_PRESERVED_DATA_LOSS",
      currentBehavior: "Approved public prayer video responses are deleted.",
      requiredFutureBehavior:
        "user_id nullable + ON DELETE SET NULL; anonymize before auth delete.",
    },
    {
      id: "auth_prayer_written_responses_public_loss",
      chain: [
        "auth.users(target)",
        "→ prayer_written_responses.author_user_id ON DELETE CASCADE",
      ],
      classification: "UNSAFE_PRESERVED_DATA_LOSS",
      currentBehavior: "Visible written prayer responses are deleted.",
      requiredFutureBehavior:
        "author_user_id nullable + ON DELETE SET NULL; anonymize before auth delete.",
    },
    {
      id: "auth_prayer_updates_public_loss",
      chain: [
        "auth.users(target)",
        "→ prayer_updates.author_user_id ON DELETE CASCADE",
      ],
      classification: "UNSAFE_PRESERVED_DATA_LOSS",
      currentBehavior: "Visible prayer updates are deleted.",
      requiredFutureBehavior:
        "author_user_id nullable + ON DELETE SET NULL; anonymize before auth delete.",
    },
    {
      id: "story_hard_delete_content_reports",
      chain: [
        "stories(target non-public HARD_DELETE)",
        "→ content_reports.story_id ON DELETE CASCADE",
      ],
      classification: "UNSAFE_PRESERVED_DATA_LOSS",
      currentBehavior: "Preserved moderation reports referencing the story are deleted.",
      requiredFutureBehavior:
        "DETACH content_reports.story_id before story HARD_DELETE; migrate FK to ON DELETE SET NULL.",
    },
    {
      id: "auth_inbox_recipient_owned",
      chain: ["auth.users(target)", "→ inbox_messages.user_id ON DELETE CASCADE"],
      classification: "EXPECTED_PRIVATE_CLEANUP",
      currentBehavior: "Recipient-owned inbox rows are deleted (matches HARD_DELETE policy).",
    },
    {
      id: "auth_inbox_sender_survives",
      chain: [
        "auth.users(target)",
        "→ inbox_messages.sender_user_id ON DELETE SET NULL",
      ],
      classification: "SAFE_SET_NULL",
      currentBehavior:
        "Sent copies in other users' inboxes survive with null sender (DETACH policy).",
    },
    {
      id: "auth_private_engagement_cleanup",
      chain: [
        "auth.users(target)",
        "→ story_reactions / saved_content / prayer_follows / prayer_search_preferences / blocked_users ON DELETE CASCADE",
      ],
      classification: "EXPECTED_PRIVATE_CLEANUP",
      currentBehavior: "Private per-user engagement rows are removed.",
    },
    {
      id: "auth_story_video_replies_shared_party_preservation",
      chain: [
        "auth.users(target)",
        "→ story_video_replies.user_id ON DELETE CASCADE (current schema)",
        "→ story_video_replies.recipient_user_id ON DELETE CASCADE (current schema)",
      ],
      classification: "UNSAFE_PRESERVED_DATA_LOSS",
      currentBehavior:
        "Auth delete can CASCADE-delete shared story_video_replies rows and destroy the surviving party's copy.",
      requiredFutureBehavior:
        "user_id and recipient_user_id nullable + ON DELETE SET NULL before auth.users delete; executor party-detaches target participation; preserve row for surviving party; HARD_DELETE only when no surviving party remains.",
    },
    {
      id: "auth_audit_set_null",
      chain: [
        "auth.users(target)",
        "→ admin_action_logs.actor_user_id / target_user_id ON DELETE SET NULL",
        "→ content_reports.reporter_user_id ON DELETE SET NULL",
        "→ account_deletion_requests.user_id / approved_by ON DELETE SET NULL",
      ],
      classification: "SAFE_SET_NULL",
      currentBehavior: "Audit rows survive; actor/reporter FKs nulled automatically.",
    },
    {
      id: "story_delete_other_user_prayer_video_responses",
      chain: [
        "stories(id) HARD_DELETE",
        "→ prayer_video_responses.story_id ON DELETE CASCADE",
      ],
      classification: "UNSAFE_PRESERVED_DATA_LOSS",
      currentBehavior:
        "Parent story hard-delete destroys other users' prayer video responses attached to that story.",
      requiredFutureBehavior:
        "Never HARD_DELETE previously public/removed stories; tombstone ANONYMIZE preserves parent row.",
    },
    {
      id: "story_delete_other_user_prayer_written_responses",
      chain: [
        "stories(id) HARD_DELETE",
        "→ prayer_written_responses.story_id ON DELETE CASCADE",
      ],
      classification: "UNSAFE_PRESERVED_DATA_LOSS",
      currentBehavior:
        "Parent story hard-delete destroys other users' written prayer responses.",
      requiredFutureBehavior:
        "Never HARD_DELETE previously public/removed stories; tombstone ANONYMIZE preserves parent row.",
    },
    {
      id: "story_delete_story_video_replies",
      chain: [
        "stories(id) HARD_DELETE",
        "→ story_video_replies.story_id ON DELETE CASCADE",
      ],
      classification: "UNSAFE_PRESERVED_DATA_LOSS",
      currentBehavior:
        "Parent story hard-delete destroys private video reply threads involving surviving users.",
      requiredFutureBehavior:
        "DETACH_AND_PRESERVE per-party replies; never-published HARD_DELETE blocked when storyVideoReplyCount > 0.",
    },
    {
      id: "story_delete_reactions_follows_saves",
      chain: [
        "stories(id) HARD_DELETE",
        "→ story_reactions / prayer_follows / saved_content.story_id ON DELETE CASCADE",
      ],
      classification: "EXPECTED_PRIVATE_CLEANUP",
      currentBehavior:
        "Derived engagement rows cascade on verified never-published story HARD_DELETE only.",
    },
    {
      id: "story_delete_owner_prayer_updates",
      chain: [
        "stories(id) HARD_DELETE",
        "→ prayer_updates.story_id ON DELETE CASCADE",
      ],
      classification: "EXPECTED_PRIVATE_CLEANUP",
      currentBehavior:
        "Owner-authored prayer updates cascade on story HARD_DELETE.",
      executionNote:
        "Still subject to prayer_updates → inbox_messages.prayer_update_id UNSAFE cascade until schema hardened.",
    },
    {
      id: "story_delete_verified_never_published_story",
      chain: [
        "stories(id) HARD_DELETE (NEVER_PUBLISHED + eligible child inventory only)",
      ],
      classification: "EXPECTED_PRIVATE_CLEANUP",
      currentBehavior:
        "Verified never-published target-owned draft may be hard-deleted when no substantive third-party children exist.",
    },
  ];

export const UNSAFE_AUTH_DELETE_CASCADE_TABLES = [
  "prayer_video_responses",
  "prayer_written_responses",
  "prayer_updates",
] as const;

export const UNSAFE_TRANSITIVE_CASCADE_IDS = [
  "auth_prayer_updates_inbox_messages",
  "auth_prayer_video_responses_public_loss",
  "auth_prayer_written_responses_public_loss",
  "auth_prayer_updates_public_loss",
  "auth_story_video_replies_shared_party_preservation",
  "story_hard_delete_content_reports",
  "story_delete_other_user_prayer_video_responses",
  "story_delete_other_user_prayer_written_responses",
  "story_delete_story_video_replies",
] as const;

export const ACCOUNT_DELETION_MODERATION_PII_RETENTION: ReadonlyArray<{
  table: string;
  field: string;
  classification: AccountDeletionModerationPiiRetention;
  reason: string;
}> = [
  {
    table: "content_reports",
    field: "details",
    classification: "REDACT_IDENTITY",
    reason:
      "Free-text report details may name people; redact target/reporter identity while keeping allegation category.",
  },
  {
    table: "content_reports",
    field: "admin_notes",
    classification: "PRESERVE_MINIMUM_AUDIT",
    reason: "Moderator workflow notes support dispute resolution; trim direct PII where feasible.",
  },
  {
    table: "content_reports",
    field: "reason",
    classification: "PRESERVE",
    reason: "Structured reason code is minimum necessary moderation evidence.",
  },
  {
    table: "admin_action_logs",
    field: "metadata",
    classification: "REVIEW_REQUIRED",
    reason:
      "JSON metadata may embed emails/usernames; classify per action type in executor — default to redact direct PII, preserve action fingerprint.",
  },
  {
    table: "account_deletion_requests",
    field: "email",
    classification: "PRESERVE_MINIMUM_AUDIT",
    reason: "Request email proves who submitted deletion; required for audit trail.",
  },
  {
    table: "account_deletion_requests",
    field: "reason",
    classification: "PRESERVE_MINIMUM_AUDIT",
    reason: "User-supplied deletion reason supports compliance review.",
  },
  {
    table: "account_deletion_requests",
    field: "admin_notes",
    classification: "PRESERVE_MINIMUM_AUDIT",
    reason: "Admin review notes document approval/denial rationale.",
  },
  {
    table: "account_deletion_requests",
    field: "target_user_id_snapshot",
    classification: "PRESERVE",
    reason: "Intentional immutable audit identity after auth deletion.",
  },
  {
    table: "account_deletion_requests",
    field: "target_username_snapshot",
    classification: "PRESERVE",
    reason: "Intentional immutable audit identity after auth deletion.",
  },
];

export const ACCOUNT_DELETION_NON_FK_UUID_FIELD_POLICIES: ReadonlyArray<{
  table: string;
  field: string;
  policy: AccountDeletionNonFkUuidPolicy;
  reason: string;
}> = [
  {
    table: "content_reports",
    field: "reported_user_id",
    policy: "NULL_ON_EXECUTION",
    reason: "No FK — executor must null stale reported UUID when target account is deleted.",
  },
  {
    table: "content_reports",
    field: "reviewed_by",
    policy: "PRESERVE",
    reason:
      "Historical moderator UUID may become stale; preserve for audit unless reviewer also deleted (then optional NULL).",
  },
  {
    table: "account_deletion_requests",
    field: "reviewed_by",
    policy: "PRESERVE",
    reason: "Legacy review UUID; no FK — retain for historical admin closure audit.",
  },
  {
    table: "stories",
    field: "removed_by",
    policy: "PRESERVE",
    reason: "Moderation actor on approved content; may reference deleted admin UUID.",
  },
  {
    table: "prayer_video_responses",
    field: "removed_by_user_id",
    policy: "PRESERVE",
    reason: "Removal actor audit on preserved public response rows.",
  },
];

export const ACCOUNT_DELETION_DATABASE_TABLE_REGISTRY: AccountDeletionDatabaseTablePolicy[] =
  [
    {
      table: "profiles",
      action: "HARD_DELETE",
      selector: "id = targetUserId",
      reason:
        "Active profile row is account-private and must cease to exist after deletion completes.",
      identityFields: PROFILE_ANONYMIZATION_IDENTITY_FIELDS,
      orderHint: 700,
      fkNotes: [
        "profiles.id has no FK to auth.users — delete explicitly after references cleared.",
        "protect_profile_roles trigger blocks owner profile delete.",
      ],
      rlsNotes: ["auth.uid() = id policies become irrelevant once Auth user is removed."],
    },
    {
      table: "stories",
      action: "ANONYMIZE",
      selector: "user_id = targetUserId AND status = 'approved' AND removed_at IS NULL",
      reason:
        "Approved public testimony/prayer posts survive with identity stripped; media URLs remain for preserved content.",
      identityFields: STORY_ANONYMIZATION_IDENTITY_FIELDS,
      orderHint: 200,
      fkNotes: [
        "No auth.users FK — safe from auth cascade.",
        "stories.user_id NOT NULL today — schema migration required before user_id → NULL anonymization.",
      ],
      rlsNotes: [
        "Approved stories readable via status policy without user_id.",
        "Update/delete policies require auth.uid() = user_id — NULL user_id makes content immutable to deleted user.",
      ],
    },
    {
      table: "stories",
      action: "ANONYMIZE",
      selector:
        "user_id = targetUserId AND lifecycle = PREVIOUSLY_PUBLIC_OR_REMOVED (tombstone)",
      reason:
        "Previously public or removed stories are tombstone-anonymized — parent row survives so cross-user prayer responses and replies are not cascade-deleted.",
      identityFields: STORY_ANONYMIZATION_IDENTITY_FIELDS,
      orderHint: 195,
      fkNotes: [
        "Never automatic HARD_DELETE for status = removed or removed_at IS NOT NULL.",
        STORY_LIFECYCLE_STORAGE_NOTES.PREVIOUSLY_PUBLIC_OR_REMOVED,
      ],
      rlsNotes: [
        "Tombstone preserves story_id FK for attached substantive child rows.",
      ],
    },
    {
      table: "content_reports",
      action: "DETACH",
      selector:
        "story_id IN eligibleNeverPublishedStoryIds AND reportEvidencePreservedBeforeStoryDelete = true",
      reason:
        "Null story_id on preserved reports before eligible never-published story HARD_DELETE so moderation evidence survives.",
      identityFields: CONTENT_REPORT_STORY_DETACH_FIELDS,
      orderHint: 185,
      fkNotes: [
        "content_reports.story_id ON DELETE CASCADE — story hard-delete without detach destroys PRESERVE policy rows.",
        "BLOCK when contentReportCount > 0 and reportEvidencePreservedBeforeStoryDelete is false.",
      ],
    },
    {
      table: "prayer_video_responses",
      action: "ANONYMIZE",
      selector: "user_id = targetUserId",
      reason:
        "Approved public prayer video responses survive with author identity detached; video_url, thumbnail_url, and body are preserved.",
      identityFields: PRAYER_VIDEO_RESPONSE_IDENTITY_DETACH_FIELDS,
      orderHint: 210,
      fkNotes: [
        "user_id NOT NULL + ON DELETE CASCADE — auth delete before anonymize would destroy rows (BLOCKER).",
        "Future executor must detach author FK before auth.users delete (schema change required in 1E.2A).",
        "Do not blank body — substantive prayer response text remains public.",
      ],
      rlsNotes: [
        "Public read uses approved status; author update rights lost after auth removal.",
      ],
    },
    {
      table: "prayer_written_responses",
      action: "ANONYMIZE",
      selector: "author_user_id = targetUserId",
      reason:
        "Visible written prayer responses on public prayer posts survive with author_user_id detached; body is preserved.",
      identityFields: PRAYER_WRITTEN_RESPONSE_IDENTITY_DETACH_FIELDS,
      orderHint: 220,
      fkNotes: [
        "author_user_id NOT NULL + ON DELETE CASCADE — auth delete before anonymize would destroy rows (BLOCKER).",
        "Future executor sets author_user_id NULL; body must not be blanked.",
      ],
    },
    {
      table: "prayer_updates",
      action: "ANONYMIZE",
      selector: "author_user_id = targetUserId",
      reason:
        "Prayer update posts on surviving prayer requests remain visible with author_user_id detached; body is preserved.",
      identityFields: PRAYER_UPDATE_IDENTITY_DETACH_FIELDS,
      orderHint: 230,
      fkNotes: [
        "author_user_id NOT NULL + ON DELETE CASCADE — auth delete before anonymize would destroy rows (BLOCKER).",
        "Transitive risk: deleted updates cascade to inbox_messages.prayer_update_id until schema hardened.",
        "Future executor sets author_user_id NULL; body must not be blanked.",
      ],
    },
    {
      table: "inbox_messages",
      action: "HARD_DELETE",
      selector: "user_id = targetUserId",
      reason:
        "Recipient-owned Journey/prayer inbox copies belong exclusively to the deleting account.",
      orderHint: 500,
      fkNotes: ["ON DELETE CASCADE on user_id aligns with hard delete intent."],
    },
    {
      table: "inbox_messages",
      action: "DETACH",
      selector: "sender_user_id = targetUserId AND user_id != targetUserId",
      reason:
        "Messages the target sent into another user's inbox must survive; sender association is detached/anonymized.",
      identityFields: INBOX_SURVIVING_COPY_ANONYMIZATION_FIELDS,
      orderHint: 300,
      fkNotes: [
        "sender_user_id ON DELETE SET NULL preserves row; executor should anonymize sender-identifying text before auth delete.",
        "prayer_update_id CASCADE on linked updates is unsafe until schema migration — anonymize/detach updates first.",
      ],
      rlsNotes: [
        "Surviving row remains readable by recipient via user_id = auth.uid().",
        "Deleted sender cannot update row after auth removal.",
      ],
    },
    {
      table: "story_reactions",
      action: "HARD_DELETE",
      selector: "user_id = targetUserId",
      reason: "Per-user reaction rows have no standalone public purpose after account deletion.",
      orderHint: 600,
    },
    {
      table: "story_video_replies",
      action: "DETACH",
      selector: "user_id = targetUserId AND recipient_user_id IS DISTINCT FROM targetUserId",
      reason:
        "Target is sender — preserve shared reply row for surviving recipient; future executor sets deleted_by_sender and nulls user_id after FK hardening.",
      identityFields: ["user_id"],
      orderHint: 540,
      fkNotes: [
        ACCOUNT_DELETION_STORY_VIDEO_REPLIES_FK_HARDENING_NOTE,
        "Never whole-row HARD_DELETE merely because target participated as sender.",
      ],
    },
    {
      table: "story_video_replies",
      action: "DETACH",
      selector:
        "recipient_user_id = targetUserId AND user_id IS DISTINCT FROM targetUserId",
      reason:
        "Target is recipient — preserve shared reply row for surviving sender; future executor sets deleted_by_recipient and nulls recipient_user_id after FK hardening.",
      identityFields: ["recipient_user_id"],
      orderHint: 545,
      fkNotes: [
        ACCOUNT_DELETION_STORY_VIDEO_REPLIES_FK_HARDENING_NOTE,
        "Never whole-row HARD_DELETE merely because target participated as recipient.",
      ],
    },
    {
      table: "story_video_replies",
      action: "HARD_DELETE",
      selector:
        "user_id = targetUserId AND (recipient_user_id IS NULL OR recipient_user_id = targetUserId)",
      reason:
        "Target-only or self-directed reply rows with no surviving cross-user party may be hard-deleted.",
      orderHint: 550,
      fkNotes: [
        "Cross-user replies require DETACH party semantics — not this selector.",
        "Story-attached replies involving surviving users require DETACH_AND_PRESERVE — never cascade via parent story HARD_DELETE.",
        "Never-published story HARD_DELETE blocked when storyVideoReplyCount > 0.",
      ],
    },
    {
      table: "saved_content",
      action: "HARD_DELETE",
      selector: "user_id = targetUserId",
      reason: "Saved items are private account state.",
      orderHint: 600,
    },
    {
      table: "prayer_follows",
      action: "HARD_DELETE",
      selector: "user_id = targetUserId",
      reason: "Prayer follow preferences are private account state.",
      orderHint: 600,
    },
    {
      table: "prayer_search_preferences",
      action: "HARD_DELETE",
      selector: "user_id = targetUserId",
      reason: "Prayer search radius/ZIP preferences are private account state.",
      orderHint: 600,
    },
    {
      table: "blocked_users",
      action: "HARD_DELETE",
      selector: "blocker_user_id = targetUserId OR blocked_user_id = targetUserId",
      reason: "Block relationships involving the target account are removed.",
      orderHint: 650,
    },
    {
      table: "content_reports",
      action: "PRESERVE",
      selector:
        "reporter_user_id = targetUserId OR reported_user_id = targetUserId",
      reason:
        "Moderation history must survive to explain prior reports; minimum necessary identifiers only.",
      identityFields: CONTENT_REPORT_DETACH_FIELDS,
      orderHint: 100,
      fkNotes: [
        "reported_user_id has no FK — executor should null stale reported UUID where policy allows.",
        "reporter_user_id SET NULL on auth delete.",
        "story_id CASCADE requires DETACH before non-public story HARD_DELETE.",
      ],
    },
    {
      table: "admin_action_logs",
      action: "PRESERVE",
      selector: "actor_user_id = targetUserId OR target_user_id = targetUserId",
      reason: "Administrative audit trail must remain intact.",
      orderHint: 50,
      fkNotes: ["actor/target SET NULL on auth delete — metadata json retains action evidence."],
    },
    {
      table: "account_deletion_requests",
      action: "PRESERVE",
      selector: "user_id = targetUserId OR target_user_id_snapshot = targetUserId",
      reason:
        "Deletion request lifecycle, snapshots, and audit metadata must survive auth user removal.",
      orderHint: 50,
      fkNotes: [
        "user_id ON DELETE SET NULL after Phase 4C.7B.1B (applied Production).",
        "target_user_id_snapshot / target_username_snapshot retain audit identity.",
      ],
    },
  ];

export const ACCOUNT_DELETION_DATABASE_KNOWN_TABLES = [
  ...new Set(ACCOUNT_DELETION_DATABASE_TABLE_REGISTRY.map((entry) => entry.table)),
] as const;

export type AccountDeletionDatabaseKnownTable =
  (typeof ACCOUNT_DELETION_DATABASE_KNOWN_TABLES)[number];

const NON_ESCALATABLE_DATABASE_ACTIONS: AccountDeletionDatabaseAction[] = [
  "PRESERVE",
  "ANONYMIZE",
  "DETACH",
  "BLOCK_UNRESOLVED",
];

const DATABASE_ACTION_RESTRICTIVENESS: Record<
  AccountDeletionDatabaseAction,
  number
> = {
  BLOCK_UNRESOLVED: 0,
  PRESERVE: 1,
  DETACH: 2,
  ANONYMIZE: 3,
  HARD_DELETE: 4,
};

export function resolveMostRestrictiveDatabaseAction(
  ...actions: AccountDeletionDatabaseAction[]
): AccountDeletionDatabaseAction {
  if (actions.length === 0) {
    return "BLOCK_UNRESOLVED";
  }

  return actions.reduce((most, current) =>
    DATABASE_ACTION_RESTRICTIVENESS[current] <
    DATABASE_ACTION_RESTRICTIVENESS[most]
      ? current
      : most
  );
}

export function classifyDatabaseTablePolicy(
  table: string
): AccountDeletionDatabaseTablePolicy[] {
  return ACCOUNT_DELETION_DATABASE_TABLE_REGISTRY.filter(
    (entry) => entry.table === table
  );
}

export function isKnownAccountDeletionDatabaseTable(
  table: string
): table is AccountDeletionDatabaseKnownTable {
  return (ACCOUNT_DELETION_DATABASE_KNOWN_TABLES as readonly string[]).includes(
    table
  );
}

export function isPublicTestimonyTable(
  table: string
): table is PublicTestimonyTable {
  return (PUBLIC_TESTIMONY_TABLES as readonly string[]).includes(table);
}

export function isApprovedPublicStoryHardDelete(entry: {
  table: string;
  selector: string;
}): boolean {
  return (
    entry.table === "stories" &&
    entry.selector.includes("status = 'approved'") &&
    !entry.selector.includes("status != 'approved'")
  );
}

export function assertDatabaseActionDoesNotEscalate(input: {
  from: AccountDeletionDatabaseAction;
  to: AccountDeletionDatabaseAction;
}): { ok: true } | { ok: false; reason: string } {
  if (
    NON_ESCALATABLE_DATABASE_ACTIONS.includes(input.from) &&
    input.to === "HARD_DELETE"
  ) {
    return {
      ok: false,
      reason: `Database policy escalation blocked: ${input.from} cannot become HARD_DELETE.`,
    };
  }

  return { ok: true };
}

export function getSchemaExecutionBlockers(): readonly string[] {
  return ACCOUNT_DELETION_SCHEMA_PREREQUISITES.filter((entry) => !entry.satisfied).map(
    (entry) => `${entry.id}: ${entry.table}.${entry.column} — ${entry.requiredState}`
  );
}

export function isSchemaExecutionReady(
  overrides?: Partial<Record<string, boolean>>
): boolean {
  return ACCOUNT_DELETION_SCHEMA_PREREQUISITES.every((entry) => {
    if (overrides && entry.id in overrides) {
      return overrides[entry.id] === true;
    }
    return entry.satisfied;
  });
}

export function resolveCombinedSchemaExecutionReady(input?: {
  prerequisiteOverrides?: Partial<Record<string, boolean>>;
  liveProbe?: AccountDeletionSchemaProbeResult | null;
}): {
  staticPrerequisitesReady: boolean;
  liveCatalogProbeReady: boolean;
  combinedReady: boolean;
} {
  const staticPrerequisitesReady = isSchemaExecutionReady(
    input?.prerequisiteOverrides
  );

  if (!input?.liveProbe) {
    return {
      staticPrerequisitesReady,
      liveCatalogProbeReady: false,
      combinedReady: staticPrerequisitesReady,
    };
  }

  const liveCatalogProbeReady = isSchemaExecutionReadyFromLiveProbe(
    input.liveProbe
  );

  return {
    staticPrerequisitesReady,
    liveCatalogProbeReady,
    combinedReady: staticPrerequisitesReady && liveCatalogProbeReady,
  };
}

export function areSchemaPrerequisitesEnvironmentVerified(): boolean {
  return ACCOUNT_DELETION_SCHEMA_PREREQUISITES.every((entry) => entry.satisfied);
}

export function describeSchemaExecutionReadiness(): {
  migrationDesignedLocally: true;
  migrationFile: string;
  prerequisiteCount: number;
  prerequisitesEnvironmentVerified: boolean;
  schemaExecutionReady: boolean;
  readinessNote: string;
} {
  return {
    migrationDesignedLocally: true,
    migrationFile: ACCOUNT_DELETION_SCHEMA_HARDENING_MIGRATION.relativePath,
    prerequisiteCount: ACCOUNT_DELETION_SCHEMA_PREREQUISITES.length,
    prerequisitesEnvironmentVerified: areSchemaPrerequisitesEnvironmentVerified(),
    schemaExecutionReady: isSchemaExecutionReady(),
    readinessNote: ACCOUNT_DELETION_SCHEMA_READINESS_MODEL_NOTE,
  };
}

export function getUnsafeAuthDeleteCascadeBlockers(): readonly string[] {
  const direct = UNSAFE_AUTH_DELETE_CASCADE_TABLES.map(
    (table) =>
      `${table} has NOT NULL author/user FK with ON DELETE CASCADE — auth.users must not be deleted before public rows are anonymized/detached.`
  );

  const storiesBlocker =
    "stories.user_id is NOT NULL — approved-story anonymization (user_id → NULL) cannot execute until schema migration.";

  const transitive = ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY.filter(
    (entry) => entry.classification === "UNSAFE_PRESERVED_DATA_LOSS"
  ).map((entry) => `${entry.id}: ${entry.currentBehavior}`);

  return [...direct, storiesBlocker, ...transitive];
}

export function getAuthDeleteBlastRadius(input: {
  schema: "current" | "hardened";
}): {
  directEffects: readonly string[];
  transitiveEffects: readonly string[];
  safeEffects: readonly string[];
  executionBlocked: boolean;
} {
  const unsafe = ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY.filter(
    (entry) => entry.classification === "UNSAFE_PRESERVED_DATA_LOSS"
  );

  const directEffects = ACCOUNT_DELETION_DIRECT_AUTH_FK_REGISTRY.map(
    (entry) =>
      `${entry.table}.${entry.column} ON DELETE ${entry.onDelete}${entry.executionNote ? ` — ${entry.executionNote}` : ""}`
  );

  const transitiveEffects =
    input.schema === "current"
      ? unsafe.map((entry) => entry.chain.join(" "))
      : unsafe
          .filter((entry) => !entry.requiredFutureBehavior)
          .map((entry) => entry.chain.join(" "));

  const safeEffects = ACCOUNT_DELETION_TRANSITIVE_CASCADE_REGISTRY.filter(
    (entry) =>
      entry.classification === "SAFE_SET_NULL" ||
      entry.classification === "EXPECTED_PRIVATE_CLEANUP"
  ).map((entry) => entry.currentBehavior);

  return {
    directEffects,
    transitiveEffects,
    safeEffects,
    executionBlocked: input.schema === "current" || !isSchemaExecutionReady(),
  };
}

export function getDatabaseMutationOrderHints(): readonly string[] {
  return [
    "1. verify live schema probe + static schema prerequisites before any destructive stage",
    "2. build fresh manifest, database plan, and storage plan from server-derived inventory",
    "3. transition approved → deletion_in_progress lock (write freeze active for target actor)",
    "4. revoke sessions BEFORE destructive database mutation",
    "5. post-lock inventory revalidation against fresh manifest",
    "6. staged database mutation: detach reports, anonymize public testimony, detach inbox sent copies, party-detach story_video_replies",
    "7. hard-delete private/account-owned rows after cross-user preservation checks",
    "8. execute storage cleanup using verified reference state",
    "9. hard-delete profile row after avatar references cleared in DB",
    "10. delete auth.users row LAST in final orchestrator after cascade blockers neutralized",
    "11. finalize account_deletion_requests → deleted with audit metadata",
  ];
}

export const ACCOUNT_DELETION_DATABASE_PLAN_INVARIANTS = [
  ACCOUNT_DELETION_STORY_CROSS_USER_INVARIANT,
  "Public testimony rows cannot be HARD_DELETE unless an explicit exceptional policy exists.",
  "Approved public stories (status = approved, removed_at IS NULL) cannot be HARD_DELETE.",
  "Previously public or removed stories (status = removed OR removed_at IS NOT NULL) cannot be HARD_DELETE — tombstone ANONYMIZE only.",
  "Never-published story HARD_DELETE requires evaluateNeverPublishedStoryDeletionEligibility() with complete server-derived child inventory.",
  "prayer_video_responses, prayer_written_responses, and prayer_updates cannot be HARD_DELETE.",
  "Public prayer response/update body text must be preserved — identity detach only.",
  "story_video_replies cross-user rows must use party-specific DETACH semantics — never whole-row HARD_DELETE merely because one party is the deletion target.",
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_FK_HARDENING_NOTE,
  "Surviving other-user Journey inbox rows cannot be HARD_DELETE.",
  "Audit and account_deletion_requests rows cannot be HARD_DELETE.",
  "Unknown tables or unresolved selectors become BLOCK_UNRESOLVED.",
  "Unsafe auth.users CASCADE on public content must block execution until neutralized.",
  "schemaExecutionReady must be true before destructive execution.",
  "PRESERVE/ANONYMIZE/DETACH/BLOCK_UNRESOLVED must not escalate to HARD_DELETE.",
  "Database plan targetUserId is server-derived from account_deletion_requests only.",
] as const;

export const ACCOUNT_DELETION_DATABASE_INVENTORY_NOTES = [
  "No dedicated notifications table — notification preferences live on profiles.*notify_* columns.",
  "No persisted AI rate-limit table — AI review metadata stored on stories/prayer_video_responses rows.",
  "No separate support/contact ticket table in public schema baseline.",
  "Auth session/device state lives in Supabase Auth — not public.profiles.",
  "Storage objects are planned separately in Phase 1D modules.",
  "story_video_replies exists in archive/dev only — not in Production baseline.",
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_FK_HARDENING_NOTE,
  "Non-public story HARD_DELETE may require future 1D storage cleanup rules for draft media — not implemented in 1D yet.",
  "Never-published HARD_DELETE uses story-level lifecycle + authoritative child inventory — not global bucket reclassification.",
  ACCOUNT_DELETION_SCHEMA_READINESS_MODEL_NOTE,
  `Phase 1E.2A hardening migration designed at ${ACCOUNT_DELETION_SCHEMA_HARDENING_MIGRATION.relativePath} — not applied until target-environment verification.`,
  ACCOUNT_DELETION_STORY_VIDEO_REPLIES_FK_DEFERRAL_NOTE,
] as const;

export function classifyUnknownDatabaseTable(
  table: string
): AccountDeletionDatabaseAction {
  return isKnownAccountDeletionDatabaseTable(table)
    ? "BLOCK_UNRESOLVED"
    : "BLOCK_UNRESOLVED";
}
