/**
 * Real PostgreSQL helpers for profile stage integration (3B.4A).
 * Privileged postgres setup is used only to reach storage_completed before
 * orchestrator/profile wiring exists — lifecycle RPCs remain authoritative.
 */

import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { runAccountDeletionStorageStageTick } from "./accountDeletionStorageStageRunner";
import {
  asAuthenticatedOwner,
  asServiceRole,
  cleanupRunnerIntegration,
  createPgBackedStorageExecutor,
  createPgSupabaseShim,
  getAttemptStage,
  RUNNER_IT_OTHER,
  RUNNER_IT_OWNER,
  RUNNER_IT_TARGET,
  RUNNER_IT_THREAD,
  seedApprovedAttemptAtInventory,
  seedDeletePrivateJourneyFixturesBeforeAcquisition,
  seedRunnerIntegrationUsers,
  verifyRunnerIntegrationReadiness,
  type RpcPayload,
} from "./accountDeletionStorageStageRunner.integrationHarness";

export {
  RUNNER_IT_TARGET,
  RUNNER_IT_OTHER,
  RUNNER_IT_OWNER,
  asServiceRole,
  isDedicatedVanillaIntegrationDb,
  seedRunnerIntegrationUsers,
} from "./accountDeletionStorageStageRunner.integrationHarness";

export const PROFILE_IT_STORY = "ffffffff-ffff-4fff-8fff-ffffffffffff";
export const PROFILE_IT_UNRELATED_BLOCKER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

export const PROFILE_SYNTHETIC = {
  email: "target-profile-pii@example.test",
  displayName: "Profile Display PII",
  username: "profile_pii_user",
  realName: "Real Name PII",
  location: "90210 Radiusville",
  bio: "Bio PII secret phrase",
  avatarPath: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/avatar.png",
  avatarUrl:
    "https://example.supabase.co/storage/v1/object/public/profile-avatars/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/avatar.png",
} as const;

/**
 * Asserts Production migration privilege sealing before test-only widening grants.
 * Must run immediately after applyAccountDeletionMigrations().
 */
export async function assertFreshMigrationProfileHelperPrivileges(client: Client) {
  const rows = await client.query<{ fn: string; service_role_execute: boolean }>(`
    SELECT fn, pg_catalog.has_function_privilege('service_role', fn, 'EXECUTE') AS service_role_execute
    FROM (
      VALUES
        ('public.prepare_account_deletion_profile_stage(uuid, uuid)'::text),
        ('public.account_deletion_profile_cleanup_snapshot(uuid, uuid)'::text),
        ('public.account_deletion_profile_execution_context_is_valid()'::text),
        ('public.account_deletion_profile_username_scrub_authorized(uuid, text)'::text),
        ('public.account_deletion_profile_private_row_delete_authorized(uuid)'::text),
        ('public.account_deletion_profile_recipient_inbox_delete_authorized(public.inbox_messages)'::text),
        ('public.account_deletion_scrubbed_profile_email(uuid)'::text),
        ('public.account_deletion_scrubbed_profile_username(uuid)'::text),
        ('public.account_deletion_profile_username_is_deletion_tombstone_namespace(text)'::text)
    ) AS listed(fn)
  `);
  for (const row of rows.rows) {
    const prepare =
      row.fn === "public.prepare_account_deletion_profile_stage(uuid, uuid)";
    if (prepare && !row.service_role_execute) {
      throw new Error(`expected service_role EXECUTE on ${row.fn}`);
    }
    if (!prepare && row.service_role_execute) {
      throw new Error(`expected service_role EXECUTE revoked on ${row.fn}`);
    }
  }
}

/** Test-only grants after assertFreshMigrationProfileHelperPrivileges(). */
export async function ensureProfileIntegrationGrants(client: Client) {
  await client.query(`
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  `);
}

export async function cleanupProfileIntegration(client: Client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // ignore
  }
  await client.query(`
    TRUNCATE TABLE
      public.account_deletion_storage_execution_audit,
      public.account_deletion_storage_execution_results,
      public.account_deletion_storage_preservation_holds,
      public.account_deletion_storage_manifest,
      public.account_deletion_storage_manifest_capture,
      public.account_deletion_story_freeze_scope,
      public.account_deletion_database_execution_context,
      public.story_reactions,
      public.saved_content,
      public.prayer_follows,
      public.prayer_search_preferences,
      public.blocked_users,
      public.inbox_messages,
      public.prayer_updates,
      public.prayer_written_responses,
      public.prayer_video_responses,
      public.story_video_replies,
      public.stories,
      public.account_deletion_execution_attempts,
      public.account_deletion_requests,
      public.profiles
    RESTART IDENTITY CASCADE
  `);
  await client.query(`DELETE FROM storage.objects`);
  await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [
    [RUNNER_IT_TARGET, RUNNER_IT_OTHER, RUNNER_IT_OWNER, PROFILE_IT_UNRELATED_BLOCKER],
  ]);
}

export async function seedSyntheticTargetProfile(client: Client) {
  /** Privileged test-only: synthetic PII including an established username for scrub coverage. */
  await client.query(
    `INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
    [RUNNER_IT_TARGET, PROFILE_SYNTHETIC.email]
  );
  await client.query(
    `INSERT INTO public.profiles (
      id, email, username, display_name, real_name, location, bio, avatar_url,
      deletion_requested_at, journey_focus, show_location, show_real_name,
      allow_prayer_notifications, allow_story_notifications,
      notify_replies, notify_prayers, notify_praise, notify_journey_updates, notify_email_updates,
      allow_video_responses, allow_prayer_messages, allow_journey_messages,
      is_owner, is_admin, username_changed_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,
      now(),'prayer',true,true,
      true,true,
      true,true,true,true,true,
      true,true,true,
      false,false, now() - interval '31 days'
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      username = EXCLUDED.username,
      display_name = EXCLUDED.display_name,
      real_name = EXCLUDED.real_name,
      location = EXCLUDED.location,
      bio = EXCLUDED.bio,
      avatar_url = EXCLUDED.avatar_url,
      deletion_requested_at = EXCLUDED.deletion_requested_at,
      journey_focus = EXCLUDED.journey_focus,
      show_location = EXCLUDED.show_location,
      show_real_name = EXCLUDED.show_real_name,
      allow_prayer_notifications = EXCLUDED.allow_prayer_notifications,
      allow_story_notifications = EXCLUDED.allow_story_notifications,
      notify_replies = EXCLUDED.notify_replies,
      notify_prayers = EXCLUDED.notify_prayers,
      notify_praise = EXCLUDED.notify_praise,
      notify_journey_updates = EXCLUDED.notify_journey_updates,
      notify_email_updates = EXCLUDED.notify_email_updates,
      allow_video_responses = EXCLUDED.allow_video_responses,
      allow_prayer_messages = EXCLUDED.allow_prayer_messages,
      allow_journey_messages = EXCLUDED.allow_journey_messages,
      username_changed_at = EXCLUDED.username_changed_at`,
    [
      RUNNER_IT_TARGET,
      PROFILE_SYNTHETIC.email,
      PROFILE_SYNTHETIC.username,
      PROFILE_SYNTHETIC.displayName,
      PROFILE_SYNTHETIC.realName,
      PROFILE_SYNTHETIC.location,
      PROFILE_SYNTHETIC.bio,
      PROFILE_SYNTHETIC.avatarUrl,
    ]
  );
  await client.query(
    `UPDATE public.profiles SET is_owner = true, is_admin = true WHERE id = $1`,
    [RUNNER_IT_OWNER]
  );
  await client.query(
    `INSERT INTO storage.objects (bucket_id, name, owner)
     VALUES ('profile-avatars', $1, $2) ON CONFLICT DO NOTHING`,
    [PROFILE_SYNTHETIC.avatarPath, RUNNER_IT_TARGET]
  );
}

export async function seedCompanionUsers(client: Client) {
  await client.query(
    `INSERT INTO auth.users (id, email) VALUES
      ($1,'other@test'),($2,'owner@test'),($3,'unrelated@test')
     ON CONFLICT DO NOTHING`,
    [RUNNER_IT_OTHER, RUNNER_IT_OWNER, PROFILE_IT_UNRELATED_BLOCKER]
  );
  await client.query(
    `INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
     VALUES ($1,'other@test','other_user','Other',false,false),
            ($2,'owner@test','owner_user','Owner',false,false),
            ($3,'unrelated@test','unrelated_user','Unrelated',false,false)
     ON CONFLICT (id) DO NOTHING`,
    [RUNNER_IT_OTHER, RUNNER_IT_OWNER, PROFILE_IT_UNRELATED_BLOCKER]
  );
}

export type ProfilePrivateSeed = {
  inboxRecipientOwned?: boolean;
  inboxSurvivorFromTarget?: boolean;
  reactions?: boolean;
  saved?: boolean;
  follows?: boolean;
  searchPrefs?: boolean;
  blocks?: boolean;
  deletePrivateJourneyCount?: number;
};

export async function seedPrivateAccountDataBeforeAcquisition(
  client: Client,
  seed: ProfilePrivateSeed = {}
) {
  if (seed.inboxRecipientOwned ?? true) {
    await client.query(
      `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body)
       VALUES ($1,$2,$2,'Recipient owned','Target inbox body')`,
      [randomUUID(), RUNNER_IT_TARGET]
    );
  }
  if (seed.inboxSurvivorFromTarget ?? true) {
    await client.query(
      `INSERT INTO public.inbox_messages (id, user_id, sender_user_id, title, body)
       VALUES ($1,$2,$3,'From target','Survivor inbox from target sender')`,
      [randomUUID(), RUNNER_IT_OTHER, RUNNER_IT_TARGET]
    );
  }

  await client.query(
    `INSERT INTO public.stories (id, user_id, name, email, story_text, status)
     VALUES ($1,$2,'Shared','shared@test','Shared story body','approved')
     ON CONFLICT (id) DO NOTHING`,
    [PROFILE_IT_STORY, RUNNER_IT_OTHER]
  );

  if (seed.reactions ?? true) {
    await client.query(
      `INSERT INTO public.story_reactions (story_id, user_id, reaction_type)
       VALUES ($1,$2,'amen'),($1,$3,'amen')`,
      [PROFILE_IT_STORY, RUNNER_IT_TARGET, RUNNER_IT_OTHER]
    );
  }
  if (seed.saved ?? true) {
    await client.query(
      `INSERT INTO public.saved_content (user_id, story_id)
       VALUES ($1,$2),($3,$2)`,
      [RUNNER_IT_TARGET, PROFILE_IT_STORY, RUNNER_IT_OTHER]
    );
  }
  if (seed.follows ?? true) {
    await client.query(
      `INSERT INTO public.prayer_follows (user_id, story_id)
       VALUES ($1,$2),($3,$2)`,
      [RUNNER_IT_TARGET, PROFILE_IT_STORY, RUNNER_IT_OTHER]
    );
  }
  if (seed.searchPrefs ?? true) {
    await client.query(
      `INSERT INTO public.prayer_search_preferences (user_id, preferences)
       VALUES ($1,'{"zip":"90210","radiusMiles":25}'::jsonb),
              ($2,'{"zip":"10001","radiusMiles":10}'::jsonb)`,
      [RUNNER_IT_TARGET, RUNNER_IT_OTHER]
    );
  }
  if (seed.blocks ?? true) {
    await client.query(
      `INSERT INTO public.blocked_users (blocker_user_id, blocked_user_id)
       VALUES ($1,$2),($2,$1),($3,$1),($3,$2)`,
      [RUNNER_IT_TARGET, RUNNER_IT_OTHER, PROFILE_IT_UNRELATED_BLOCKER]
    );
  }

  const deletePrivateCount = seed.deletePrivateJourneyCount ?? 0;
  if (deletePrivateCount > 0) {
    await seedDeletePrivateJourneyFixturesBeforeAcquisition(client, {
      deletePrivateCount,
    });
  }
}

export async function seedSharedPublicContentBeforeAcquisition(client: Client) {
  await client.query(
    `INSERT INTO public.stories (
      id, user_id, name, email, location, story_text, video_url, status
    ) VALUES (
      $1,$2,'Target Author',$3,'City','Public shared story',
      'story-videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/shared.mp4','approved'
    )`,
    [PROFILE_IT_STORY, RUNNER_IT_TARGET, PROFILE_SYNTHETIC.email]
  );
  await client.query(
    `INSERT INTO public.story_video_replies (
      id, story_id, user_id, recipient_user_id, message, deleted_by_sender, deleted_by_recipient
    ) VALUES ($1,$2,$3,$4,'Shared reply preserved',false,false)`,
    [randomUUID(), PROFILE_IT_STORY, RUNNER_IT_TARGET, RUNNER_IT_OTHER]
  );
  await client.query(
    `INSERT INTO public.prayer_video_responses (
      id, story_id, user_id, video_url, body, status
    ) VALUES ($1,$2,$3,'story-videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/prayer.mp4','Prayer body','approved')`,
    [randomUUID(), PROFILE_IT_STORY, RUNNER_IT_TARGET]
  );
}

async function initStorageResultsAtDatabaseCompleted(
  client: Client,
  requestId: string,
  attemptId: string
) {
  return asServiceRole<RpcPayload>(
    client,
    `SELECT public.initialize_account_deletion_storage_execution_results($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
}

async function runStorageTicksToCompletion(
  client: Client,
  requestId: string,
  attemptId: string,
  options: { deletePrivateCount?: number } = {}
) {
  const execute =
    (options.deletePrivateCount ?? 0) > 0
      ? createPgBackedStorageExecutor(client, "deleted")
      : undefined;
  for (let i = 0; i < 8; i += 1) {
    const tick = await runAccountDeletionStorageStageTick({
      requestId,
      attemptId,
      deps: {
        serviceRoleClient: createPgSupabaseShim(client),
        verifyRunnerReadiness: () => verifyRunnerIntegrationReadiness(client),
        isPhysicalStorageExecutionEnabled: () => (options.deletePrivateCount ?? 0) > 0,
        executeStorageObject: execute,
      },
    });
    if (tick.code === "storage_completed") {
      return tick;
    }
    if (tick.code === "precondition_failed" || tick.code === "blocked") {
      throw new Error(`storage tick stalled: ${tick.code}`);
    }
  }
  throw new Error("storage tick did not reach storage_completed");
}

export type StorageCompletedFixture = {
  requestId: string;
  attemptId: string;
};

/**
 * Legitimate lifecycle: inventory → capture → DB stage → storage → storage_completed.
 * Test-only: companion users/profiles seeded with postgres; deletion RPCs are real.
 */
export async function driveLifecycleToStorageCompleted(
  client: Client,
  options: {
    privateSeed?: ProfilePrivateSeed;
    sharedPublicStory?: boolean;
    deletePrivateCount?: number;
    deferProfileHold?: boolean;
  } = {}
): Promise<StorageCompletedFixture> {
  await cleanupProfileIntegration(client);
  await seedRunnerIntegrationUsers(client);
  await seedCompanionUsers(client);
  await seedSyntheticTargetProfile(client);

  if (options.sharedPublicStory) {
    await seedSharedPublicContentBeforeAcquisition(client);
  }

  await seedPrivateAccountDataBeforeAcquisition(client, {
    ...options.privateSeed,
    deletePrivateJourneyCount: options.deletePrivateCount ?? 0,
  });

  const requestId = randomUUID();
  const attemptId = await seedApprovedAttemptAtInventory(client, requestId);

  const captured = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.capture_account_deletion_storage_manifest($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
  if (captured.ok !== true) {
    throw new Error(`capture failed: ${String(captured.code)}`);
  }

  const dbStage = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
  if (dbStage.ok !== true) {
    throw new Error(`database stage failed: ${String(dbStage.code)}`);
  }

  const init = await initStorageResultsAtDatabaseCompleted(client, requestId, attemptId);
  if (init.ok !== true) {
    throw new Error(`init storage results failed: ${String(init.code)}`);
  }

  if (options.deferProfileHold) {
    const deferManifest = await client.query<{ id: string }>(
      `SELECT id FROM public.account_deletion_storage_manifest
       WHERE execution_attempt_id = $1 AND disposition = 'DEFER_PROFILE' LIMIT 1`,
      [attemptId]
    );
    const manifestId = deferManifest.rows[0]?.id;
    if (manifestId) {
      await asAuthenticatedOwner<RpcPayload>(
        client,
        `SELECT public.create_account_deletion_storage_preservation_hold(
          $1::uuid,'manifest_object'::text,'legal_hold'::text,$2::uuid,$3::uuid,NULL
        ) AS payload`,
        [requestId, attemptId, manifestId]
      );
    }
  }

  const advanced = await asServiceRole<RpcPayload>(
    client,
    `SELECT public.advance_account_deletion_attempt_to_storage($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
  if (advanced.ok !== true) {
    throw new Error(`advance to storage failed: ${String(advanced.code)}`);
  }

  await runStorageTicksToCompletion(client, requestId, attemptId, {
    deletePrivateCount: options.deletePrivateCount ?? 0,
  });

  const stage = await getAttemptStage(client, attemptId);
  if (stage !== "storage_completed") {
    throw new Error(`expected storage_completed, got ${stage}`);
  }

  const manifestStatus = await client.query<{ storage_manifest_status: string }>(
    `SELECT storage_manifest_status FROM public.account_deletion_execution_attempts WHERE id = $1`,
    [attemptId]
  );
  if (manifestStatus.rows[0]?.storage_manifest_status !== "finalized") {
    throw new Error("storage manifest not finalized");
  }

  return { requestId, attemptId };
}

export async function asAuthenticatedUser<T>(
  client: Client,
  userId: string,
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number | null }> {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId }),
    ]);
    const result = await client.query<T>(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function prepareProfileStageRpc(
  client: Client,
  requestId: string,
  attemptId: string
): Promise<RpcPayload> {
  return asServiceRole<RpcPayload>(
    client,
    `SELECT public.prepare_account_deletion_profile_stage($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
}

export async function profileCleanupSnapshotRpc(
  client: Client,
  requestId: string,
  attemptId: string
): Promise<RpcPayload> {
  /** Postgres superuser: snapshot remains revoked from service_role in Production. */
  const result = await client.query<{ payload: RpcPayload }>(
    `SELECT public.account_deletion_profile_cleanup_snapshot($1::uuid,$2::uuid) AS payload`,
    [requestId, attemptId]
  );
  return result.rows[0]?.payload ?? {};
}

/** Privileged test-only collision seeding bypassing username triggers. */
export async function seedDeletionNamespaceCollisionUsername(
  client: Client,
  profileId: string,
  collisionUsername: string
) {
  const needsFormatCheckBypass = collisionUsername !== collisionUsername.toLowerCase();
  await client.query(`ALTER TABLE public.profiles DISABLE TRIGGER USER`);
  if (needsFormatCheckBypass) {
    await client.query(
      `ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format_check`
    );
  }
  try {
    await client.query(
      `UPDATE public.profiles
       SET username = $1, username_changed_at = now() - interval '31 days'
       WHERE id = $2`,
      [collisionUsername, profileId]
    );
  } finally {
    await client.query(`ALTER TABLE public.profiles ENABLE TRIGGER USER`);
  }
}

/** Re-applies profiles username format CHECK after privileged legacy mixed-case seeding. */
export async function restoreProfilesUsernameFormatCheck(client: Client) {
  await client.query(`
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format_check CHECK (
        username IS NULL OR username ~ '^[a-z0-9_]{3,24}$'
      )
  `);
}

export async function installProfilePrepareAbortTrigger(client: Client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION public.htbf_test_abort_profile_prepare()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF current_setting('htbf.profile_prepare_abort', true) = 'on' THEN
        RAISE EXCEPTION 'htbf_test_abort_profile_prepare' USING ERRCODE = 'P0001';
      END IF;
      RETURN OLD;
    END;
    $$;
  `);
  await client.query(`
    DROP TRIGGER IF EXISTS htbf_test_abort_profile_prepare ON public.inbox_messages;
    CREATE TRIGGER htbf_test_abort_profile_prepare
      BEFORE DELETE ON public.inbox_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.htbf_test_abort_profile_prepare();
  `);
}

export async function dropProfilePrepareAbortTrigger(client: Client) {
  await client.query(`
    DROP TRIGGER IF EXISTS htbf_test_abort_profile_prepare ON public.inbox_messages;
    DROP FUNCTION IF EXISTS public.htbf_test_abort_profile_prepare();
  `);
}

export async function setAttemptStagePrivileged(
  client: Client,
  attemptId: string,
  stage: string
) {
  /** Test-only exact stage setup for late-stage regression guards (3B.4A unwired). */
  await client.query(
    `UPDATE public.account_deletion_execution_attempts SET stage = $2 WHERE id = $1`,
    [attemptId, stage]
  );
}
