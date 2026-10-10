-- Phase 4C.7B.1E.2C.3B.4A — Profile DB cleanup foundation (prepare only).
-- No profile row DELETE. No Storage physical delete. No orchestrator wiring.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.account_deletion_storage_execution_completion_blocked(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.4A precondition failed: account_deletion_storage_execution_completion_blocked missing';
  END IF;
  IF to_regprocedure('public.verify_account_deletion_storage_stage_runner_ready()') IS NULL THEN
    RAISE EXCEPTION '3B.4A precondition failed: verify_account_deletion_storage_stage_runner_ready missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Stage vocabulary: profile_completed (schema prep; no transition in 3B.4A)
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_deletion_execution_attempts
  DROP CONSTRAINT IF EXISTS account_deletion_execution_attempts_stage_check;

ALTER TABLE public.account_deletion_execution_attempts
  ADD CONSTRAINT account_deletion_execution_attempts_stage_check CHECK (
    stage = ANY (
      ARRAY[
        'preflight'::text,
        'lock_acquired'::text,
        'sessions_pending'::text,
        'sessions_revoked'::text,
        'inventory'::text,
        'database'::text,
        'database_completed'::text,
        'storage_pending'::text,
        'storage'::text,
        'storage_completed'::text,
        'profile'::text,
        'profile_completed'::text,
        'auth_pending'::text,
        'auth'::text,
        'finalize'::text,
        'completed'::text,
        'failed'::text,
        'blocked'::text
      ]
    )
  );

ALTER TABLE public.account_deletion_execution_attempts
  ADD COLUMN IF NOT EXISTS profile_rows_affected jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.account_deletion_execution_attempts.profile_rows_affected IS
  'Bounded private-table delete counts from prepare_account_deletion_profile_stage only. No PII.';

-- ---------------------------------------------------------------------------
-- B) Profile stage audit vocabulary (reuse storage execution audit table)
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_deletion_storage_execution_audit
  DROP CONSTRAINT IF EXISTS account_deletion_storage_execution_audit_event_type_check;

ALTER TABLE public.account_deletion_storage_execution_audit
  ADD CONSTRAINT account_deletion_storage_execution_audit_event_type_check CHECK (
    event_type = ANY (
      ARRAY[
        'results_initialized'::text,
        'hold_created'::text,
        'hold_released'::text,
        'hold_create_rejected_committed'::text,
        'claim_acquired'::text,
        'claim_expired_reclaimed'::text,
        'execution_state_changed'::text,
        'delete_authorized'::text,
        'delete_authorized_missing_precheck'::text,
        'delete_completed'::text,
        'storage_stage_entered'::text,
        'storage_stage_completed'::text,
        'profile_stage_entered'::text,
        'profile_private_data_deleted'::text,
        'profile_identity_scrubbed'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- C) Internal helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_scrubbed_profile_email(p_target_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    'account-deletion+' || p_target_user_id::text || '@deleted.invalid';
$$;

ALTER FUNCTION public.account_deletion_scrubbed_profile_email(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_scrubbed_profile_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_scrubbed_profile_email(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_scrubbed_profile_email(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_scrubbed_profile_email(uuid) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_scrubbed_profile_username(p_target_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    'del_' || substring(replace(p_target_user_id::text, '-', ''), 1, 20);
$$;

ALTER FUNCTION public.account_deletion_scrubbed_profile_username(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_scrubbed_profile_username(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_scrubbed_profile_username(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_scrubbed_profile_username(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_scrubbed_profile_username(uuid) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_profile_username_is_deletion_tombstone_namespace(
  p_username text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    p_username IS NOT NULL
    AND p_username ~ '^del_[0-9a-f]{20}$';
$$;

ALTER FUNCTION public.account_deletion_profile_username_is_deletion_tombstone_namespace(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_username_is_deletion_tombstone_namespace(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_username_is_deletion_tombstone_namespace(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_username_is_deletion_tombstone_namespace(text) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_username_is_deletion_tombstone_namespace(text) FROM service_role;

-- Profile-stage transaction context (same table as 3B.1; purpose discriminates).
ALTER TABLE public.account_deletion_database_execution_context
  DROP CONSTRAINT IF EXISTS account_deletion_database_execution_context_purpose_check;

ALTER TABLE public.account_deletion_database_execution_context
  ADD CONSTRAINT account_deletion_database_execution_context_purpose_check CHECK (
    purpose = ANY (
      ARRAY[
        'nondestructive_database_stage'::text,
        'profile_stage'::text
      ]
    )
  );

COMMENT ON TABLE public.account_deletion_database_execution_context IS
  'Transaction-scoped, backend-bound authorization for account-deletion executor mutations. '
  '3B.1: nondestructive_database_stage. 3B.4A: profile_stage private deletes/scrub. '
  'No direct caller access. Rows must never survive commit.';

CREATE OR REPLACE FUNCTION public.account_deletion_profile_execution_context_is_valid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_deletion_database_execution_context AS ctx
    INNER JOIN public.account_deletion_execution_attempts AS att
      ON att.id = ctx.attempt_id
    INNER JOIN public.account_deletion_requests AS req
      ON req.id = ctx.deletion_request_id
    WHERE ctx.backend_pid = pg_catalog.pg_backend_pid()
      AND ctx.transaction_id = pg_catalog.txid_current()::bigint
      AND ctx.purpose = 'profile_stage'::text
      AND att.status = 'active'::text
      AND att.stage IN ('storage_completed'::text, 'profile'::text)
      AND att.deletion_request_id = ctx.deletion_request_id
      AND att.target_user_id = ctx.target_user_id
      AND req.id = ctx.deletion_request_id
      AND req.status = 'deletion_in_progress'::text
      AND coalesce(req.user_id, req.target_user_id_snapshot) = ctx.target_user_id
  );
$$;

ALTER FUNCTION public.account_deletion_profile_execution_context_is_valid() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_execution_context_is_valid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_execution_context_is_valid() FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_execution_context_is_valid() FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_execution_context_is_valid() FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_profile_private_row_delete_authorized(
  p_row_owner_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
BEGIN
  IF NOT public.account_deletion_profile_execution_context_is_valid() THEN
    RETURN false;
  END IF;

  SELECT ctx.target_user_id
  INTO target
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_catalog.pg_backend_pid()
    AND ctx.transaction_id = pg_catalog.txid_current()::bigint
    AND ctx.purpose = 'profile_stage'::text;

  IF target IS NULL THEN
    RETURN false;
  END IF;

  RETURN p_row_owner_user_id IS NOT DISTINCT FROM target;
END;
$$;

ALTER FUNCTION public.account_deletion_profile_private_row_delete_authorized(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_private_row_delete_authorized(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_private_row_delete_authorized(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_private_row_delete_authorized(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_private_row_delete_authorized(uuid) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_profile_recipient_inbox_delete_authorized(
  p_row public.inbox_messages
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
BEGIN
  IF NOT public.account_deletion_profile_execution_context_is_valid() THEN
    RETURN false;
  END IF;

  SELECT ctx.target_user_id
  INTO target
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_catalog.pg_backend_pid()
    AND ctx.transaction_id = pg_catalog.txid_current()::bigint
    AND ctx.purpose = 'profile_stage'::text;

  IF target IS NULL THEN
    RETURN false;
  END IF;

  RETURN p_row.user_id IS NOT DISTINCT FROM target;
END;
$$;

ALTER FUNCTION public.account_deletion_profile_recipient_inbox_delete_authorized(public.inbox_messages) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_recipient_inbox_delete_authorized(public.inbox_messages) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_recipient_inbox_delete_authorized(public.inbox_messages) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_recipient_inbox_delete_authorized(public.inbox_messages) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_recipient_inbox_delete_authorized(public.inbox_messages) FROM service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_profile_username_scrub_authorized(
  p_profile_id uuid,
  p_new_username text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
  expected_tombstone text;
BEGIN
  IF p_profile_id IS NULL OR p_new_username IS NULL THEN
    RETURN false;
  END IF;

  expected_tombstone := public.account_deletion_scrubbed_profile_username(p_profile_id);
  IF p_new_username IS DISTINCT FROM expected_tombstone THEN
    RETURN false;
  END IF;

  IF NOT public.account_deletion_profile_execution_context_is_valid() THEN
    RETURN false;
  END IF;

  SELECT ctx.target_user_id
  INTO target
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_catalog.pg_backend_pid()
    AND ctx.transaction_id = pg_catalog.txid_current()::bigint
    AND ctx.purpose = 'profile_stage'::text;

  IF target IS NULL THEN
    RETURN false;
  END IF;

  RETURN p_profile_id IS NOT DISTINCT FROM target;
END;
$$;

ALTER FUNCTION public.account_deletion_profile_username_scrub_authorized(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_username_scrub_authorized(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_username_scrub_authorized(uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_username_scrub_authorized(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_username_scrub_authorized(uuid, text) FROM service_role;

CREATE OR REPLACE FUNCTION public.trg_account_deletion_shared_inbox_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.account_deletion_inbox_row_shared_write_blocked(NEW.user_id, NEW.sender_user_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: inbox write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.account_deletion_inbox_row_shared_write_blocked(OLD.user_id, OLD.sender_user_id)
       OR public.account_deletion_inbox_row_shared_write_blocked(NEW.user_id, NEW.sender_user_id) THEN
      IF public.account_deletion_inbox_message_database_mutation_authorized(OLD, NEW) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Account deletion in progress: inbox write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.account_deletion_inbox_row_shared_write_blocked(OLD.user_id, OLD.sender_user_id) THEN
      IF public.account_deletion_profile_recipient_inbox_delete_authorized(OLD) THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'Account deletion in progress: inbox write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_shared_inbox_write_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_shared_inbox_write_freeze() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id)
       OR public.account_deletion_story_shared_write_blocked(NEW.story_id) THEN
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF public.account_deletion_story_shared_write_blocked(OLD.story_id) THEN
      IF public.account_deletion_profile_private_row_delete_authorized(OLD.user_id) THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'Account deletion in progress: story-associated write blocked'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trg_account_deletion_shared_story_id_engagement_write_freeze() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_username_safety()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  duplicate_exists boolean;
  next_change_at timestamptz;
  deletion_tombstone_username text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.username IS NULL THEN
      NEW.username_changed_at := NULL;
      RETURN NEW;
    END IF;

    IF NEW.username !~ '^[a-z0-9_]{3,24}$' THEN
      RAISE EXCEPTION
        'Username must contain only lowercase letters, numbers, or underscores and must be 3 to 24 characters long.'
        USING ERRCODE = '23514';
    END IF;

    IF public.is_reserved_username(NEW.username)
       AND NOT NEW.is_owner
       AND NOT NEW.can_use_reserved_username THEN
      RAISE EXCEPTION
        'That username is reserved for HTBF or approved official accounts.'
        USING ERRCODE = '23514';
    END IF;

    IF public.account_deletion_profile_username_is_deletion_tombstone_namespace(NEW.username)
       AND NOT public.account_deletion_profile_username_scrub_authorized(NEW.id, NEW.username) THEN
      RAISE EXCEPTION
        'That username is reserved for account deletion.'
        USING ERRCODE = '23514';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.profiles AS profile_row
      WHERE lower(profile_row.username) = lower(NEW.username)
        AND profile_row.id <> NEW.id
    )
    INTO duplicate_exists;

    IF duplicate_exists THEN
      RAISE EXCEPTION
        'That username is already taken. Please choose another username.'
        USING ERRCODE = '23505';
    END IF;

    NEW.username_changed_at := pg_catalog.now();
    RETURN NEW;
  END IF;

  IF NEW.username IS NOT DISTINCT FROM OLD.username THEN
    NEW.username_changed_at := OLD.username_changed_at;
    RETURN NEW;
  END IF;

  deletion_tombstone_username := public.account_deletion_scrubbed_profile_username(OLD.id);
  IF NEW.username = deletion_tombstone_username
     AND public.account_deletion_profile_username_scrub_authorized(OLD.id, NEW.username) THEN
    NEW.username_changed_at := OLD.username_changed_at;
    RETURN NEW;
  END IF;

  IF public.account_deletion_profile_username_is_deletion_tombstone_namespace(NEW.username) THEN
    RAISE EXCEPTION
      'That username is reserved for account deletion.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.username IS NOT NULL AND NEW.username IS NULL THEN
    RAISE EXCEPTION
      'An established username cannot be removed. Please choose a replacement username.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.username !~ '^[a-z0-9_]{3,24}$' THEN
    RAISE EXCEPTION
      'Username must contain only lowercase letters, numbers, or underscores and must be 3 to 24 characters long.'
      USING ERRCODE = '23514';
  END IF;

  IF public.is_reserved_username(NEW.username)
     AND NOT NEW.is_owner
     AND NOT NEW.can_use_reserved_username THEN
    RAISE EXCEPTION
      'That username is reserved for HTBF or approved official accounts.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.username IS NOT NULL
     AND OLD.username_changed_at IS NOT NULL
     AND OLD.username_changed_at > pg_catalog.now() - interval '30 days' THEN
    next_change_at := OLD.username_changed_at + interval '30 days';

    RAISE EXCEPTION
      'Username changes are limited to once every 30 days. You can change it again after %.',
      to_char(
        next_change_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD HH24:MI UTC'
      )
      USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile_row
    WHERE lower(profile_row.username) = lower(NEW.username)
      AND profile_row.id <> OLD.id
  )
  INTO duplicate_exists;

  IF duplicate_exists THEN
    RAISE EXCEPTION
      'That username is already taken. Please choose another username.'
      USING ERRCODE = '23505';
  END IF;

  NEW.username_changed_at := pg_catalog.now();

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_username_safety() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_username_safety() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.account_deletion_profile_cleanup_snapshot(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target uuid;
  scrubbed_email text;
  inbox_remaining integer := 0;
  reactions_remaining integer := 0;
  saved_remaining integer := 0;
  follows_remaining integer := 0;
  search_prefs_remaining integer := 0;
  blocks_remaining integer := 0;
  deferred_profile_count integer := 0;
  deferred_profile_hold_count integer := 0;
  profile_exists boolean := false;
  avatar_severed boolean := false;
  identity_scrubbed boolean := false;
  scrubbed_username text;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT attempt_row.target_user_id
  INTO target
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id;

  IF target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  scrubbed_email := public.account_deletion_scrubbed_profile_email(target);
  scrubbed_username := public.account_deletion_scrubbed_profile_username(target);

  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS profile_row WHERE profile_row.id = target
  ) INTO profile_exists;

  IF profile_exists THEN
    SELECT
      profile_row.avatar_url IS NULL
      AND profile_row.email = scrubbed_email
      AND profile_row.display_name IS NULL
      AND profile_row.username = scrubbed_username
      AND profile_row.real_name IS NULL
      AND profile_row.location IS NULL
      AND profile_row.bio IS NULL
      AND profile_row.deletion_requested_at IS NULL
      AND profile_row.journey_focus = 'encouragement'::text
      AND profile_row.show_location = false
      AND profile_row.show_real_name = false
      AND profile_row.allow_prayer_notifications = false
      AND profile_row.allow_story_notifications = false
      AND profile_row.notify_replies = false
      AND profile_row.notify_prayers = false
      AND profile_row.notify_praise = false
      AND profile_row.notify_journey_updates = false
      AND profile_row.notify_email_updates = false
      AND profile_row.allow_video_responses = false
      AND profile_row.allow_prayer_messages = false
      AND profile_row.allow_journey_messages = false
    INTO identity_scrubbed
    FROM public.profiles AS profile_row
    WHERE profile_row.id = target;

    SELECT profile_row.avatar_url IS NULL
    INTO avatar_severed
    FROM public.profiles AS profile_row
    WHERE profile_row.id = target;
  ELSE
    avatar_severed := true;
    identity_scrubbed := true;
  END IF;

  SELECT count(*)::integer INTO inbox_remaining
  FROM public.inbox_messages AS inbox_row
  WHERE inbox_row.user_id = target;

  SELECT count(*)::integer INTO reactions_remaining
  FROM public.story_reactions AS reaction_row
  WHERE reaction_row.user_id = target;

  SELECT count(*)::integer INTO saved_remaining
  FROM public.saved_content AS saved_row
  WHERE saved_row.user_id = target;

  SELECT count(*)::integer INTO follows_remaining
  FROM public.prayer_follows AS follow_row
  WHERE follow_row.user_id = target;

  SELECT count(*)::integer INTO search_prefs_remaining
  FROM public.prayer_search_preferences AS pref_row
  WHERE pref_row.user_id = target;

  SELECT count(*)::integer INTO blocks_remaining
  FROM public.blocked_users AS block_row
  WHERE block_row.blocker_user_id = target
     OR block_row.blocked_user_id = target;

  SELECT count(*)::integer INTO deferred_profile_count
  FROM public.account_deletion_storage_execution_results AS result_row
  WHERE result_row.execution_attempt_id = p_attempt_id
    AND result_row.deletion_request_id = p_request_id
    AND result_row.disposition_snapshot = 'DEFER_PROFILE'::text
    AND result_row.execution_state = 'deferred_profile'::text;

  SELECT count(*)::integer INTO deferred_profile_hold_count
  FROM public.account_deletion_storage_execution_results AS result_row
  WHERE result_row.execution_attempt_id = p_attempt_id
    AND result_row.deletion_request_id = p_request_id
    AND result_row.disposition_snapshot = 'DEFER_PROFILE'::text
    AND public.account_deletion_storage_preservation_hold_active(
      p_request_id,
      p_attempt_id,
      result_row.manifest_object_id
    );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'snapshot',
    'profile_row_exists', profile_exists,
    'avatar_url_severed', avatar_severed,
    'identity_scrubbed', identity_scrubbed,
    'private_inbox_remaining', inbox_remaining,
    'story_reactions_remaining', reactions_remaining,
    'saved_content_remaining', saved_remaining,
    'prayer_follows_remaining', follows_remaining,
    'prayer_search_preferences_remaining', search_prefs_remaining,
    'blocked_users_remaining', blocks_remaining,
    'deferred_profile_result_count', deferred_profile_count,
    'deferred_profile_active_hold_count', deferred_profile_hold_count
  );
END;
$$;

ALTER FUNCTION public.account_deletion_profile_cleanup_snapshot(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_cleanup_snapshot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_cleanup_snapshot(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_cleanup_snapshot(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.account_deletion_profile_cleanup_snapshot(uuid, uuid) FROM service_role;

-- ---------------------------------------------------------------------------
-- D) Prepare profile stage (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_account_deletion_profile_stage(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req record;
  att record;
  resolved_target uuid;
  lock_key bigint;
  storage_gate jsonb;
  snapshot jsonb;
  scrubbed_email text;
  scrubbed_username text;
  row_count integer;
  rows_affected jsonb := '{}'::jsonb;
  checked_at timestamptz := pg_catalog.now();
  already_prepared boolean := false;
  entry_stage text;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT
    request_row.id,
    request_row.status,
    request_row.user_id,
    request_row.target_user_id_snapshot
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_unresolved');
  END IF;

  lock_key := pg_catalog.hashtextextended(
    'account_deletion:' || resolved_target::text,
    0::bigint
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage,
    attempt_row.storage_manifest_status,
    attempt_row.profile_rows_affected
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.stage IN (
    'auth_pending'::text,
    'auth'::text,
    'finalize'::text,
    'completed'::text,
    'profile_completed'::text
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'irreversible_stage');
  END IF;

  IF att.stage NOT IN ('storage_completed'::text, 'profile'::text) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  entry_stage := att.stage;

  IF att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  storage_gate := public.account_deletion_storage_execution_completion_blocked(
    p_request_id,
    p_attempt_id
  );
  IF coalesce((storage_gate->>'ok')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'storage_execution_not_complete',
      'detail', storage_gate
    );
  END IF;

  snapshot := public.account_deletion_profile_cleanup_snapshot(p_request_id, p_attempt_id);
  IF coalesce((snapshot->>'ok')::boolean, false) = false THEN
    RETURN snapshot;
  END IF;

  already_prepared :=
    att.stage = 'profile'::text
    AND coalesce((snapshot->>'avatar_url_severed')::boolean, false) = true
    AND coalesce((snapshot->>'identity_scrubbed')::boolean, false) = true
    AND coalesce((snapshot->>'private_inbox_remaining')::integer, -1) = 0
    AND coalesce((snapshot->>'story_reactions_remaining')::integer, -1) = 0
    AND coalesce((snapshot->>'saved_content_remaining')::integer, -1) = 0
    AND coalesce((snapshot->>'prayer_follows_remaining')::integer, -1) = 0
    AND coalesce((snapshot->>'prayer_search_preferences_remaining')::integer, -1) = 0
    AND coalesce((snapshot->>'blocked_users_remaining')::integer, -1) = 0
    AND coalesce((snapshot->>'profile_row_exists')::boolean, false) = true;

  IF already_prepared THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_prepared',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'stage', 'profile'::text,
      'profile_rows_affected', coalesce(att.profile_rows_affected, '{}'::jsonb),
      'cleanup_snapshot', snapshot,
      'checked_at', checked_at
    );
  END IF;

  scrubbed_email := public.account_deletion_scrubbed_profile_email(resolved_target);
  scrubbed_username := public.account_deletion_scrubbed_profile_username(resolved_target);

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS profile_row
    WHERE profile_row.username IS NOT NULL
      AND lower(profile_row.username) = lower(scrubbed_username)
      AND profile_row.id IS DISTINCT FROM resolved_target
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'profile_username_tombstone_unavailable'
    );
  END IF;

  IF att.stage = 'storage_completed'::text THEN
    PERFORM public.account_deletion_storage_execution_audit_append(
      'profile_stage_entered'::text,
      p_request_id,
      p_attempt_id,
      NULL,
      NULL,
      NULL,
      NULL,
      'profile'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.account_deletion_database_execution_context AS ctx
    WHERE ctx.backend_pid = pg_catalog.pg_backend_pid()
      AND ctx.transaction_id = pg_catalog.txid_current()::bigint
  ) THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.account_deletion_database_execution_context (
    backend_pid,
    transaction_id,
    attempt_id,
    deletion_request_id,
    target_user_id,
    purpose
  ) VALUES (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current()::bigint,
    p_attempt_id,
    p_request_id,
    resolved_target,
    'profile_stage'::text
  );

  DELETE FROM public.inbox_messages AS inbox_row
  WHERE inbox_row.user_id = resolved_target;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  rows_affected := rows_affected || jsonb_build_object('inbox_messages_recipient_owned', row_count);

  DELETE FROM public.story_reactions AS reaction_row
  WHERE reaction_row.user_id = resolved_target;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  rows_affected := rows_affected || jsonb_build_object('story_reactions', row_count);

  DELETE FROM public.saved_content AS saved_row
  WHERE saved_row.user_id = resolved_target;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  rows_affected := rows_affected || jsonb_build_object('saved_content', row_count);

  DELETE FROM public.prayer_follows AS follow_row
  WHERE follow_row.user_id = resolved_target;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  rows_affected := rows_affected || jsonb_build_object('prayer_follows', row_count);

  DELETE FROM public.prayer_search_preferences AS pref_row
  WHERE pref_row.user_id = resolved_target;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  rows_affected := rows_affected || jsonb_build_object('prayer_search_preferences', row_count);

  DELETE FROM public.blocked_users AS block_row
  WHERE block_row.blocker_user_id = resolved_target
     OR block_row.blocked_user_id = resolved_target;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  rows_affected := rows_affected || jsonb_build_object('blocked_users', row_count);

  PERFORM public.account_deletion_storage_execution_audit_append(
    'profile_private_data_deleted'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    'private_tables'
  );

  UPDATE public.profiles AS profile_row
  SET
    email = scrubbed_email,
    display_name = NULL,
    username = scrubbed_username,
    real_name = NULL,
    location = NULL,
    bio = NULL,
    avatar_url = NULL,
    deletion_requested_at = NULL,
    journey_focus = 'encouragement'::text,
    show_location = false,
    show_real_name = false,
    allow_prayer_notifications = false,
    allow_story_notifications = false,
    notify_replies = false,
    notify_prayers = false,
    notify_praise = false,
    notify_journey_updates = false,
    notify_email_updates = false,
    allow_video_responses = false,
    allow_prayer_messages = false,
    allow_journey_messages = false,
    updated_at = pg_catalog.now()
  WHERE profile_row.id = resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'profile_row_missing'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'profile_identity_scrubbed'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    'identity_scrubbed'
  );

  rows_affected := rows_affected || jsonb_build_object('profiles_scrubbed', 1);

  DELETE FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_catalog.pg_backend_pid()
    AND ctx.transaction_id = pg_catalog.txid_current()::bigint
    AND ctx.attempt_id = p_attempt_id
    AND ctx.purpose = 'profile_stage'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'profile'::text,
    profile_rows_affected = rows_affected,
    last_error_code = NULL,
    last_error_detail_safe = NULL,
    updated_at = pg_catalog.now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage IN ('storage_completed'::text, 'profile'::text);

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  snapshot := public.account_deletion_profile_cleanup_snapshot(p_request_id, p_attempt_id);

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'prepared'::text,
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'stage', 'profile'::text,
    'profile_rows_affected', rows_affected,
    'cleanup_snapshot', snapshot,
    'checked_at', checked_at
  );

-- Function-level BEGIN/EXCEPTION: a raised unique_violation rolls back all statements
-- in this block (context, deletes, audits, partial scrub) before the handler runs.
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'profile_username_tombstone_unavailable'
    );
  WHEN SQLSTATE 'P0001' THEN
    CASE SQLERRM
      WHEN 'profile_row_missing' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'profile_not_found');
      WHEN 'invariant_failed' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
      ELSE
        RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
    END CASE;
END;
$$;

ALTER FUNCTION public.prepare_account_deletion_profile_stage(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prepare_account_deletion_profile_stage(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_account_deletion_profile_stage(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.prepare_account_deletion_profile_stage(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion_profile_stage(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- E) Profile stage readiness
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_profile_stage_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prerequisites jsonb := '[]'::jsonb;
  all_ready boolean := true;
  check_ok boolean;
  fn_def text;
  stage_check text;
  audit_check text;
  storage_runner jsonb;
  namespace_collision_count integer := 0;
  prepare_oid oid;
BEGIN
  prepare_oid := to_regprocedure('public.prepare_account_deletion_profile_stage(uuid, uuid)');

  check_ok := prepare_oid IS NOT NULL
    AND to_regprocedure('public.account_deletion_profile_cleanup_snapshot(uuid, uuid)') IS NOT NULL
    AND to_regprocedure('public.account_deletion_scrubbed_profile_email(uuid)') IS NOT NULL
    AND to_regprocedure('public.account_deletion_scrubbed_profile_username(uuid)') IS NOT NULL
    AND to_regprocedure('public.account_deletion_profile_username_is_deletion_tombstone_namespace(text)') IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_stage_rpcs_present',
      'ready', check_ok,
      'detail', 'prepare + snapshot + scrub helpers + tombstone namespace guard installed'
    )
  );
  all_ready := all_ready AND check_ok;

  fn_def := pg_catalog.pg_get_functiondef(prepare_oid);
  check_ok := fn_def ILIKE '%SECURITY DEFINER%'
    AND (
      fn_def ILIKE '%SET search_path = ''''%'
      OR fn_def ILIKE '%SET search_path TO ''''%'
    )
    AND fn_def ILIKE '%pg_catalog.hashtextextended%'
    AND fn_def NOT ILIKE '%public.hashtextextended%'
    AND fn_def ILIKE '%account_deletion_storage_execution_completion_blocked%'
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc_row
      WHERE proc_row.oid = prepare_oid
        AND pg_catalog.pg_get_userbyid(proc_row.proowner) = 'postgres'
    );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_prepare_hardening',
      'ready', check_ok,
      'detail', 'prepare is SECURITY DEFINER postgres-owned with hardened search_path'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := NOT pg_catalog.has_function_privilege(
    'public',
    'public.prepare_account_deletion_profile_stage(uuid, uuid)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.prepare_account_deletion_profile_stage(uuid, uuid)',
    'EXECUTE'
  )
  AND NOT pg_catalog.has_function_privilege(
    'anon',
    'public.prepare_account_deletion_profile_stage(uuid, uuid)',
    'EXECUTE'
  )
  AND pg_catalog.has_function_privilege(
    'service_role',
    'public.prepare_account_deletion_profile_stage(uuid, uuid)',
    'EXECUTE'
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_prepare_grants_service_role_only',
      'ready', check_ok,
      'detail', 'prepare executable only by service_role'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok :=
    NOT pg_catalog.has_function_privilege(
      'public',
      'public.account_deletion_profile_execution_context_is_valid()',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.account_deletion_profile_execution_context_is_valid()',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'anon',
      'public.account_deletion_profile_execution_context_is_valid()',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.account_deletion_profile_execution_context_is_valid()',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.account_deletion_profile_username_scrub_authorized(uuid, text)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.account_deletion_profile_private_row_delete_authorized(uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.account_deletion_profile_recipient_inbox_delete_authorized(public.inbox_messages)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.account_deletion_profile_cleanup_snapshot(uuid, uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.account_deletion_scrubbed_profile_email(uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.account_deletion_scrubbed_profile_username(uuid)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'public.account_deletion_profile_username_is_deletion_tombstone_namespace(text)',
      'EXECUTE'
    );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_internal_helpers_sealed',
      'ready', check_ok,
      'detail', 'profile-stage internal helpers not executable by service_role/authenticated/anon'
    )
  );
  all_ready := all_ready AND check_ok;

  SELECT pg_catalog.pg_get_constraintdef(con.oid)
  INTO stage_check
  FROM pg_catalog.pg_constraint AS con
  WHERE con.conname = 'account_deletion_execution_attempts_stage_check'
    AND con.conrelid = 'public.account_deletion_execution_attempts'::regclass;

  check_ok := stage_check ~ '''profile''::text'
    AND stage_check ~ '''profile_completed''::text';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_stage_check_vocabulary',
      'ready', check_ok,
      'detail', 'attempt stage CHECK includes exact profile + profile_completed'
    )
  );
  all_ready := all_ready AND check_ok;

  SELECT pg_catalog.pg_get_constraintdef(con.oid)
  INTO audit_check
  FROM pg_catalog.pg_constraint AS con
  WHERE con.conname = 'account_deletion_storage_execution_audit_event_type_check'
    AND con.conrelid = 'public.account_deletion_storage_execution_audit'::regclass;

  check_ok := audit_check ~ '''profile_stage_entered''::text'
    AND audit_check ~ '''profile_private_data_deleted''::text'
    AND audit_check ~ '''profile_identity_scrubbed''::text';
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_audit_event_vocabulary',
      'ready', check_ok,
      'detail', 'storage execution audit CHECK includes profile stage events'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attr
    WHERE attr.attrelid = 'public.account_deletion_execution_attempts'::regclass
      AND attr.attname = 'profile_rows_affected'
      AND NOT attr.attisdropped
  );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_rows_affected_column',
      'ready', check_ok,
      'detail', 'attempt.profile_rows_affected jsonb present'
    )
  );
  all_ready := all_ready AND check_ok;

  check_ok :=
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attr
      WHERE attr.attrelid = 'public.profiles'::regclass
        AND attr.attname = 'avatar_url'
        AND NOT attr.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attr
      WHERE attr.attrelid = 'public.inbox_messages'::regclass
        AND attr.attname = 'user_id'
        AND NOT attr.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attr
      WHERE attr.attrelid = 'public.story_reactions'::regclass
        AND attr.attname = 'user_id'
        AND NOT attr.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attr
      WHERE attr.attrelid = 'public.saved_content'::regclass
        AND attr.attname = 'user_id'
        AND NOT attr.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attr
      WHERE attr.attrelid = 'public.prayer_follows'::regclass
        AND attr.attname = 'user_id'
        AND NOT attr.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attr
      WHERE attr.attrelid = 'public.prayer_search_preferences'::regclass
        AND attr.attname = 'user_id'
        AND NOT attr.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attr
      WHERE attr.attrelid = 'public.blocked_users'::regclass
        AND attr.attname = 'blocker_user_id'
        AND NOT attr.attisdropped
    )
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attr
      WHERE attr.attrelid = 'public.blocked_users'::regclass
        AND attr.attname = 'blocked_user_id'
        AND NOT attr.attisdropped
    );
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_private_table_columns',
      'ready', check_ok,
      'detail', 'private delete targets and profiles.avatar_url columns exist'
    )
  );
  all_ready := all_ready AND check_ok;

  SELECT count(*)::integer
  INTO namespace_collision_count
  FROM public.profiles AS profile_row
  WHERE profile_row.username IS NOT NULL
    AND public.account_deletion_profile_username_is_deletion_tombstone_namespace(
      lower(profile_row.username)
    )
    AND lower(profile_row.username) IS DISTINCT FROM lower(
      public.account_deletion_scrubbed_profile_username(profile_row.id)
    );

  check_ok := namespace_collision_count = 0;
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_deletion_username_namespace_clear',
      'ready', check_ok,
      'detail',
        CASE
          WHEN check_ok THEN 'no unexpected deletion-namespace username collisions'
          ELSE 'unexpected deletion-namespace username collision count=' || namespace_collision_count::text
        END
    )
  );
  all_ready := all_ready AND check_ok;

  storage_runner := public.verify_account_deletion_storage_stage_runner_ready();
  check_ok := coalesce((storage_runner->>'ready')::boolean, false);
  prerequisites := prerequisites || jsonb_build_array(
    jsonb_build_object(
      'id', 'profile_prior_storage_stage_runner_ready',
      'ready', check_ok,
      'detail', 'storage stage runner readiness prerequisite satisfied'
    )
  );
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_profile_stage_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_stage_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_stage_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_profile_stage_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_profile_stage_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- F) Schema execution readiness composition (non-recursive)
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b4a;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  core jsonb;
  profile_stage jsonb;
  prerequisites jsonb;
  all_ready boolean;
  profile_count integer;
BEGIN
  core := public.verify_account_deletion_schema_execution_ready_before_3b4a();
  profile_stage := public.verify_account_deletion_profile_stage_ready();

  prerequisites :=
    coalesce(core->'prerequisites', '[]'::jsonb)
    || coalesce(profile_stage->'prerequisites', '[]'::jsonb);

  SELECT count(*)::integer
  INTO profile_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'profile_stage_rpcs_present';

  all_ready :=
    coalesce((core->>'ready')::boolean, false)
    AND coalesce((profile_stage->>'ready')::boolean, false)
    AND profile_count = 1;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_schema_execution_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_schema_execution_ready() TO service_role;

COMMENT ON FUNCTION public.verify_account_deletion_schema_execution_ready() IS
  'Live catalog probe: pre-3B.4A core + profile stage foundation (3B.4A). '
  'Does not enable execution flags or perform profile/media deletion.';

COMMENT ON FUNCTION public.prepare_account_deletion_profile_stage(uuid, uuid) IS
  '3B.4A: storage_completed→profile DB cleanup only. Scrubs profile PII and deletes '
  'private account rows. Does not DELETE profiles row or physical Storage objects. '
  'Not wired to HTTP orchestrator.';

COMMIT;
