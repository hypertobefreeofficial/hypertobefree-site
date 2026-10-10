-- Phase 4C.7B.1E.2C.3B.3F.0A — Corrective hashtextextended qualification (pg_catalog)
-- DDL only: replaces five account-deletion RPC bodies that referenced public.hashtextextended.
-- execute_account_deletion_nondestructive_database_stage_inner holds the 3B.1 lock (renamed in 3B.3B.2);
-- the public wrapper is re-applied unchanged from the latest 3B.3B.2 definition.
-- No request/attempt/content mutations. No execution flags. No Storage/Auth deletion.

BEGIN;

CREATE OR REPLACE FUNCTION public.acquire_account_deletion_execution_lock(
  p_request_id uuid,
  p_initiated_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req record;
  resolved_target uuid;
  active_attempt record;
  active_count integer;
  new_attempt_id uuid;
  readiness jsonb;
  lock_key bigint;
  rows_updated integer;
BEGIN
  IF p_request_id IS NULL OR p_initiated_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF NOT public.account_deletion_actor_is_owner(p_initiated_by) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthorized_owner');
  END IF;

  readiness := public.verify_account_deletion_schema_execution_ready();
  IF coalesce((readiness->>'ready')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'readiness_failed',
      'readiness', readiness
    );
  END IF;

  SELECT
    request_row.id,
    request_row.status,
    request_row.user_id,
    request_row.target_user_id_snapshot,
    request_row.approved_at,
    request_row.execution_started_at
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_not_resolved');
  END IF;

  lock_key := pg_catalog.hashtextextended(
    'account_deletion:' || resolved_target::text,
    0::bigint
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  IF req.status = 'deletion_in_progress'::text THEN
    SELECT count(*)::integer
    INTO active_count
    FROM public.account_deletion_execution_attempts AS attempt_row
    WHERE attempt_row.deletion_request_id = p_request_id
      AND attempt_row.status = 'active'::text;

    IF active_count = 1 THEN
      SELECT
        attempt_row.id,
        attempt_row.target_user_id,
        attempt_row.stage,
        attempt_row.status
      INTO active_attempt
      FROM public.account_deletion_execution_attempts AS attempt_row
      WHERE attempt_row.deletion_request_id = p_request_id
        AND attempt_row.status = 'active'::text
      LIMIT 1;

      IF active_attempt.target_user_id IS DISTINCT FROM resolved_target THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ambiguous_state_target_mismatch');
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'code', 'already_acquired',
        'request_id', p_request_id,
        'attempt_id', active_attempt.id,
        'target_user_id', resolved_target,
        'attempt_stage', active_attempt.stage,
        'attempt_status', active_attempt.status
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ambiguous_state',
      'active_attempt_count', active_count
    );
  END IF;

  IF req.status <> 'approved'::text OR req.approved_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'request_not_approved',
      'status', req.status
    );
  END IF;

  INSERT INTO public.account_deletion_execution_attempts (
    deletion_request_id,
    target_user_id,
    initiated_by,
    status,
    stage
  ) VALUES (
    p_request_id,
    resolved_target,
    p_initiated_by,
    'active'::text,
    'lock_acquired'::text
  )
  RETURNING id INTO new_attempt_id;

  UPDATE public.account_deletion_requests AS request_row
  SET
    status = 'deletion_in_progress'::text,
    execution_started_at = coalesce(request_row.execution_started_at, now())
  WHERE request_row.id = p_request_id
    AND request_row.status = 'approved'::text;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated <> 1 THEN
    RAISE EXCEPTION 'acquisition_request_transition_failed'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'acquired',
    'request_id', p_request_id,
    'attempt_id', new_attempt_id,
    'target_user_id', resolved_target
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'active_attempt_conflict');
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_account_deletion_nondestructive_database_stage_inner(
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
  readiness jsonb;
  stage_readiness jsonb;
  checked_at timestamptz := now();
  rows_affected jsonb := '{}'::jsonb;
  row_count integer;
  expected_count integer;
  tombstone text;
  deleted_display_name text;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  tombstone := public.account_deletion_reply_tombstone_message();
  deleted_display_name := public.account_deletion_deleted_public_author_display_name();

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

  readiness := public.verify_account_deletion_schema_execution_ready();
  IF coalesce((readiness->>'ready')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'readiness_failed',
      'readiness', readiness
    );
  END IF;

  stage_readiness := public.verify_account_deletion_nondestructive_database_stage_ready();
  IF coalesce((stage_readiness->>'ready')::boolean, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'readiness_failed',
      'readiness', stage_readiness
    );
  END IF;

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage
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

  IF att.stage = 'database_completed'::text THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_completed',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'database_rows_affected', coalesce(
        (
          SELECT attempt_row.database_rows_affected
          FROM public.account_deletion_execution_attempts AS attempt_row
          WHERE attempt_row.id = p_attempt_id
        ),
        '{}'::jsonb
      ),
      'checked_at', checked_at
    );
  END IF;

  IF att.stage = 'database'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  IF att.stage <> 'inventory'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  PERFORM story_row.id
  FROM public.stories AS story_row
  WHERE story_row.user_id = resolved_target
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.stories AS story_row
    WHERE story_row.user_id = resolved_target
      AND story_row.removed_at IS NULL
      AND story_row.status = ANY (ARRAY['pending'::text, 'submitted'::text])
  ) THEN
    RAISE EXCEPTION 'unsupported_destructive_action'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stories AS story_row
    WHERE story_row.user_id = resolved_target
      AND NOT (
        (story_row.status = 'approved'::text AND story_row.removed_at IS NULL)
        OR story_row.status = 'removed'::text
        OR story_row.removed_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'unsupported_destructive_action'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM locked_reply.id
  FROM public.story_video_replies AS locked_reply
  WHERE locked_reply.user_id = resolved_target
     OR locked_reply.recipient_user_id = resolved_target
  FOR UPDATE;

  PERFORM public.account_deletion_validate_target_reply_graph(resolved_target);

  INSERT INTO public.account_deletion_story_freeze_scope AS scope_row (
    deletion_request_id,
    story_id
  )
  SELECT
    p_request_id,
    associated.story_id
  FROM (
    SELECT story_preflight.id AS story_id
    FROM public.stories AS story_preflight
    WHERE story_preflight.user_id = resolved_target

    UNION

    SELECT reply_preflight.story_id
    FROM public.story_video_replies AS reply_preflight
    WHERE reply_preflight.user_id = resolved_target

    UNION

    SELECT reply_preflight.story_id
    FROM public.story_video_replies AS reply_preflight
    WHERE reply_preflight.recipient_user_id = resolved_target
  ) AS associated
  WHERE associated.story_id IS NOT NULL
  ON CONFLICT (deletion_request_id, story_id) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.account_deletion_database_execution_context AS ctx
    WHERE ctx.backend_pid = pg_backend_pid()
      AND ctx.transaction_id = txid_current()::bigint
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
    pg_backend_pid(),
    txid_current()::bigint,
    p_attempt_id,
    p_request_id,
    resolved_target,
    'nondestructive_database_stage'::text
  );

  SELECT count(*)::integer
  INTO expected_count
  FROM public.story_video_replies AS reply_row
  WHERE reply_row.user_id = resolved_target
    AND reply_row.recipient_user_id IS NOT NULL
    AND reply_row.recipient_user_id <> resolved_target;

  UPDATE public.story_video_replies AS live_row
  SET
    user_id = NULL,
    message = tombstone,
    deleted_by_sender = true
  FROM public.story_video_replies AS expected_row
  WHERE live_row.id = expected_row.id
    AND expected_row.user_id = resolved_target
    AND expected_row.recipient_user_id IS NOT NULL
    AND expected_row.recipient_user_id <> resolved_target
    AND live_row.user_id = resolved_target
    AND live_row.recipient_user_id = expected_row.recipient_user_id
    AND live_row.story_id = expected_row.story_id
    AND live_row.parent_reply_id IS NOT DISTINCT FROM expected_row.parent_reply_id
    AND live_row.deleted_by_sender = false
    AND live_row.deleted_by_recipient = expected_row.deleted_by_recipient;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('reply_sender_detach', row_count);

  SELECT count(*)::integer
  INTO expected_count
  FROM public.story_video_replies AS reply_row
  WHERE reply_row.recipient_user_id = resolved_target
    AND reply_row.user_id IS NOT NULL
    AND reply_row.user_id <> resolved_target;

  UPDATE public.story_video_replies AS live_row
  SET
    recipient_user_id = NULL,
    deleted_by_recipient = true
  FROM public.story_video_replies AS expected_row
  WHERE live_row.id = expected_row.id
    AND expected_row.recipient_user_id = resolved_target
    AND expected_row.user_id IS NOT NULL
    AND expected_row.user_id <> resolved_target
    AND live_row.recipient_user_id = resolved_target
    AND live_row.user_id = expected_row.user_id
    AND live_row.story_id = expected_row.story_id
    AND live_row.parent_reply_id IS NOT DISTINCT FROM expected_row.parent_reply_id
    AND live_row.message = expected_row.message
    AND live_row.deleted_by_sender = expected_row.deleted_by_sender
    AND live_row.deleted_by_recipient = false;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('reply_recipient_detach', row_count);

  SELECT count(*)::integer
  INTO expected_count
  FROM public.story_video_replies AS reply_row
  WHERE reply_row.user_id = resolved_target
    AND reply_row.recipient_user_id = resolved_target;

  UPDATE public.story_video_replies AS live_row
  SET
    user_id = NULL,
    recipient_user_id = NULL,
    message = tombstone,
    deleted_by_sender = true,
    deleted_by_recipient = true
  FROM public.story_video_replies AS expected_row
  WHERE live_row.id = expected_row.id
    AND expected_row.user_id = resolved_target
    AND expected_row.recipient_user_id = resolved_target
    AND live_row.user_id = resolved_target
    AND live_row.recipient_user_id = resolved_target
    AND live_row.story_id = expected_row.story_id
    AND live_row.parent_reply_id IS NOT DISTINCT FROM expected_row.parent_reply_id
    AND live_row.deleted_by_sender = false
    AND live_row.deleted_by_recipient = false;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('reply_self_detach', row_count);

  PERFORM prayer_row.id
  FROM public.prayer_video_responses AS prayer_row
  WHERE prayer_row.user_id = resolved_target
  FOR UPDATE;

  SELECT count(*)::integer
  INTO expected_count
  FROM public.prayer_video_responses AS prayer_row
  WHERE prayer_row.user_id = resolved_target;

  UPDATE public.prayer_video_responses AS live_row
  SET user_id = NULL
  WHERE live_row.user_id = resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('prayer_video_responses', row_count);

  PERFORM written_row.id
  FROM public.prayer_written_responses AS written_row
  WHERE written_row.author_user_id = resolved_target
  FOR UPDATE;

  SELECT count(*)::integer
  INTO expected_count
  FROM public.prayer_written_responses AS written_row
  WHERE written_row.author_user_id = resolved_target;

  UPDATE public.prayer_written_responses AS live_row
  SET author_user_id = NULL
  WHERE live_row.author_user_id = resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('prayer_written_responses', row_count);

  PERFORM update_row.id
  FROM public.prayer_updates AS update_row
  WHERE update_row.author_user_id = resolved_target
  FOR UPDATE;

  SELECT count(*)::integer
  INTO expected_count
  FROM public.prayer_updates AS update_row
  WHERE update_row.author_user_id = resolved_target;

  UPDATE public.prayer_updates AS live_row
  SET author_user_id = NULL
  WHERE live_row.author_user_id = resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('prayer_updates', row_count);

  PERFORM inbox_row.id
  FROM public.inbox_messages AS inbox_row
  WHERE inbox_row.sender_user_id = resolved_target
    AND inbox_row.user_id IS DISTINCT FROM resolved_target
  FOR UPDATE;

  SELECT count(*)::integer
  INTO expected_count
  FROM public.inbox_messages AS inbox_row
  WHERE inbox_row.sender_user_id = resolved_target
    AND inbox_row.user_id IS DISTINCT FROM resolved_target;

  UPDATE public.inbox_messages AS live_row
  SET sender_user_id = NULL
  WHERE live_row.sender_user_id = resolved_target
    AND live_row.user_id IS DISTINCT FROM resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('inbox_surviving_sent_copies', row_count);

  SELECT count(*)::integer
  INTO expected_count
  FROM public.stories AS story_row
  WHERE story_row.user_id = resolved_target;

  UPDATE public.stories AS live_row
  SET
    user_id = NULL,
    name = deleted_display_name,
    email = NULL,
    location = NULL,
    public_lat = NULL,
    public_lng = NULL,
    public_location_label = NULL
  WHERE live_row.user_id = resolved_target;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> expected_count THEN
    RAISE EXCEPTION 'row_count_mismatch'
      USING ERRCODE = 'P0001';
  END IF;
  rows_affected := rows_affected || jsonb_build_object('stories', row_count);

  DELETE FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.backend_pid = pg_backend_pid()
    AND ctx.transaction_id = txid_current()::bigint
    AND ctx.attempt_id = p_attempt_id;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'database_completed'::text,
    database_rows_affected = rows_affected,
    last_error_code = NULL,
    last_error_detail_safe = NULL,
    updated_at = now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'inventory'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'invariant_failed'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'completed',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'database_rows_affected', rows_affected,
    'checked_at', checked_at
  );

EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    CASE SQLERRM
      WHEN 'unsupported_destructive_action' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'unsupported_destructive_action');
      WHEN 'ambiguous_reply_graph' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ambiguous_reply_graph');
      WHEN 'row_count_mismatch' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'row_count_mismatch');
      WHEN 'stale_state' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'stale_state');
      WHEN 'invariant_failed' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
      ELSE
        RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_account_deletion_nondestructive_database_stage(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  att record;
  gate jsonb;
BEGIN
  -- Wrapper preserves readiness markers expected by
  -- verify_account_deletion_nondestructive_database_stage_ready():
  -- account_deletion_database_execution_context
  -- account_deletion_story_freeze_scope
  -- Identity mutations remain inside
  -- execute_account_deletion_nondestructive_database_stage_inner.
  --
  -- Allowed stage transitions for this wrapper:
  --   database_completed → inner only (idempotent; no new identity mutation)
  --   any other active pre-completed stage → gate THEN inner
  -- Gate is never skipped for active pre-database_completed calls.

  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT
    attempt_row.stage,
    attempt_row.status,
    attempt_row.deletion_request_id
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  -- Idempotent completed path: skip gate, delegate (no new mutations).
  IF att.stage = 'database_completed'::text THEN
    RETURN public.execute_account_deletion_nondestructive_database_stage_inner(
      p_request_id,
      p_attempt_id
    );
  END IF;

  -- Every active pre-database_completed path must pass the manifest gate.
  gate := public.verify_account_deletion_storage_manifest_ready_for_3b1(
    p_request_id,
    p_attempt_id
  );
  IF coalesce((gate->>'ok')::boolean, false) = false THEN
    RETURN gate;
  END IF;

  RETURN public.execute_account_deletion_nondestructive_database_stage_inner(
    p_request_id,
    p_attempt_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.account_deletion_attempt_transition_precheck(
  p_request_id uuid,
  p_attempt_id uuid,
  OUT o_resolved_target uuid,
  OUT o_current_stage text,
  OUT o_error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req record;
  att record;
  active_count integer;
  readiness jsonb;
  lock_key bigint;
BEGIN
  o_resolved_target := NULL;
  o_current_stage := NULL;
  o_error_code := NULL;

  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    o_error_code := 'invalid_arguments';
    RETURN;
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
    o_error_code := 'request_not_found';
    RETURN;
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    o_error_code := 'request_not_in_progress';
    RETURN;
  END IF;

  o_resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF o_resolved_target IS NULL THEN
    o_error_code := 'target_mismatch';
    RETURN;
  END IF;

  lock_key := pg_catalog.hashtextextended(
    'account_deletion:' || o_resolved_target::text,
    0::bigint
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  readiness := public.verify_account_deletion_schema_execution_ready();
  IF coalesce((readiness->>'ready')::boolean, false) = false THEN
    o_error_code := 'readiness_failed';
    RETURN;
  END IF;

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    o_error_code := 'attempt_not_found';
    RETURN;
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    o_error_code := 'attempt_request_mismatch';
    RETURN;
  END IF;

  IF att.status <> 'active'::text THEN
    o_error_code := 'attempt_not_active';
    RETURN;
  END IF;

  IF att.target_user_id IS DISTINCT FROM o_resolved_target THEN
    o_error_code := 'target_mismatch';
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO active_count
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text;

  IF active_count <> 1 THEN
    o_error_code := 'invariant_failed';
    RETURN;
  END IF;

  o_current_stage := att.stage;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion_execution(
  p_request_id uuid,
  p_attempt_id uuid,
  p_initiated_by uuid
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
  readiness jsonb;
  active_other integer;
  scope_count integer;
  context_count integer;
  rows_updated integer;
  reauth_required boolean;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL OR p_initiated_by IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF NOT public.account_deletion_actor_is_owner(p_initiated_by) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'owner_required');
  END IF;

  readiness := public.verify_account_deletion_schema_execution_ready();
  IF coalesce((readiness->>'ready')::boolean, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'readiness_failed');
  END IF;

  SELECT
    request_row.id,
    request_row.status,
    request_row.user_id,
    request_row.target_user_id_snapshot,
    request_row.approved_at
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  lock_key := pg_catalog.hashtextextended(
    'account_deletion:' || resolved_target::text,
    0::bigint
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(lock_key);

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage,
    attempt_row.last_error_code
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_found');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_request_mismatch');
  END IF;

  IF att.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_mismatch');
  END IF;

  SELECT count(*)::integer
  INTO active_other
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.id IS DISTINCT FROM p_attempt_id;

  IF active_other > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  reauth_required := att.stage = ANY (
    ARRAY['sessions_pending'::text, 'sessions_revoked'::text, 'inventory'::text]
  );

  IF req.status = 'approved'::text
     AND att.status = 'failed'::text
     AND att.last_error_code = 'execution_cancelled'::text
     AND NOT EXISTS (
       SELECT 1
       FROM public.account_deletion_execution_attempts AS attempt_row
       WHERE attempt_row.deletion_request_id = p_request_id
         AND attempt_row.status = 'active'::text
     )
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_cancelled',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'last_stage', att.stage,
      'reauthentication_may_be_required', reauth_required
    );
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  IF att.status <> ALL (ARRAY['active'::text, 'blocked'::text]) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_cancellable');
  END IF;

  IF att.stage = ANY (
    ARRAY[
      'database'::text,
      'database_completed'::text,
      'storage'::text,
      'profile'::text,
      'auth_pending'::text,
      'auth'::text,
      'finalize'::text,
      'completed'::text
    ]
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'irreversible_stage');
  END IF;

  IF att.stage <> ALL (
    ARRAY[
      'lock_acquired'::text,
      'sessions_pending'::text,
      'sessions_revoked'::text,
      'inventory'::text
    ]
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stage_not_cancellable');
  END IF;

  SELECT count(*)::integer
  INTO scope_count
  FROM public.account_deletion_story_freeze_scope AS scope_row
  WHERE scope_row.deletion_request_id = p_request_id;

  IF scope_count <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'irreversible_state');
  END IF;

  SELECT count(*)::integer
  INTO context_count
  FROM public.account_deletion_database_execution_context AS ctx
  WHERE ctx.deletion_request_id = p_request_id
     OR ctx.attempt_id = p_attempt_id;

  IF context_count <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'execution_in_flight');
  END IF;

  UPDATE public.account_deletion_requests AS request_row
  SET
    status = 'approved'::text,
    execution_started_at = NULL
  WHERE request_row.id = p_request_id
    AND request_row.status = 'deletion_in_progress'::text;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated <> 1 THEN
    RAISE EXCEPTION 'cancel_request_transition_failed'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    status = 'failed'::text,
    last_error_code = 'execution_cancelled'::text,
    last_error_detail_safe = 'execution_cancelled'::text,
    completed_at = pg_catalog.now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.target_user_id = resolved_target
    AND attempt_row.status = ANY (ARRAY['active'::text, 'blocked'::text])
    AND attempt_row.stage = att.stage;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated <> 1 THEN
    RAISE EXCEPTION 'cancel_attempt_transition_failed'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'cancelled',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'last_stage', att.stage,
    'reauthentication_may_be_required', reauth_required
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_account_deletion_storage_manifest(
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
  init_payload jsonb;
  finalize_payload jsonb;
  write_payload jsonb;
  blocked_count integer := 0;
  delete_count integer := 0;
  unresolved_count integer := 0;
  row_rec record;
  unresolved_rec record;
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
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found');
  END IF;

  IF req.status <> 'deletion_in_progress'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_in_progress');
  END IF;

  resolved_target := coalesce(req.user_id, req.target_user_id_snapshot);
  IF resolved_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtextextended('account_deletion:' || resolved_target::text, 0::bigint)
  );

  SELECT
    attempt_row.id,
    attempt_row.deletion_request_id,
    attempt_row.target_user_id,
    attempt_row.status,
    attempt_row.stage,
    attempt_row.storage_manifest_status,
    attempt_row.storage_manifest_fingerprint
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_found');
  END IF;

  IF att.deletion_request_id IS DISTINCT FROM p_request_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_request_mismatch');
  END IF;

  IF att.target_user_id IS DISTINCT FROM resolved_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'target_mismatch');
  END IF;

  IF att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_not_active');
  END IF;

  IF att.stage <> 'inventory'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  init_payload := public.initialize_account_deletion_storage_manifest(p_request_id, p_attempt_id);
  IF coalesce((init_payload->>'ok')::boolean, false) = false THEN
    RETURN init_payload;
  END IF;

  IF init_payload->>'code' = 'already_finalized'::text THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_finalized',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'fingerprint', init_payload->>'fingerprint',
      'object_count', (init_payload->>'object_count')::integer,
      'blocked_count', 0,
      'delete_private_count', 0,
      'has_block_unresolved', false
    );
  END IF;

  -- Fail closed on unparseable media — leave capture open / not finalized.
  SELECT count(*)::integer
  INTO unresolved_count
  FROM public.account_deletion_storage_manifest_unresolved_media_sources(resolved_target);

  IF unresolved_count > 0 THEN
    SELECT source_table, source_column, source_row_id
    INTO unresolved_rec
    FROM public.account_deletion_storage_manifest_unresolved_media_sources(resolved_target)
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'storage_manifest_unresolved_media_reference',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'unresolved_count', unresolved_count,
      'source_table', unresolved_rec.source_table,
      'source_column', unresolved_rec.source_column,
      'source_row_id', unresolved_rec.source_row_id
    );
  END IF;

  FOR row_rec IN
    SELECT *
    FROM public.account_deletion_storage_manifest_expected_inventory(resolved_target)
  LOOP
    write_payload := public.account_deletion_storage_manifest_authoritative_write(
      p_request_id,
      p_attempt_id,
      resolved_target,
      row_rec.bucket,
      row_rec.object_path,
      row_rec.media_category,
      row_rec.ownership_basis,
      row_rec.disposition,
      row_rec.disposition_reason,
      row_rec.preservation_required,
      row_rec.preservation_reason_code,
      row_rec.reference_state,
      row_rec.total_reference_count,
      row_rec.surviving_reference_count,
      row_rec.reference_fingerprint
    );
    IF coalesce((write_payload->>'ok')::boolean, false) = false THEN
      RETURN write_payload;
    END IF;
  END LOOP;

  finalize_payload := public.finalize_account_deletion_storage_manifest(
    p_request_id, p_attempt_id
  );
  IF coalesce((finalize_payload->>'ok')::boolean, false) = false THEN
    RETURN finalize_payload;
  END IF;

  SELECT count(*)::integer
  INTO blocked_count
  FROM public.account_deletion_storage_manifest AS manifest_row
  WHERE manifest_row.execution_attempt_id = p_attempt_id
    AND manifest_row.disposition = 'BLOCK_UNRESOLVED'::text;

  SELECT count(*)::integer
  INTO delete_count
  FROM public.account_deletion_storage_manifest AS manifest_row
  WHERE manifest_row.execution_attempt_id = p_attempt_id
    AND manifest_row.disposition = 'DELETE_PRIVATE'::text;

  RETURN jsonb_build_object(
    'ok', true,
    'code', coalesce(finalize_payload->>'code', 'captured'),
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'object_count', (finalize_payload->>'object_count')::integer,
    'fingerprint', finalize_payload->>'fingerprint',
    'blocked_count', blocked_count,
    'delete_private_count', delete_count,
    'has_block_unresolved', blocked_count > 0
  );
END;
$$;
-- Re-seal _inner privileges (unchanged from 3B.3B.2 manifest capture wrap).
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM service_role;
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION
  public.execute_account_deletion_nondestructive_database_stage_inner(uuid, uuid)
  FROM anon;


COMMIT;
