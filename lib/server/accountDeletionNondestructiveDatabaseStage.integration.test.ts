import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE } from "./accountDeletionStoryVideoReplyPlan";
import { DELETED_PUBLIC_AUTHOR_DISPLAY_NAME } from "./accountDeletionDatabasePolicy";
import {
  ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV,
  applyAccountDeletionMigrations,
  getAccountDeletionIntegrationDbUrl,
  installIntegrationFailureHook,
  removeIntegrationFailureHook,
  resetAccountDeletionIntegrationSchema,
} from "./accountDeletionIntegrationHarness";

const dbUrl = getAccountDeletionIntegrationDbUrl();
const describeIntegration = dbUrl ? describe : describe.skip;

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SURVIVOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REQUEST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STORY_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const REPLY_AB = "11111111-1111-4111-8111-111111111111";
const REPLY_BA = "22222222-2222-4222-8222-222222222222";
const REPLY_AA = "33333333-3333-4333-8333-333333333333";
const PRAYER_VIDEO_ID = "44444444-4444-4444-8444-444444444444";
const PRAYER_WRITTEN_ID = "55555555-5555-4555-8555-555555555555";
const PRAYER_UPDATE_ID = "66666666-6666-4666-8666-666666666666";
const INBOX_SURVIVING_ID = "77777777-7777-4777-8777-777777777777";
const INBOX_RECIPIENT_ID = "88888888-8888-4888-8888-888888888888";
const STORY_SURVIVOR_SENDER = "99999999-9999-4999-8999-999999999991";
const STORY_SURVIVOR_RECIPIENT = "99999999-9999-4999-8999-999999999992";
const STORY_UNRELATED = "99999999-9999-4999-8999-999999999993";
const REPLY_SURVIVOR_SENDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const REPLY_SURVIVOR_RECIPIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02";

type RpcRow = {
  execute_account_deletion_nondestructive_database_stage: {
    ok: boolean;
    code: string;
    database_rows_affected?: Record<string, number>;
  };
};

type AcquisitionRpcPayload = {
  ok?: boolean;
  code?: string;
  request_id?: string;
  attempt_id?: string;
  target_user_id?: string;
  attempt_stage?: string;
  attempt_status?: string;
};

type SeedScenarioResult = {
  attemptId: string;
};

let authenticatedDeletionGrantsApplied = false;
let serviceRoleGrantsApplied = false;

/** Local PG lacks Supabase's public.hashtextextended wrapper; acquisition RPC requires it. */
async function ensureHashtextextendedStub(client: Client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION public.hashtextextended(text, bigint)
    RETURNS bigint
    LANGUAGE sql
    IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT pg_catalog.hashtextextended($1, $2) $$;
  `);
}

async function ensureServiceRoleExecutionGrants(client: Client) {
  if (serviceRoleGrantsApplied) {
    return;
  }
  // Mirrors Supabase service_role: table grants plus BYPASSRLS for RLS-enabled attempts.
  await client.query(`
    GRANT USAGE ON SCHEMA public TO service_role;
    ALTER ROLE service_role BYPASSRLS;
  `);
  serviceRoleGrantsApplied = true;
}

async function ensureAuthenticatedDeletionRequestGrants(client: Client) {
  if (authenticatedDeletionGrantsApplied) {
    return;
  }
  // Mirrors Supabase table/schema grants so SET LOCAL ROLE authenticated exercises real RLS.
  await client.query(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO authenticated;
    GRANT SELECT, UPDATE ON public.story_video_replies TO authenticated;
    GRANT SELECT, UPDATE ON public.stories TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.story_reactions TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.story_reactions TO service_role;
    GRANT SELECT, UPDATE, INSERT, DELETE ON public.story_video_replies TO service_role;
    GRANT SELECT, UPDATE, INSERT, DELETE ON public.stories TO service_role;
    GRANT SELECT, UPDATE, INSERT, DELETE ON public.story_video_replies TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_reactions TO service_role;
    GRANT SELECT, UPDATE ON public.prayer_video_responses TO service_role;
  `);
  authenticatedDeletionGrantsApplied = true;
}

async function assertExecutionContextEmpty(client: Client) {
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM public.account_deletion_database_execution_context`
  );
  expect(Number(rows[0]?.count ?? 0)).toBe(0);
}

async function assertStoryFreezeScopeEmpty(client: Client) {
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM public.account_deletion_story_freeze_scope`
  );
  expect(Number(rows[0]?.count ?? 0)).toBe(0);
}

async function queryScopeStoryIds(
  client: Client,
  requestId: string
): Promise<string[]> {
  const { rows } = await client.query<{ story_id: string }>(
    `
    SELECT story_id
    FROM public.account_deletion_story_freeze_scope
    WHERE deletion_request_id = $1
    ORDER BY story_id
    `,
    [requestId]
  );
  return rows.map((row) => row.story_id);
}

async function seedSurvivorStoryFixturesForM3(client: Client) {
  await client.query(
    `
    INSERT INTO public.stories (
      id, user_id, name, email, story_text, video_url, status
    ) VALUES
      ($1, $2, 'Survivor Sender Story', 'survivor@test.local', 'Sender fixture body', 'https://example.com/ss.mp4', 'approved'),
      ($3, $2, 'Survivor Recipient Story', 'survivor@test.local', 'Recipient fixture body', 'https://example.com/sr.mp4', 'approved'),
      ($4, $2, 'Unrelated Survivor Story', 'survivor@test.local', 'Unrelated body', 'https://example.com/u.mp4', 'approved')
    `,
    [STORY_SURVIVOR_SENDER, SURVIVOR, STORY_SURVIVOR_RECIPIENT, STORY_UNRELATED]
  );

  await client.query(
    `
    INSERT INTO public.story_video_replies (
      id, story_id, user_id, recipient_user_id, message, deleted_by_sender, deleted_by_recipient
    ) VALUES
      ($1, $2, $3, $4, 'Target sender on survivor story', false, false),
      ($5, $6, $4, $3, 'Target recipient on survivor story', false, false)
    `,
    [
      REPLY_SURVIVOR_SENDER,
      STORY_SURVIVOR_SENDER,
      TARGET,
      SURVIVOR,
      REPLY_SURVIVOR_RECIPIENT,
      STORY_SURVIVOR_RECIPIENT,
    ]
  );
}

async function expectServiceRoleBlocked(
  client: Client,
  run: () => Promise<unknown>,
  pattern: RegExp
) {
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE service_role");
    await expect(run()).rejects.toThrow(pattern);
  } finally {
    await client.query("ROLLBACK");
  }
}

async function assertSessionRoleReset(client: Client) {
  const { rows } = await client.query<{ role: string; in_txn: boolean }>(`
    SELECT current_user AS role, (txid_current_if_assigned() IS NOT NULL) AS in_txn
  `);
  expect(rows[0]?.in_txn).toBe(false);
}

async function assertProtectProfileRolesTriggerEnabled(client: Client) {
  const { rows } = await client.query<{ tgenabled: string }>(`
    SELECT t.tgenabled
    FROM pg_trigger AS t
    JOIN pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'profiles'
      AND t.tgname = 'protect_profile_roles_trigger'
      AND NOT t.tgisinternal
  `);
  expect(rows[0]?.tgenabled).toBe("O");
}

async function bootstrapFirstOwnerProfile(client: Client) {
  await client.query("BEGIN");
  try {
    await client.query(
      `ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_roles_trigger`
    );
    const update = await client.query(
      `
      UPDATE public.profiles
      SET is_owner = true,
          is_admin = true
      WHERE id = $1
      `,
      [OWNER]
    );
    expect(update.rowCount).toBe(1);
    await client.query(
      `ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_roles_trigger`
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  await assertProtectProfileRolesTriggerEnabled(client);

  const ownerProfile = await client.query<{ is_owner: boolean; is_admin: boolean }>(
    `SELECT is_owner, is_admin FROM public.profiles WHERE id = $1`,
    [OWNER]
  );
  expect(ownerProfile.rows[0]).toMatchObject({
    is_owner: true,
    is_admin: true,
  });
}

async function submitDeletionRequestAsTarget(client: Client) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: TARGET }),
    ]);
    await client.query(
      `
      INSERT INTO public.account_deletion_requests (
        id,
        user_id,
        status,
        target_username_snapshot,
        email
      ) VALUES (
        $1,
        $2,
        'submitted',
        'target_user',
        'target@test.local'
      )
      `,
      [REQUEST_ID, TARGET]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const request = await client.query<{
    status: string;
    user_id: string;
    target_user_id_snapshot: string;
  }>(
    `
    SELECT status, user_id, target_user_id_snapshot
    FROM public.account_deletion_requests
    WHERE id = $1
    `,
    [REQUEST_ID]
  );
  expect(request.rows[0]).toMatchObject({
    status: "submitted",
    user_id: TARGET,
    target_user_id_snapshot: TARGET,
  });
}

async function approveDeletionRequestAsOwner(client: Client) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: OWNER }),
    ]);
    const update = await client.query(
      `
      UPDATE public.account_deletion_requests
      SET
        status = 'approved',
        approved_at = now(),
        approved_by = $2,
        reviewed_at = now(),
        reviewed_by = $2
      WHERE id = $1
        AND status = 'submitted'
      `,
      [REQUEST_ID, OWNER]
    );
    expect(update.rowCount).toBe(1);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const request = await client.query<{
    status: string;
    approved_at: string | null;
    approved_by: string;
  }>(
    `
    SELECT status, approved_at, approved_by
    FROM public.account_deletion_requests
    WHERE id = $1
    `,
    [REQUEST_ID]
  );
  expect(request.rows[0]?.status).toBe("approved");
  expect(request.rows[0]?.approved_at).not.toBeNull();
  expect(request.rows[0]?.approved_by).toBe(OWNER);
}

async function acquireExecutionLock(client: Client): Promise<string> {
  await client.query("BEGIN");
  let payload: AcquisitionRpcPayload | undefined;
  try {
    await client.query("SET LOCAL ROLE service_role");
    const result = await client.query<{ result: AcquisitionRpcPayload }>(
      `
      SELECT public.acquire_account_deletion_execution_lock($1::uuid, $2::uuid) AS result
      `,
      [REQUEST_ID, OWNER]
    );
    payload = result.rows[0]?.result;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  expect(payload?.ok).toBe(true);
  expect(payload?.code === "acquired" || payload?.code === "already_acquired").toBe(
    true
  );
  expect(payload?.request_id).toBe(REQUEST_ID);
  expect(payload?.target_user_id).toBe(TARGET);
  expect(typeof payload?.attempt_id).toBe("string");
  expect(payload!.attempt_id!.length).toBeGreaterThan(0);

  const attempt = await client.query<{
    id: string;
    deletion_request_id: string;
    target_user_id: string;
    initiated_by: string;
    status: string;
    stage: string;
  }>(
    `
    SELECT id, deletion_request_id, target_user_id, initiated_by, status, stage
    FROM public.account_deletion_execution_attempts
    WHERE deletion_request_id = $1
      AND status = 'active'
    `,
    [REQUEST_ID]
  );
  expect(attempt.rows).toHaveLength(1);
  expect(attempt.rows[0]).toMatchObject({
    id: payload!.attempt_id,
    deletion_request_id: REQUEST_ID,
    target_user_id: TARGET,
    initiated_by: OWNER,
    status: "active",
    stage: "lock_acquired",
  });

  const request = await client.query<{ status: string }>(
    `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
    [REQUEST_ID]
  );
  expect(request.rows[0]?.status).toBe("deletion_in_progress");

  return payload!.attempt_id!;
}

async function advanceAttemptToInventory(client: Client, attemptId: string) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE service_role");
    const update = await client.query<{ id: string }>(
      `
      UPDATE public.account_deletion_execution_attempts
      SET stage = 'inventory'
      WHERE id = $1
        AND deletion_request_id = $2
        AND target_user_id = $3
        AND status = 'active'
        AND stage = 'lock_acquired'
      RETURNING id
      `,
      [attemptId, REQUEST_ID, TARGET]
    );
    expect(update.rowCount).toBe(1);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function execRpc(
  client: Client,
  requestId: string,
  attemptId: string,
  options?: { manageTransaction?: boolean }
) {
  const manageTransaction = options?.manageTransaction ?? true;
  if (manageTransaction) {
    await client.query("BEGIN");
  }
  try {
    await client.query("SET LOCAL ROLE service_role");
    const result = await client.query<RpcRow>(
      `SELECT public.execute_account_deletion_nondestructive_database_stage($1::uuid, $2::uuid) AS execute_account_deletion_nondestructive_database_stage`,
      [requestId, attemptId]
    );
    if (manageTransaction) {
      await client.query("COMMIT");
    }
    return result.rows[0]?.execute_account_deletion_nondestructive_database_stage;
  } catch (error) {
    if (manageTransaction) {
      await client.query("ROLLBACK");
    }
    throw error;
  }
}

async function seedBaseScenario(client: Client): Promise<SeedScenarioResult> {
  await client.query(
    `
    INSERT INTO auth.users (id, email) VALUES
      ($1, 'target@test.local'),
      ($2, 'survivor@test.local'),
      ($3, 'owner@test.local')
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, SURVIVOR, OWNER]
  );

  await client.query(
    `
    INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
    VALUES
      ($1, 'target@test.local', 'target_user', 'Target User', false, false),
      ($2, 'survivor@test.local', 'survivor_user', 'Survivor User', false, false),
      ($3, 'owner@test.local', 'owner_user', 'Owner User', false, false)
    ON CONFLICT (id) DO NOTHING
    `,
    [TARGET, SURVIVOR, OWNER]
  );

  await ensureAuthenticatedDeletionRequestGrants(client);
  await bootstrapFirstOwnerProfile(client);

  // Content must exist before acquisition — write-freeze blocks mutations once deletion_in_progress.
  await client.query(
    `
    INSERT INTO public.stories (
      id, user_id, name, email, location, story_text, video_url, status
    ) VALUES (
      $1, $2, 'Target Author', 'target@test.local', 'City', 'Substantive story body', 'https://example.com/v.mp4', 'approved'
    )
    `,
    [STORY_ID, TARGET]
  );

  await client.query(
    `
    INSERT INTO public.story_video_replies (
      id, story_id, user_id, recipient_user_id, message, deleted_by_sender, deleted_by_recipient
    ) VALUES
      ($1, $4, $2, $3, 'Original A to B message', false, false),
      ($5, $4, $3, $2, 'Original B to A message must stay', false, false),
      ($6, $4, $2, $2, 'Original A to A message', false, false)
    `,
    [REPLY_AB, TARGET, SURVIVOR, STORY_ID, REPLY_BA, REPLY_AA]
  );

  await client.query(
    `
    INSERT INTO public.prayer_video_responses (
      id, story_id, user_id, video_url, body, status
    ) VALUES (
      $1, $2, $3, 'https://example.com/response.mp4', 'Prayer video body', 'approved'
    )
    `,
    [PRAYER_VIDEO_ID, STORY_ID, TARGET]
  );

  await client.query(
    `
    INSERT INTO public.prayer_written_responses (
      id, story_id, author_user_id, body
    ) VALUES (
      $1, $2, $3, 'Written prayer body'
    )
    `,
    [PRAYER_WRITTEN_ID, STORY_ID, TARGET]
  );

  await client.query(
    `
    INSERT INTO public.prayer_updates (
      id, story_id, author_user_id, body
    ) VALUES (
      $1, $2, $3, 'Prayer update body'
    )
    `,
    [PRAYER_UPDATE_ID, STORY_ID, TARGET]
  );

  await client.query(
    `
    INSERT INTO public.inbox_messages (
      id, user_id, sender_user_id, title, body, video_url, image_url
    ) VALUES
      ($1, $3, $2, 'Someone sent you a private video prayer', 'Surviving inbox body', 'https://example.com/inbox.mp4', 'https://example.com/inbox.png'),
      ($4, $2, $2, 'Your copy', 'Recipient-owned body', null, null)
    `,
    [INBOX_SURVIVING_ID, TARGET, SURVIVOR, INBOX_RECIPIENT_ID]
  );

  await seedSurvivorStoryFixturesForM3(client);

  await submitDeletionRequestAsTarget(client);
  await approveDeletionRequestAsOwner(client);
  const attemptId = await acquireExecutionLock(client);
  await advanceAttemptToInventory(client, attemptId);

  return { attemptId };
}

async function cleanupScenario(client: Client) {
  await client.query(`
    TRUNCATE TABLE
      public.account_deletion_story_freeze_scope,
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
  await client.query(
    `DELETE FROM auth.users WHERE id = ANY($1::uuid[])`,
    [[TARGET, SURVIVOR, OWNER]]
  );
}

describeIntegration(
  `account deletion nondestructive database stage integration (${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV})`,
  () => {
    let client: Client;

    beforeAll(async () => {
      client = new Client({ connectionString: dbUrl! });
      await client.connect();
      await resetAccountDeletionIntegrationSchema(client);
      await applyAccountDeletionMigrations(client);
      await ensureHashtextextendedStub(client);
      await ensureServiceRoleExecutionGrants(client);
      await installIntegrationFailureHook(client);
    }, 300_000);

    afterAll(async () => {
      await removeIntegrationFailureHook(client);
      await client.end();
    });

    it("establishes production-faithful lifecycle preconditions through acquisition", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);

      await assertProtectProfileRolesTriggerEnabled(client);

      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [REQUEST_ID]
      );
      expect(request.rows[0]?.status).toBe("deletion_in_progress");

      const attempts = await client.query<{ id: string; stage: string }>(
        `
        SELECT id, stage
        FROM public.account_deletion_execution_attempts
        WHERE deletion_request_id = $1
          AND status = 'active'
        `,
        [REQUEST_ID]
      );
      expect(attempts.rows).toHaveLength(1);
      expect(attempts.rows[0]?.id).toBe(attemptId);
      expect(attempts.rows[0]?.stage).toBe("inventory");
    });

    it("executes full nondestructive database stage and preserves surviving content", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);

      const baBefore = await client.query<{ message: string }>(
        `SELECT message FROM public.story_video_replies WHERE id = $1`,
        [REPLY_BA]
      );
      const inboxBefore = await client.query<{ title: string; body: string; video_url: string }>(
        `SELECT title, body, video_url FROM public.inbox_messages WHERE id = $1`,
        [INBOX_SURVIVING_ID]
      );

      const payload = await execRpc(client, REQUEST_ID, attemptId);
      expect(payload?.ok).toBe(true);
      expect(payload?.code).toBe("completed");

      const replyAb = await client.query(
        `SELECT user_id, message, deleted_by_sender, recipient_user_id FROM public.story_video_replies WHERE id = $1`,
        [REPLY_AB]
      );
      expect(replyAb.rows[0]).toMatchObject({
        user_id: null,
        message: ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE,
        deleted_by_sender: true,
        recipient_user_id: SURVIVOR,
      });

      const replyBa = await client.query<{ message: string; recipient_user_id: string | null; deleted_by_recipient: boolean }>(
        `SELECT message, recipient_user_id, deleted_by_recipient FROM public.story_video_replies WHERE id = $1`,
        [REPLY_BA]
      );
      expect(replyBa.rows[0]?.message).toBe(baBefore.rows[0]?.message);
      expect(replyBa.rows[0]?.message).toBe("Original B to A message must stay");
      expect(replyBa.rows[0]).toMatchObject({
        recipient_user_id: null,
        deleted_by_recipient: true,
      });

      const replyAa = await client.query(
        `SELECT user_id, recipient_user_id, message, deleted_by_sender, deleted_by_recipient FROM public.story_video_replies WHERE id = $1`,
        [REPLY_AA]
      );
      expect(replyAa.rows[0]).toMatchObject({
        user_id: null,
        recipient_user_id: null,
        message: ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE,
        deleted_by_sender: true,
        deleted_by_recipient: true,
      });

      const prayerVideo = await client.query(
        `SELECT user_id, body, video_url FROM public.prayer_video_responses WHERE id = $1`,
        [PRAYER_VIDEO_ID]
      );
      expect(prayerVideo.rows[0]).toMatchObject({
        user_id: null,
        body: "Prayer video body",
        video_url: "https://example.com/response.mp4",
      });

      const prayerWritten = await client.query(
        `SELECT author_user_id, body FROM public.prayer_written_responses WHERE id = $1`,
        [PRAYER_WRITTEN_ID]
      );
      expect(prayerWritten.rows[0]).toMatchObject({
        author_user_id: null,
        body: "Written prayer body",
      });

      const prayerUpdate = await client.query(
        `SELECT author_user_id, body FROM public.prayer_updates WHERE id = $1`,
        [PRAYER_UPDATE_ID]
      );
      expect(prayerUpdate.rows[0]).toMatchObject({
        author_user_id: null,
        body: "Prayer update body",
      });

      const inboxSurviving = await client.query(
        `SELECT sender_user_id, title, body, video_url, image_url, user_id FROM public.inbox_messages WHERE id = $1`,
        [INBOX_SURVIVING_ID]
      );
      expect(inboxSurviving.rows[0]).toMatchObject({
        sender_user_id: null,
        title: inboxBefore.rows[0]?.title,
        body: inboxBefore.rows[0]?.body,
        video_url: inboxBefore.rows[0]?.video_url,
        user_id: SURVIVOR,
      });

      const inboxRecipient = await client.query(
        `SELECT sender_user_id, body, user_id FROM public.inbox_messages WHERE id = $1`,
        [INBOX_RECIPIENT_ID]
      );
      expect(inboxRecipient.rows[0]).toMatchObject({
        sender_user_id: TARGET,
        body: "Recipient-owned body",
        user_id: TARGET,
      });

      const story = await client.query(
        `SELECT user_id, name, email, location, story_text, video_url, status FROM public.stories WHERE id = $1`,
        [STORY_ID]
      );
      expect(story.rows[0]).toMatchObject({
        user_id: null,
        name: DELETED_PUBLIC_AUTHOR_DISPLAY_NAME,
        email: null,
        location: null,
        story_text: "Substantive story body",
        video_url: "https://example.com/v.mp4",
        status: "approved",
      });

      const attempt = await client.query(
        `SELECT stage, database_rows_affected FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(attempt.rows[0]?.stage).toBe("database_completed");

      const contentReports = await client.query(
        `SELECT to_regclass('public.content_reports') AS present`
      );
      if (contentReports.rows[0]?.present) {
        const reportCount = await client.query(
          `SELECT count(*)::int AS count FROM public.content_reports WHERE reported_user_id = $1`,
          [TARGET]
        );
        expect(reportCount.rows[0]?.count).toBe(0);
      }

      await assertExecutionContextEmpty(client);
    });

    it("aborts never-published stories with zero mutations", async () => {
      await cleanupScenario(client);
      await client.query(
        `
        INSERT INTO auth.users (id, email) VALUES
          ($1, 'target@test.local'),
          ($2, 'survivor@test.local'),
          ($3, 'owner@test.local')
        ON CONFLICT (id) DO NOTHING
        `,
        [TARGET, SURVIVOR, OWNER]
      );
      await client.query(
        `
        INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
        VALUES
          ($1, 'target@test.local', 'target_user', 'Target User', false, false),
          ($2, 'survivor@test.local', 'survivor_user', 'Survivor User', false, false),
          ($3, 'owner@test.local', 'owner_user', 'Owner User', false, false)
        ON CONFLICT (id) DO NOTHING
        `,
        [TARGET, SURVIVOR, OWNER]
      );
      await ensureAuthenticatedDeletionRequestGrants(client);
      await bootstrapFirstOwnerProfile(client);
      await client.query(
        `
        INSERT INTO public.stories (
          id, user_id, name, email, location, story_text, video_url, status
        ) VALUES (
          $1, $2, 'Target Author', 'target@test.local', 'City', 'Substantive story body', 'https://example.com/v.mp4', 'pending'
        )
        `,
        [STORY_ID, TARGET]
      );
      await client.query(
        `
        INSERT INTO public.story_video_replies (
          id, story_id, user_id, recipient_user_id, message, deleted_by_sender, deleted_by_recipient
        ) VALUES
          ($1, $4, $2, $3, 'Original A to B message', false, false)
        `,
        [REPLY_AB, TARGET, SURVIVOR, STORY_ID]
      );
      await submitDeletionRequestAsTarget(client);
      await approveDeletionRequestAsOwner(client);
      const attemptId = await acquireExecutionLock(client);
      await advanceAttemptToInventory(client, attemptId);

      const replyBefore = await client.query(
        `SELECT user_id FROM public.story_video_replies WHERE id = $1`,
        [REPLY_AB]
      );

      const payload = await execRpc(client, REQUEST_ID, attemptId);
      expect(payload).toMatchObject({
        ok: false,
        code: "unsupported_destructive_action",
      });

      const replyAfter = await client.query(
        `SELECT user_id FROM public.story_video_replies WHERE id = $1`,
        [REPLY_AB]
      );
      expect(replyAfter.rows[0]).toEqual(replyBefore.rows[0]);

      const attempt = await client.query(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(attempt.rows[0]?.stage).toBe("inventory");
      await assertExecutionContextEmpty(client);
    });

    it("returns already_completed without second mutation", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);

      const first = await execRpc(client, REQUEST_ID, attemptId);
      expect(first?.code).toBe("completed");

      const storyAfterFirst = await client.query(
        `SELECT name FROM public.stories WHERE id = $1`,
        [STORY_ID]
      );

      const second = await execRpc(client, REQUEST_ID, attemptId);
      expect(second).toMatchObject({ ok: true, code: "already_completed" });

      const storyAfterSecond = await client.query(
        `SELECT name FROM public.stories WHERE id = $1`,
        [STORY_ID]
      );
      expect(storyAfterSecond.rows[0]).toEqual(storyAfterFirst.rows[0]);
      await assertExecutionContextEmpty(client);
    });

    it("rolls back all mutations when failure hook triggers mid-transaction", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query(
          `SELECT set_config('htbf.account_deletion_test_fail_after_prayer', '1', true)`
        );

        const payload = await execRpc(client, REQUEST_ID, attemptId, {
          manageTransaction: false,
        });
        expect(payload).toMatchObject({ ok: false, code: "invariant_failed" });
      } finally {
        await client.query("ROLLBACK");
      }

      const reply = await client.query(
        `SELECT user_id FROM public.story_video_replies WHERE id = $1`,
        [REPLY_AB]
      );
      expect(reply.rows[0]?.user_id).toBe(TARGET);

      const attempt = await client.query(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(attempt.rows[0]?.stage).toBe("inventory");
      await assertExecutionContextEmpty(client);
      await assertSessionRoleReset(client);
    });

    it("blocks authenticated direct reply mutation during deletion_in_progress", async () => {
      await cleanupScenario(client);
      await seedBaseScenario(client);
      await ensureAuthenticatedDeletionRequestGrants(client);

      const before = await client.query<{ user_id: string }>(
        `SELECT user_id FROM public.story_video_replies WHERE id = $1`,
        [REPLY_AB]
      );

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE authenticated");
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: TARGET }),
        ]);
        const update = await client.query(
          `
          UPDATE public.story_video_replies
          SET user_id = NULL,
              message = $2,
              deleted_by_sender = true
          WHERE id = $1
          `,
          [REPLY_AB, ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE]
        );
        expect(update.rowCount).toBe(0);
      } finally {
        await client.query("ROLLBACK");
      }

      const after = await client.query<{ user_id: string }>(
        `SELECT user_id FROM public.story_video_replies WHERE id = $1`,
        [REPLY_AB]
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it("blocks service_role shaped reply mutation without executor context", async () => {
      await cleanupScenario(client);
      await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `
            UPDATE public.story_video_replies
            SET user_id = NULL,
                message = $2,
                deleted_by_sender = true
            WHERE id = $1
            `,
            [REPLY_AB, ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE]
          )
        ).rejects.toThrow(/story video reply write blocked/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("denies service_role direct insert into execution context", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `
            INSERT INTO public.account_deletion_database_execution_context (
              backend_pid,
              transaction_id,
              attempt_id,
              deletion_request_id,
              target_user_id,
              purpose
            ) VALUES (
              pg_backend_pid(),
              txid_current()::bigint,
              $1::uuid,
              $2::uuid,
              $3::uuid,
              'nondestructive_database_stage'
            )
            `,
            [attemptId, REQUEST_ID, TARGET]
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("does not authorize another connection using foreign execution context", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);
      const otherClient = new Client({ connectionString: dbUrl! });
      await otherClient.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `
          INSERT INTO public.account_deletion_database_execution_context (
            backend_pid,
            transaction_id,
            attempt_id,
            deletion_request_id,
            target_user_id,
            purpose
          ) VALUES (
            pg_backend_pid(),
            txid_current()::bigint,
            $1::uuid,
            $2::uuid,
            $3::uuid,
            'nondestructive_database_stage'
          )
          `,
          [attemptId, REQUEST_ID, TARGET]
        );

        try {
          await otherClient.query("BEGIN");
          await otherClient.query("SET LOCAL ROLE service_role");
          await expect(
            otherClient.query(
              `
              UPDATE public.story_video_replies
              SET user_id = NULL,
                  message = $2,
                  deleted_by_sender = true
              WHERE id = $1
              `,
              [REPLY_AB, ACCOUNT_DELETION_REPLY_TOMBSTONE_MESSAGE]
            )
          ).rejects.toThrow(/story video reply write blocked/i);
        } finally {
          await otherClient.query("ROLLBACK");
        }
      } finally {
        await client.query("ROLLBACK");
        await otherClient.end();
      }
    });

    it("blocks forged context when mutation shape adds disallowed field changes", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query(
          `
          INSERT INTO public.account_deletion_database_execution_context (
            backend_pid,
            transaction_id,
            attempt_id,
            deletion_request_id,
            target_user_id,
            purpose
          ) VALUES (
            pg_backend_pid(),
            txid_current()::bigint,
            $1::uuid,
            $2::uuid,
            $3::uuid,
            'nondestructive_database_stage'
          )
          `,
          [attemptId, REQUEST_ID, TARGET]
        );
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `
            UPDATE public.prayer_video_responses
            SET user_id = NULL,
                body = 'tampered body'
            WHERE id = $1
            `,
            [PRAYER_VIDEO_ID]
          )
        ).rejects.toThrow(/story-associated write blocked/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("keeps engagement-table write freeze unchanged during deletion_in_progress", async () => {
      await cleanupScenario(client);
      await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `
            INSERT INTO public.story_reactions (story_id, user_id, reaction_type)
            VALUES ($1::uuid, $2::uuid, 'amen')
            `,
            [STORY_ID, SURVIVOR]
          )
        ).rejects.toThrow(/story-associated write blocked/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("blocks authenticated direct story mutation during deletion_in_progress", async () => {
      await cleanupScenario(client);
      await seedBaseScenario(client);
      await ensureAuthenticatedDeletionRequestGrants(client);

      const before = await client.query<{ user_id: string; name: string }>(
        `SELECT user_id, name FROM public.stories WHERE id = $1`,
        [STORY_ID]
      );

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE authenticated");
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: TARGET }),
        ]);
        const update = await client.query(
          `
          UPDATE public.stories
          SET user_id = NULL,
              name = $2
          WHERE id = $1
          `,
          [STORY_ID, DELETED_PUBLIC_AUTHOR_DISPLAY_NAME]
        );
        expect(update.rowCount).toBe(0);
      } finally {
        await client.query("ROLLBACK");
      }

      const after = await client.query<{ user_id: string; name: string }>(
        `SELECT user_id, name FROM public.stories WHERE id = $1`,
        [STORY_ID]
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it("blocks service_role direct story mutation during deletion_in_progress", async () => {
      await cleanupScenario(client);
      await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `
            UPDATE public.stories
            SET name = 'Tampered Author'
            WHERE id = $1
            `,
            [STORY_ID]
          )
        ).rejects.toThrow(/story write blocked/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("blocks service_role exact story anonymization shape without executor context", async () => {
      await cleanupScenario(client);
      await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `
            UPDATE public.stories
            SET
              user_id = NULL,
              name = $2,
              email = NULL,
              location = NULL,
              public_lat = NULL,
              public_lng = NULL,
              public_location_label = NULL
            WHERE id = $1
            `,
            [STORY_ID, DELETED_PUBLIC_AUTHOR_DISPLAY_NAME]
          )
        ).rejects.toThrow(/story write blocked/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("allows legitimate executor story anonymization during deletion_in_progress", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);

      const payload = await execRpc(client, REQUEST_ID, attemptId);
      expect(payload).toMatchObject({ ok: true, code: "completed" });

      const story = await client.query(
        `
        SELECT user_id, name, email, location, story_text, video_url, status
        FROM public.stories
        WHERE id = $1
        `,
        [STORY_ID]
      );
      expect(story.rows[0]).toMatchObject({
        user_id: null,
        name: DELETED_PUBLIC_AUTHOR_DISPLAY_NAME,
        email: null,
        location: null,
        story_text: "Substantive story body",
        video_url: "https://example.com/v.mp4",
        status: "approved",
      });
      await assertExecutionContextEmpty(client);
    });

    it("blocks forged context when story mutation changes substantive fields", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query(
          `
          INSERT INTO public.account_deletion_database_execution_context (
            backend_pid,
            transaction_id,
            attempt_id,
            deletion_request_id,
            target_user_id,
            purpose
          ) VALUES (
            pg_backend_pid(),
            txid_current()::bigint,
            $1::uuid,
            $2::uuid,
            $3::uuid,
            'nondestructive_database_stage'
          )
          `,
          [attemptId, REQUEST_ID, TARGET]
        );
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `
            UPDATE public.stories
            SET
              user_id = NULL,
              name = $2,
              email = NULL,
              location = NULL,
              public_lat = NULL,
              public_lng = NULL,
              public_location_label = NULL,
              story_text = 'tampered story body'
            WHERE id = $1
            `,
            [STORY_ID, DELETED_PUBLIC_AUTHOR_DISPLAY_NAME]
          )
        ).rejects.toThrow(/story write blocked/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("blocks story INSERT for target during deletion_in_progress", async () => {
      await cleanupScenario(client);
      await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(
            `
            INSERT INTO public.stories (
              id, user_id, name, email, story_text, video_url, status
            ) VALUES (
              $1, $2, 'Another Story', 'target@test.local', 'Body', 'https://example.com/v2.mp4', 'approved'
            )
            `,
            ["99999999-9999-4999-8999-999999999999", TARGET]
          )
        ).rejects.toThrow(/story write blocked/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("blocks story DELETE for target during deletion_in_progress", async () => {
      await cleanupScenario(client);
      await seedBaseScenario(client);

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        await expect(
          client.query(`DELETE FROM public.stories WHERE id = $1`, [STORY_ID])
        ).rejects.toThrow(/story write blocked/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("commits outer transaction after caught failure without partial executor state", async () => {
      await cleanupScenario(client);
      const { attemptId } = await seedBaseScenario(client);

      const replyBefore = await client.query<{ user_id: string }>(
        `SELECT user_id FROM public.story_video_replies WHERE id = $1`,
        [REPLY_AB]
      );
      const prayerBefore = await client.query<{ user_id: string }>(
        `SELECT user_id FROM public.prayer_video_responses WHERE id = $1`,
        [PRAYER_VIDEO_ID]
      );
      const inboxBefore = await client.query<{ sender_user_id: string }>(
        `SELECT sender_user_id FROM public.inbox_messages WHERE id = $1`,
        [INBOX_SURVIVING_ID]
      );
      const storyBefore = await client.query<{ user_id: string; name: string }>(
        `SELECT user_id, name FROM public.stories WHERE id = $1`,
        [STORY_ID]
      );

      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE service_role");
        await client.query(
          `SELECT set_config('htbf.account_deletion_test_fail_after_prayer', '1', true)`
        );

        const payload = await execRpc(client, REQUEST_ID, attemptId, {
          manageTransaction: false,
        });
        expect(payload).toMatchObject({ ok: false, code: "invariant_failed" });

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        await assertSessionRoleReset(client);
      }

      const replyAfter = await client.query<{ user_id: string }>(
        `SELECT user_id FROM public.story_video_replies WHERE id = $1`,
        [REPLY_AB]
      );
      expect(replyAfter.rows[0]).toEqual(replyBefore.rows[0]);

      const prayerAfter = await client.query<{ user_id: string }>(
        `SELECT user_id FROM public.prayer_video_responses WHERE id = $1`,
        [PRAYER_VIDEO_ID]
      );
      expect(prayerAfter.rows[0]).toEqual(prayerBefore.rows[0]);

      const inboxAfter = await client.query<{ sender_user_id: string }>(
        `SELECT sender_user_id FROM public.inbox_messages WHERE id = $1`,
        [INBOX_SURVIVING_ID]
      );
      expect(inboxAfter.rows[0]).toEqual(inboxBefore.rows[0]);

      const storyAfter = await client.query<{ user_id: string; name: string }>(
        `SELECT user_id, name FROM public.stories WHERE id = $1`,
        [STORY_ID]
      );
      expect(storyAfter.rows[0]).toEqual(storyBefore.rows[0]);

      const attempt = await client.query<{ stage: string }>(
        `SELECT stage FROM public.account_deletion_execution_attempts WHERE id = $1`,
        [attemptId]
      );
      expect(attempt.rows[0]?.stage).toBe("inventory");

      const request = await client.query<{ status: string }>(
        `SELECT status FROM public.account_deletion_requests WHERE id = $1`,
        [REQUEST_ID]
      );
      expect(request.rows[0]?.status).toBe("deletion_in_progress");

      await assertExecutionContextEmpty(client);
      await assertStoryFreezeScopeEmpty(client);
    });

    describe("M3 durable story freeze scope", () => {
      async function completeDatabaseStage(attemptId: string) {
        const payload = await execRpc(client, REQUEST_ID, attemptId);
        expect(payload?.ok).toBe(true);
        expect(payload?.code).toBe("completed");
        return payload;
      }

      it("M3-A: target-owned story engagement frozen before 3B.1", async () => {
        await cleanupScenario(client);
        await seedBaseScenario(client);
        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `INSERT INTO public.story_reactions (story_id, user_id, reaction_type) VALUES ($1::uuid, $2::uuid, 'amen')`,
              [STORY_ID, SURVIVOR]
            ),
          /story-associated write blocked/i
        );
        await assertStoryFreezeScopeEmpty(client);
      });

      it("M3-B: target-owned story remains frozen after database_completed with durable scope", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);

        const story = await client.query<{ user_id: string | null }>(
          `SELECT user_id FROM public.stories WHERE id = $1`,
          [STORY_ID]
        );
        expect(story.rows[0]?.user_id).toBeNull();

        const scopeIds = await queryScopeStoryIds(client, REQUEST_ID);
        expect(scopeIds).toContain(STORY_ID);

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `INSERT INTO public.story_reactions (story_id, user_id, reaction_type) VALUES ($1::uuid, $2::uuid, 'amen')`,
              [STORY_ID, SURVIVOR]
            ),
          /story-associated write blocked/i
        );
      });

      it("M3-C: survivor story with TARGET sender reply stays in scope and frozen after detach", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);

        const reply = await client.query<{ user_id: string | null }>(
          `SELECT user_id FROM public.story_video_replies WHERE id = $1`,
          [REPLY_SURVIVOR_SENDER]
        );
        expect(reply.rows[0]?.user_id).toBeNull();

        const scopeIds = await queryScopeStoryIds(client, REQUEST_ID);
        expect(scopeIds).toContain(STORY_SURVIVOR_SENDER);

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `INSERT INTO public.story_reactions (story_id, user_id, reaction_type) VALUES ($1::uuid, $2::uuid, 'amen')`,
              [STORY_SURVIVOR_SENDER, SURVIVOR]
            ),
          /story-associated write blocked/i
        );
      });

      it("M3-D: survivor story with TARGET recipient reply stays in scope and frozen after detach", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);

        const reply = await client.query<{ recipient_user_id: string | null }>(
          `SELECT recipient_user_id FROM public.story_video_replies WHERE id = $1`,
          [REPLY_SURVIVOR_RECIPIENT]
        );
        expect(reply.rows[0]?.recipient_user_id).toBeNull();

        const scopeIds = await queryScopeStoryIds(client, REQUEST_ID);
        expect(scopeIds).toContain(STORY_SURVIVOR_RECIPIENT);

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `INSERT INTO public.story_reactions (story_id, user_id, reaction_type) VALUES ($1::uuid, $2::uuid, 'amen')`,
              [STORY_SURVIVOR_RECIPIENT, SURVIVOR]
            ),
          /story-associated write blocked/i
        );
      });

      it("M3-E: unrelated survivor story not in scope remains writable", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);

        const scopeIds = await queryScopeStoryIds(client, REQUEST_ID);
        expect(scopeIds).not.toContain(STORY_UNRELATED);

        await client.query("BEGIN");
        try {
          await client.query("SET LOCAL ROLE service_role");
          const insert = await client.query(
            `INSERT INTO public.story_reactions (story_id, user_id, reaction_type) VALUES ($1::uuid, $2::uuid, 'amen')`,
            [STORY_UNRELATED, SURVIVOR]
          );
          expect(insert.rowCount).toBe(1);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });

      it("M3-F/G: service_role and authenticated engagement blocked on scoped story post-completion", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);
        await ensureAuthenticatedDeletionRequestGrants(client);

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `INSERT INTO public.story_reactions (story_id, user_id, reaction_type) VALUES ($1::uuid, $2::uuid, 'amen')`,
              [STORY_ID, SURVIVOR]
            ),
          /story-associated write blocked/i
        );

        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL ROLE authenticated");
          await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: SURVIVOR }),
          ]);
          await expect(
            client.query(
              `INSERT INTO public.story_reactions (story_id, user_id, reaction_type) VALUES ($1::uuid, $2::uuid, 'amen')`,
              [STORY_ID, SURVIVOR]
            )
          ).rejects.toThrow(/story-associated write blocked/i);
        } finally {
          await client.query("ROLLBACK");
        }
      });

      it("M3-H/I: scoped story UPDATE and DELETE blocked after database_completed", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(`UPDATE public.stories SET story_text = 'tampered' WHERE id = $1`, [
              STORY_ID,
            ]),
          /story write blocked/i
        );

        await expectServiceRoleBlocked(
          client,
          () => client.query(`DELETE FROM public.stories WHERE id = $1`, [STORY_ID]),
          /story write blocked/i
        );
      });

      it("M3-J/K/L: scoped-story reply INSERT/UPDATE/DELETE blocked after database_completed", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `
              INSERT INTO public.story_video_replies (
                id, story_id, user_id, recipient_user_id, message, deleted_by_sender, deleted_by_recipient
              ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'new reply', false, false
              )
              `,
              [
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01",
                STORY_ID,
                SURVIVOR,
                OWNER,
              ]
            ),
          /story video reply write blocked/i
        );

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `UPDATE public.story_video_replies SET message = 'tampered' WHERE id = $1`,
              [REPLY_AB]
            ),
          /story video reply write blocked/i
        );

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(`DELETE FROM public.story_video_replies WHERE id = $1`, [REPLY_AB]),
          /story video reply write blocked/i
        );
      });

      it("M3-M: failed unsupported_destructive_action leaves zero scope rows", async () => {
        await cleanupScenario(client);
        await client.query(
          `
          INSERT INTO auth.users (id, email) VALUES ($1, 'target@test.local'), ($2, 'survivor@test.local'), ($3, 'owner@test.local')
          ON CONFLICT (id) DO NOTHING
          `,
          [TARGET, SURVIVOR, OWNER]
        );
        await client.query(
          `
          INSERT INTO public.profiles (id, email, username, display_name, is_owner, is_admin)
          VALUES ($1, 'target@test.local', 'target_user', 'Target User', false, false),
                 ($2, 'survivor@test.local', 'survivor_user', 'Survivor User', false, false),
                 ($3, 'owner@test.local', 'owner_user', 'Owner User', false, false)
          ON CONFLICT (id) DO NOTHING
          `,
          [TARGET, SURVIVOR, OWNER]
        );
        await ensureAuthenticatedDeletionRequestGrants(client);
        await bootstrapFirstOwnerProfile(client);
        await client.query(
          `
          INSERT INTO public.stories (id, user_id, name, email, story_text, video_url, status)
          VALUES ($1, $2, 'Target Author', 'target@test.local', 'Body', 'https://example.com/v.mp4', 'pending')
          `,
          [STORY_ID, TARGET]
        );
        await submitDeletionRequestAsTarget(client);
        await approveDeletionRequestAsOwner(client);
        const attemptId = await acquireExecutionLock(client);
        await advanceAttemptToInventory(client, attemptId);

        const payload = await execRpc(client, REQUEST_ID, attemptId);
        expect(payload).toMatchObject({ ok: false, code: "unsupported_destructive_action" });
        await assertStoryFreezeScopeEmpty(client);
      });

      it("M3-N: COMMIT-after-caught-failure leaves zero scope rows", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);

        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL ROLE service_role");
          await client.query(
            `SELECT set_config('htbf.account_deletion_test_fail_after_prayer', '1', true)`
          );
          const payload = await execRpc(client, REQUEST_ID, attemptId, {
            manageTransaction: false,
          });
          expect(payload).toMatchObject({ ok: false, code: "invariant_failed" });
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }

        await assertStoryFreezeScopeEmpty(client);
      });

      it("M3-O: already_completed does not duplicate or alter scope", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);
        const afterFirst = await queryScopeStoryIds(client, REQUEST_ID);

        const second = await execRpc(client, REQUEST_ID, attemptId);
        expect(second).toMatchObject({ ok: true, code: "already_completed" });

        const afterSecond = await queryScopeStoryIds(client, REQUEST_ID);
        expect(afterSecond).toEqual(afterFirst);
      });

      it("M3-P: request leaving deletion_in_progress stops durable freeze while rows may remain", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);

        const scopeBefore = await queryScopeStoryIds(client, REQUEST_ID);
        expect(scopeBefore.length).toBeGreaterThan(0);

        await client.query(
          `UPDATE public.account_deletion_requests SET status = 'failed' WHERE id = $1`,
          [REQUEST_ID]
        );

        await client.query("BEGIN");
        try {
          await client.query("SET LOCAL ROLE service_role");
          const insert = await client.query(
            `INSERT INTO public.story_reactions (story_id, user_id, reaction_type) VALUES ($1::uuid, $2::uuid, 'amen')`,
            [STORY_ID, SURVIVOR]
          );
          expect(insert.rowCount).toBe(1);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }

        const scopeAfter = await queryScopeStoryIds(client, REQUEST_ID);
        expect(scopeAfter).toEqual(scopeBefore);
      });

      it("M3-Q: service_role cannot INSERT/UPDATE/DELETE durable scope table", async () => {
        await cleanupScenario(client);
        const { attemptId } = await seedBaseScenario(client);
        await completeDatabaseStage(attemptId);

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `INSERT INTO public.account_deletion_story_freeze_scope (deletion_request_id, story_id) VALUES ($1, $2)`,
              [REQUEST_ID, STORY_UNRELATED]
            ),
          /permission denied/i
        );

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `UPDATE public.account_deletion_story_freeze_scope SET story_id = $2 WHERE deletion_request_id = $1 AND story_id = $3`,
              [REQUEST_ID, STORY_UNRELATED, STORY_ID]
            ),
          /permission denied/i
        );

        await expectServiceRoleBlocked(
          client,
          () =>
            client.query(
              `DELETE FROM public.account_deletion_story_freeze_scope WHERE deletion_request_id = $1`,
              [REQUEST_ID]
            ),
          /permission denied/i
        );
      });
    });

    it("readiness fails closed when service_role gains private authorizer EXECUTE", async () => {
      const baseline = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_nondestructive_database_stage_ready()->>'ready')::boolean AS ready`
      );
      expect(baseline.rows[0]?.ready).toBe(true);

      try {
        await client.query(`
          GRANT EXECUTE ON FUNCTION public.account_deletion_story_database_mutation_authorized(public.stories, public.stories)
          TO service_role
        `);
        const tampered = await client.query<{ ready: boolean }>(
          `SELECT (public.verify_account_deletion_nondestructive_database_stage_ready()->>'ready')::boolean AS ready`
        );
        expect(tampered.rows[0]?.ready).toBe(false);
      } finally {
        await client.query(`
          REVOKE ALL ON FUNCTION public.account_deletion_story_database_mutation_authorized(public.stories, public.stories)
          FROM service_role
        `);
      }

      const restored = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_nondestructive_database_stage_ready()->>'ready')::boolean AS ready`
      );
      expect(restored.rows[0]?.ready).toBe(true);
    });

    it("readiness fails closed when service_role gains context-table INSERT", async () => {
      const baseline = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_nondestructive_database_stage_ready()->>'ready')::boolean AS ready`
      );
      expect(baseline.rows[0]?.ready).toBe(true);

      try {
        await client.query(`
          GRANT INSERT ON TABLE public.account_deletion_database_execution_context TO service_role
        `);
        const tampered = await client.query<{ ready: boolean }>(
          `SELECT (public.verify_account_deletion_nondestructive_database_stage_ready()->>'ready')::boolean AS ready`
        );
        expect(tampered.rows[0]?.ready).toBe(false);
      } finally {
        await client.query(`
          REVOKE INSERT ON TABLE public.account_deletion_database_execution_context FROM service_role
        `);
      }

      const restored = await client.query<{ ready: boolean }>(
        `SELECT (public.verify_account_deletion_nondestructive_database_stage_ready()->>'ready')::boolean AS ready`
      );
      expect(restored.rows[0]?.ready).toBe(true);
    });
  }
);

if (!dbUrl) {
  describe("account deletion integration harness", () => {
    it(`skips live PostgreSQL tests without ${ACCOUNT_DELETION_INTEGRATION_DB_URL_ENV}`, () => {
      expect(getAccountDeletionIntegrationDbUrl()).toBeNull();
    });
  });
}
