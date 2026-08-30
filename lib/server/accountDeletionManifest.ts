import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  describeAccountDeletionDryRunStatus,
  isAccountDeletionDryRunAllowedStatus,
  normalizeLegacyDeletionStatus,
  resolveDeletionRequestTargetUserId,
} from "../accountCenter/accountDeletionLifecycle";
import {
  ACCOUNT_DELETION_SCHEMA_REQUIREMENTS,
  BLOCKED_OWNER_ACCOUNT_CODE,
  STORY_ANONYMIZATION_PII_FIELDS,
  classifyStorageBucketAction,
  classifyTableAction,
  type AccountDeletionStorageBucket,
  type AccountDeletionTableAction,
} from "./accountDeletionPolicy";

export const ACCOUNT_DELETION_REQUEST_COLUMNS =
  "id, user_id, email, reason, status, created_at, target_user_id_snapshot, target_username_snapshot";

export type AccountDeletionRequestRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
  target_user_id_snapshot: string | null;
  target_username_snapshot: string | null;
};

export type ManifestRowRef = {
  table: string;
  id?: string;
  count: number;
  plannedAction: AccountDeletionTableAction;
  note?: string;
};

export type ManifestStorageObject = {
  bucket: string;
  path: string;
  ownershipSource: string;
  referencingTable?: string;
  referencingRowId?: string;
  plannedAction: "hard_delete" | "manual_review";
  exists: boolean | null;
};

export type ManifestStoryAnonymizationPlan = {
  storyId: string;
  status: string | null;
  storyType: string | null;
  fieldsToAnonymize: readonly string[];
  bodyTextPreserved: boolean;
};

export type ManifestJourneySection = {
  recipientOwnedRows: ManifestRowRef;
  sentToOtherUserRows: ManifestRowRef;
  privateMediaObjects: ManifestStorageObject[];
  relationshipNotes: string[];
};

export type AccountDeletionManifest = {
  identity: {
    requestId: string;
    targetUserId: string;
    username: string | null;
    displayName: string | null;
    email: string | null;
    requestStatus: string | null;
    requestCreatedAt: string | null;
    authUserExists: boolean | null;
    isOwner: boolean;
    isAdmin: boolean;
  };
  blocked: boolean;
  blockCode: typeof BLOCKED_OWNER_ACCOUNT_CODE | null;
  database: {
    hardDelete: ManifestRowRef[];
    anonymize: ManifestRowRef[];
    preserve: ManifestRowRef[];
    manualReview: ManifestRowRef[];
  };
  storage: {
    objects: ManifestStorageObject[];
  };
  journey: ManifestJourneySection;
  publicContent: {
    stories: ManifestStoryAnonymizationPlan[];
    profileFieldsToStrip: readonly string[];
  };
  audit: {
    retain: ManifestRowRef[];
    deletionRequestRetentionWarning: string;
  };
  warnings: string[];
  schemaRequirements: readonly string[];
  counts: {
    hardDeleteRows: number;
    anonymizeRows: number;
    preserveRows: number;
    manualReviewRows: number;
    storageObjects: number;
    unresolvedWarnings: number;
  };
};

export type AccountDeletionDryRunFailureCode =
  | "not_found"
  | "database_error"
  | "service_unavailable";

export type AccountDeletionDryRunResult =
  | { ok: true; manifest: AccountDeletionManifest }
  | {
      ok: false;
      code: AccountDeletionDryRunFailureCode;
      message: string;
    };

export type AccountDeletionDryRunDeps = {
  loadDeletionRequest: (
    requestId: string
  ) => Promise<AccountDeletionRequestRow | null>;
  loadProfile: (userId: string) => Promise<ProfileRow | null>;
  authUserExists: (userId: string) => Promise<boolean | null>;
  countRows: (
    table: string,
    column: string,
    value: string
  ) => Promise<number | null>;
  countBlockedUsers: (userId: string) => Promise<number | null>;
  countStoryVideoReplies: (userId: string) => Promise<number | null>;
  countInboxRecipientOwned: (userId: string) => Promise<number | null>;
  countInboxSentToOthers: (userId: string) => Promise<number | null>;
  countContentReportsForUser: (userId: string) => Promise<number | null>;
  countAdminLogsForUser: (userId: string) => Promise<number | null>;
  listStories: (userId: string) => Promise<StoryRow[]>;
  listInboxMediaReferences: (
    userId: string
  ) => Promise<InboxMediaReferenceRow[]>;
  listStorageObjectsForUser: (
    bucket: AccountDeletionStorageBucket,
    userId: string
  ) => Promise<StorageListEntry[] | null>;
  resolveStorageExists: (
    bucket: string,
    path: string
  ) => Promise<boolean | null>;
};

type ProfileRow = {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_owner: boolean;
  is_admin: boolean;
};

type StoryRow = {
  id: string;
  status: string | null;
  story_type: string | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
};

type InboxMediaReferenceRow = {
  id: string;
  user_id: string;
  sender_user_id: string | null;
  video_url: string | null;
  image_url: string | null;
};

type StorageListEntry = {
  path: string;
};

const STORAGE_BUCKETS: AccountDeletionStorageBucket[] = [
  "profile-avatars",
  "story-images",
  "story-videos",
  "story-thumbnails",
  "journey-private-media",
];

export const PROFILE_HARD_DELETE_PII_FIELDS = [
  "email",
  "display_name",
  "username",
  "real_name",
  "location",
  "avatar_url",
  "bio",
] as const;

export function parseStoragePathFromReference(
  value: string | null | undefined,
  bucket: string
): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("http")) {
    return null;
  }

  if (trimmed.includes(`${bucket}/`)) {
    const afterBucket = trimmed.split(`${bucket}/`)[1]?.split("?")[0];
    if (!afterBucket) {
      return null;
    }

    try {
      return decodeURIComponent(afterBucket);
    } catch {
      return afterBucket;
    }
  }

  if (trimmed.includes("/")) {
    return trimmed.replace(/^\/+/, "");
  }

  return null;
}

function buildRowRef(
  table: string,
  count: number,
  policyKey: Parameters<typeof classifyTableAction>[0],
  note?: string
): ManifestRowRef {
  return {
    table,
    count,
    plannedAction: classifyTableAction(policyKey),
    note,
  };
}

function pushByAction(
  target: AccountDeletionManifest["database"],
  row: ManifestRowRef
) {
  switch (row.plannedAction) {
    case "hard_delete":
      target.hardDelete.push(row);
      break;
    case "anonymize":
      target.anonymize.push(row);
      break;
    case "preserve":
    case "preserve_minimal":
      target.preserve.push(row);
      break;
    case "preserve_anonymized":
      target.anonymize.push(row);
      break;
    case "manual_review":
      target.manualReview.push(row);
      break;
    default:
      target.manualReview.push(row);
  }
}

function sumCounts(rows: ManifestRowRef[]): number {
  return rows.reduce((total, row) => total + row.count, 0);
}

function storageActionForBucket(
  bucket: string,
  ownershipSource: string
): "hard_delete" | "manual_review" {
  if (ownershipSource === "ambiguous_reference") {
    return "manual_review";
  }

  if (
    bucket === "profile-avatars" ||
    bucket === "story-images" ||
    bucket === "story-videos" ||
    bucket === "story-thumbnails" ||
    bucket === "journey-private-media"
  ) {
    return classifyStorageBucketAction(bucket);
  }

  return "manual_review";
}

export async function buildAccountDeletionDryRunManifest(
  requestId: string,
  deps: AccountDeletionDryRunDeps
): Promise<AccountDeletionDryRunResult> {
  const request = await deps.loadDeletionRequest(requestId);
  if (!request) {
    return {
      ok: false,
      code: "not_found",
      message: "That account deletion request could not be found.",
    };
  }

  const targetUserId = resolveDeletionRequestTargetUserId({
    user_id: request.user_id,
    target_user_id_snapshot: request.target_user_id_snapshot,
  });

  if (!targetUserId) {
    return {
      ok: false,
      code: "not_found",
      message:
        "That account deletion request has no resolvable target user identity.",
    };
  }

  const warnings: string[] = [];
  const database: AccountDeletionManifest["database"] = {
    hardDelete: [],
    anonymize: [],
    preserve: [],
    manualReview: [],
  };

  const normalizedStatus = normalizeLegacyDeletionStatus(request.status);
  const dryRunStatusNote = describeAccountDeletionDryRunStatus(request.status);
  if (dryRunStatusNote) {
    warnings.push(dryRunStatusNote);
  } else if (
    normalizedStatus &&
    !isAccountDeletionDryRunAllowedStatus(normalizedStatus)
  ) {
    warnings.push(
      `Status '${normalizedStatus}' is outside the standard dry-run planning set.`
    );
  }

  const profile = await deps.loadProfile(targetUserId);
  if (!profile) {
    warnings.push("No profile row found for target user_id.");
  }

  const isOwner = profile?.is_owner ?? false;
  const isAdmin = profile?.is_admin ?? false;
  const blocked = isOwner;
  const blockCode = isOwner ? BLOCKED_OWNER_ACCOUNT_CODE : null;

  if (isAdmin) {
    warnings.push(
      "Target profile is marked is_admin=true — explicit policy review required before any future permanent deletion."
    );
  }

  const authUserExists = await deps.authUserExists(targetUserId);
  if (authUserExists === false) {
    warnings.push("Supabase Auth user was not found for target user_id.");
    if (profile) {
      warnings.push(
        "profiles without matching auth.users row — orphan profile would require explicit cleanup."
      );
    }
  } else if (authUserExists === null) {
    warnings.push("Auth user existence could not be verified.");
  }

  if (profile && authUserExists === true) {
    // FK diagnostic only — profiles.id is not FK-linked to auth.users in schema.
    warnings.push(
      "Schema gap: profiles.id is not FK-constrained to auth.users despite both existing for this target."
    );
  }

  pushByAction(
    database,
    buildRowRef("profiles", profile ? 1 : 0, "profiles")
  );

  const stories = await deps.listStories(targetUserId);
  if (stories.length > 0 && authUserExists === true) {
    warnings.push(
      "Schema gap: stories.user_id has no FK to auth.users — story anonymization must be explicit during execution."
    );
  }

  pushByAction(
    database,
    buildRowRef("stories", stories.length, "stories")
  );

  const tableCounts: Array<{
    table: string;
    policyKey: Parameters<typeof classifyTableAction>[0];
    count: number | null;
    column: string;
  }> = [
    {
      table: "prayer_video_responses",
      policyKey: "prayer_video_responses",
      count: await deps.countRows(
        "prayer_video_responses",
        "user_id",
        targetUserId
      ),
      column: "user_id",
    },
    {
      table: "prayer_written_responses",
      policyKey: "prayer_written_responses",
      count: await deps.countRows(
        "prayer_written_responses",
        "author_user_id",
        targetUserId
      ),
      column: "author_user_id",
    },
    {
      table: "prayer_updates",
      policyKey: "prayer_updates",
      count: await deps.countRows(
        "prayer_updates",
        "author_user_id",
        targetUserId
      ),
      column: "author_user_id",
    },
    {
      table: "story_reactions",
      policyKey: "story_reactions",
      count: await deps.countRows("story_reactions", "user_id", targetUserId),
      column: "user_id",
    },
    {
      table: "saved_content",
      policyKey: "saved_content",
      count: await deps.countRows("saved_content", "user_id", targetUserId),
      column: "user_id",
    },
    {
      table: "prayer_follows",
      policyKey: "prayer_follows",
      count: await deps.countRows("prayer_follows", "user_id", targetUserId),
      column: "user_id",
    },
    {
      table: "prayer_search_preferences",
      policyKey: "prayer_search_preferences",
      count: await deps.countRows(
        "prayer_search_preferences",
        "user_id",
        targetUserId
      ),
      column: "user_id",
    },
  ];

  for (const entry of tableCounts) {
    if (entry.count === null) {
      warnings.push(`Could not count rows in ${entry.table}.`);
      pushByAction(
        database,
        buildRowRef(entry.table, 0, entry.policyKey, "count_unavailable")
      );
      continue;
    }

    pushByAction(
      database,
      buildRowRef(entry.table, entry.count, entry.policyKey)
    );
  }

  const storyVideoReplyCount = await deps.countStoryVideoReplies(targetUserId);
  if (storyVideoReplyCount === null) {
    warnings.push("Could not count story_video_replies rows.");
  }
  pushByAction(
    database,
    buildRowRef(
      "story_video_replies",
      storyVideoReplyCount ?? 0,
      "story_video_replies",
      "user_id or recipient_user_id = target"
    )
  );

  const blockedCount = await deps.countBlockedUsers(targetUserId);
  if (blockedCount === null) {
    warnings.push("Could not count blocked_users rows.");
    pushByAction(
      database,
      buildRowRef("blocked_users", 0, "blocked_users", "count_unavailable")
    );
  } else {
    pushByAction(
      database,
      buildRowRef("blocked_users", blockedCount, "blocked_users")
    );
  }

  const recipientInboxCount = await deps.countInboxRecipientOwned(targetUserId);
  const sentInboxCount = await deps.countInboxSentToOthers(targetUserId);

  if (recipientInboxCount === null || sentInboxCount === null) {
    warnings.push("Could not count inbox_messages rows.");
  }

  pushByAction(
    database,
    buildRowRef(
      "inbox_messages",
      recipientInboxCount ?? 0,
      "inbox_messages_recipient_owned",
      "user_id = target (recipient-owned copy)"
    )
  );

  pushByAction(
    database,
    buildRowRef(
      "inbox_messages",
      sentInboxCount ?? 0,
      "inbox_messages_sent_to_other_user",
      "sender_user_id = target in another user's inbox (preserve + anonymize sender)"
    )
  );

  const reportCount = await deps.countContentReportsForUser(targetUserId);
  if (reportCount === null) {
    warnings.push("Could not count content_reports rows.");
  } else if (reportCount > 0) {
    warnings.push(
      "Schema gap: content_reports.reported_user_id has no FK — reported UUID may remain stale unless cleared during execution."
    );
  }
  pushByAction(
    database,
    buildRowRef(
      "content_reports",
      reportCount ?? 0,
      "content_reports",
      "reporter and reported references retained per moderation policy"
    )
  );

  const adminLogCount = await deps.countAdminLogsForUser(targetUserId);
  if (adminLogCount === null) {
    warnings.push("Could not count admin_action_logs rows.");
  }
  pushByAction(
    database,
    buildRowRef("admin_action_logs", adminLogCount ?? 0, "admin_action_logs")
  );

  pushByAction(
    database,
    buildRowRef(
      "account_deletion_requests",
      1,
      "account_deletion_requests",
      "current request row; ON DELETE CASCADE on auth.users — snapshot before execution"
    )
  );

  const storageObjects: ManifestStorageObject[] = [];
  const seenStorageKeys = new Set<string>();

  async function addStorageObject(
    object: Omit<ManifestStorageObject, "exists"> & { exists?: boolean | null }
  ) {
    const key = `${object.bucket}:${object.path}`;
    if (seenStorageKeys.has(key)) {
      return;
    }

    seenStorageKeys.add(key);
    storageObjects.push({
      ...object,
      exists:
        object.exists === undefined
          ? await deps.resolveStorageExists(object.bucket, object.path)
          : object.exists,
    });
  }

  for (const bucket of STORAGE_BUCKETS) {
    const listed = await deps.listStorageObjectsForUser(bucket, targetUserId);
    if (listed === null) {
      warnings.push(`Could not list storage objects for bucket ${bucket}.`);
      continue;
    }

    for (const entry of listed) {
      const ownershipSource = entry.path.startsWith(`${targetUserId}/`)
        ? `path_prefix:${targetUserId}`
        : "ambiguous_reference";

      await addStorageObject({
        bucket,
        path: entry.path,
        ownershipSource,
        plannedAction: storageActionForBucket(bucket, ownershipSource),
      });
    }
  }

  if (profile?.avatar_url) {
    const avatarPath = parseStoragePathFromReference(
      profile.avatar_url,
      "profile-avatars"
    );
    if (avatarPath) {
      await addStorageObject({
        bucket: "profile-avatars",
        path: avatarPath,
        ownershipSource: "profiles.avatar_url",
        referencingTable: "profiles",
        referencingRowId: profile.id,
        plannedAction: "hard_delete",
      });
    } else if (!profile.avatar_url.startsWith("http")) {
      await addStorageObject({
        bucket: "profile-avatars",
        path: profile.avatar_url,
        ownershipSource: "ambiguous_reference",
        referencingTable: "profiles",
        referencingRowId: profile.id,
        plannedAction: "manual_review",
        exists: null,
      });
    }
  }

  for (const story of stories) {
    const refs: Array<{
      bucket: AccountDeletionStorageBucket;
      url: string | null;
    }> = [
      { bucket: "story-images", url: story.image_url },
      { bucket: "story-videos", url: story.video_url },
      { bucket: "story-thumbnails", url: story.thumbnail_url },
    ];

    for (const ref of refs) {
      if (!ref.url) {
        continue;
      }

      const path = parseStoragePathFromReference(ref.url, ref.bucket);
      if (!path) {
        if (!ref.url.startsWith("http")) {
          await addStorageObject({
            bucket: ref.bucket,
            path: ref.url,
            ownershipSource: "ambiguous_reference",
            referencingTable: "stories",
            referencingRowId: story.id,
            plannedAction: "manual_review",
            exists: null,
          });
        }
        continue;
      }

      const ownershipSource = path.startsWith(`${targetUserId}/`)
        ? `path_prefix:${targetUserId}`
        : `stories.${ref.bucket}_url`;

      await addStorageObject({
        bucket: ref.bucket,
        path,
        ownershipSource,
        referencingTable: "stories",
        referencingRowId: story.id,
        plannedAction: storageActionForBucket(ref.bucket, ownershipSource),
      });
    }
  }

  const inboxMediaRefs = await deps.listInboxMediaReferences(targetUserId);
  for (const row of inboxMediaRefs) {
    for (const mediaUrl of [row.video_url, row.image_url]) {
      if (!mediaUrl) {
        continue;
      }

      const path = parseStoragePathFromReference(
        mediaUrl,
        "journey-private-media"
      );
      const ownershipSource =
        row.user_id === targetUserId
          ? "inbox_messages.user_id (recipient-owned)"
          : row.sender_user_id === targetUserId
            ? "inbox_messages.sender_user_id (sent copy in other inbox)"
            : "ambiguous_reference";

      if (path) {
        await addStorageObject({
          bucket: "journey-private-media",
          path,
          ownershipSource,
          referencingTable: "inbox_messages",
          referencingRowId: row.id,
          plannedAction:
            ownershipSource === "ambiguous_reference"
              ? "manual_review"
              : "hard_delete",
        });
      } else if (mediaUrl.includes("journey-private-media")) {
        await addStorageObject({
          bucket: "journey-private-media",
          path: mediaUrl,
          ownershipSource: "ambiguous_reference",
          referencingTable: "inbox_messages",
          referencingRowId: row.id,
          plannedAction: "manual_review",
          exists: null,
        });
      }
    }
  }

  const publicContent: AccountDeletionManifest["publicContent"] = {
    stories: stories.map((story) => ({
      storyId: story.id,
      status: story.status,
      storyType: story.story_type,
      fieldsToAnonymize: STORY_ANONYMIZATION_PII_FIELDS,
      bodyTextPreserved: true,
    })),
    profileFieldsToStrip: PROFILE_HARD_DELETE_PII_FIELDS,
  };

  const journey: ManifestJourneySection = {
    recipientOwnedRows: buildRowRef(
      "inbox_messages",
      recipientInboxCount ?? 0,
      "inbox_messages_recipient_owned"
    ),
    sentToOtherUserRows: buildRowRef(
      "inbox_messages",
      sentInboxCount ?? 0,
      "inbox_messages_sent_to_other_user"
    ),
    privateMediaObjects: storageObjects.filter(
      (object) => object.bucket === "journey-private-media"
    ),
    relationshipNotes: [
      "Recipient-owned inbox_messages.user_id rows would CASCADE on auth delete.",
      "Sent messages in other users' inboxes keep rows with sender_user_id SET NULL on auth delete.",
      "inbox_messages.parent_message_id uses ON DELETE SET NULL — surviving thread integrity preserved.",
    ],
  };

  const auditRetain: ManifestRowRef[] = [
    buildRowRef("admin_action_logs", adminLogCount ?? 0, "admin_action_logs"),
    buildRowRef("content_reports", reportCount ?? 0, "content_reports"),
    buildRowRef(
      "account_deletion_requests",
      1,
      "account_deletion_requests",
      "snapshot required before auth delete due to ON DELETE CASCADE"
    ),
  ];

  const manifest: AccountDeletionManifest = {
    identity: {
      requestId: request.id,
      targetUserId,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? null,
      email: request.email ?? profile?.email ?? null,
      requestStatus: request.status,
      requestCreatedAt: request.created_at,
      authUserExists,
      isOwner,
      isAdmin,
    },
    blocked,
    blockCode,
    database,
    storage: { objects: storageObjects },
    journey,
    publicContent,
    audit: {
      retain: auditRetain,
      deletionRequestRetentionWarning:
        "account_deletion_requests row is retained after auth deletion via user_id ON DELETE SET NULL and target_user_id_snapshot.",
    },
    warnings,
    schemaRequirements: ACCOUNT_DELETION_SCHEMA_REQUIREMENTS,
    counts: {
      hardDeleteRows: sumCounts(database.hardDelete),
      anonymizeRows: sumCounts(database.anonymize),
      preserveRows: sumCounts(database.preserve),
      manualReviewRows: sumCounts(database.manualReview),
      storageObjects: storageObjects.length,
      unresolvedWarnings: warnings.length + (blocked ? 1 : 0),
    },
  };

  return { ok: true, manifest };
}

async function listBucketPrefixRecursive(
  client: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<StorageListEntry[]> {
  const { data, error } = await client.storage.from(bucket).list(prefix, {
    limit: 1000,
  });

  if (error) {
    return [];
  }

  const entries: StorageListEntry[] = [];

  for (const item of data ?? []) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.id) {
      entries.push({ path: itemPath });
      continue;
    }

    const nested = await listBucketPrefixRecursive(client, bucket, itemPath);
    entries.push(...nested);
  }

  return entries;
}

export function createAccountDeletionDryRunDeps(
  serviceRoleClient: SupabaseClient
): AccountDeletionDryRunDeps {
  return {
    async loadDeletionRequest(requestId) {
      const { data, error } = await serviceRoleClient
        .from("account_deletion_requests")
        .select(ACCOUNT_DELETION_REQUEST_COLUMNS)
        .eq("id", requestId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as AccountDeletionRequestRow;
    },

    async loadProfile(userId) {
      const { data, error } = await serviceRoleClient
        .from("profiles")
        .select(
          "id, email, username, display_name, avatar_url, is_owner, is_admin"
        )
        .eq("id", userId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as ProfileRow;
    },

    async authUserExists(userId) {
      const { data, error } =
        await serviceRoleClient.auth.admin.getUserById(userId);

      if (error) {
        return null;
      }

      return Boolean(data.user);
    },

    async countRows(table, column, value) {
      const { count, error } = await serviceRoleClient
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, value);

      if (error) {
        return null;
      }

      return count ?? 0;
    },

    async countBlockedUsers(userId) {
      const [asBlocker, asBlocked] = await Promise.all([
        serviceRoleClient
          .from("blocked_users")
          .select("*", { count: "exact", head: true })
          .eq("blocker_user_id", userId),
        serviceRoleClient
          .from("blocked_users")
          .select("*", { count: "exact", head: true })
          .eq("blocked_user_id", userId),
      ]);

      if (asBlocker.error || asBlocked.error) {
        return null;
      }

      return (asBlocker.count ?? 0) + (asBlocked.count ?? 0);
    },

    async countStoryVideoReplies(userId) {
      const [asAuthor, asRecipient] = await Promise.all([
        serviceRoleClient
          .from("story_video_replies")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),
        serviceRoleClient
          .from("story_video_replies")
          .select("*", { count: "exact", head: true })
          .eq("recipient_user_id", userId),
      ]);

      if (asAuthor.error || asRecipient.error) {
        return null;
      }

      return (asAuthor.count ?? 0) + (asRecipient.count ?? 0);
    },

    async countInboxRecipientOwned(userId) {
      return this.countRows("inbox_messages", "user_id", userId);
    },

    async countInboxSentToOthers(userId) {
      const { count, error } = await serviceRoleClient
        .from("inbox_messages")
        .select("*", { count: "exact", head: true })
        .eq("sender_user_id", userId)
        .neq("user_id", userId);

      if (error) {
        return null;
      }

      return count ?? 0;
    },

    async countContentReportsForUser(userId) {
      const [asReporter, asReported] = await Promise.all([
        serviceRoleClient
          .from("content_reports")
          .select("*", { count: "exact", head: true })
          .eq("reporter_user_id", userId),
        serviceRoleClient
          .from("content_reports")
          .select("*", { count: "exact", head: true })
          .eq("reported_user_id", userId),
      ]);

      if (asReporter.error || asReported.error) {
        return null;
      }

      return (asReporter.count ?? 0) + (asReported.count ?? 0);
    },

    async countAdminLogsForUser(userId) {
      const [asActor, asTarget] = await Promise.all([
        serviceRoleClient
          .from("admin_action_logs")
          .select("*", { count: "exact", head: true })
          .eq("actor_user_id", userId),
        serviceRoleClient
          .from("admin_action_logs")
          .select("*", { count: "exact", head: true })
          .eq("target_user_id", userId),
      ]);

      if (asActor.error || asTarget.error) {
        return null;
      }

      return (asActor.count ?? 0) + (asTarget.count ?? 0);
    },

    async listStories(userId) {
      const { data, error } = await serviceRoleClient
        .from("stories")
        .select("id, status, story_type, image_url, video_url, thumbnail_url")
        .eq("user_id", userId);

      if (error || !Array.isArray(data)) {
        return [];
      }

      return data as StoryRow[];
    },

    async listInboxMediaReferences(userId) {
      const [recipientRows, senderRows] = await Promise.all([
        serviceRoleClient
          .from("inbox_messages")
          .select("id, user_id, sender_user_id, video_url, image_url")
          .eq("user_id", userId)
          .or("video_url.not.is.null,image_url.not.is.null"),
        serviceRoleClient
          .from("inbox_messages")
          .select("id, user_id, sender_user_id, video_url, image_url")
          .eq("sender_user_id", userId)
          .neq("user_id", userId)
          .or("video_url.not.is.null,image_url.not.is.null"),
      ]);

      if (recipientRows.error || senderRows.error) {
        return [];
      }

      const byId = new Map<string, InboxMediaReferenceRow>();
      for (const row of [...(recipientRows.data ?? []), ...(senderRows.data ?? [])]) {
        byId.set(row.id, row as InboxMediaReferenceRow);
      }

      return [...byId.values()];
    },

    async listStorageObjectsForUser(bucket, userId) {
      try {
        const entries = await listBucketPrefixRecursive(
          serviceRoleClient,
          bucket,
          userId
        );
        return entries;
      } catch {
        return null;
      }
    },

    async resolveStorageExists(bucket, path) {
      const parts = path.split("/");
      const fileName = parts.pop();
      const folder = parts.join("/");

      if (!fileName) {
        return null;
      }

      const { data, error } = await serviceRoleClient.storage
        .from(bucket)
        .list(folder || undefined, { search: fileName, limit: 1 });

      if (error) {
        return null;
      }

      return (data ?? []).some((item) => item.name === fileName);
    },
  };
}

export async function verifyAdminForAccountDeletionDryRun(
  accessToken: string
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }

  const scopedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const { data, error } = await scopedClient.rpc("current_user_is_admin");
  return !error && data === true;
}

export function sanitizeManifestForResponse(
  manifest: AccountDeletionManifest
): AccountDeletionManifest {
  return manifest;
}
