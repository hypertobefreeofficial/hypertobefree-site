-- Phase 4C.7B.1E.2C.3B.4D.1 — Auth deletion DB authority (prepare/claim/complete only).
-- No auth.users mutation, no Supabase Auth API, no orchestrator wiring.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.finalize_account_deletion_profile_stage(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '3B.4D.1 precondition failed: profile completion finalizer missing';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- A) Attempt-level Auth execution claim state (reuse started/deleted timestamps)
-- ---------------------------------------------------------------------------

ALTER TABLE public.account_deletion_execution_attempts
  ADD COLUMN IF NOT EXISTS auth_delete_claim_token uuid NULL,
  ADD COLUMN IF NOT EXISTS auth_delete_claim_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS auth_delete_commit_token uuid NULL,
  ADD COLUMN IF NOT EXISTS auth_delete_commit_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS auth_delete_completion_outcome text NULL,
  ADD COLUMN IF NOT EXISTS auth_rows_affected jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.account_deletion_execution_attempts
  DROP CONSTRAINT IF EXISTS account_deletion_execution_attempts_auth_delete_outcome_check;

ALTER TABLE public.account_deletion_execution_attempts
  ADD CONSTRAINT account_deletion_execution_attempts_auth_delete_outcome_check CHECK (
    auth_delete_completion_outcome IS NULL
    OR auth_delete_completion_outcome = ANY (
      ARRAY['deleted'::text, 'already_absent'::text]
    )
  );

COMMENT ON COLUMN public.account_deletion_execution_attempts.auth_delete_claim_token IS
  'Opaque lease token for Auth delete executor claim; cleared after completion.';
COMMENT ON COLUMN public.account_deletion_execution_attempts.auth_delete_commit_token IS
  'Opaque commit token required by complete_account_deletion_auth_execution; no PII.';

-- ---------------------------------------------------------------------------
-- B) Audit vocabulary
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
        'profile_identity_scrubbed'::text,
        'profile_media_claimed'::text,
        'profile_media_claim_reclaimed'::text,
        'profile_media_delete_authorized'::text,
        'profile_media_completed'::text,
        'profile_shell_deleted'::text,
        'auth_stage_entered'::text,
        'auth_execution_claimed'::text,
        'auth_execution_claim_reclaimed'::text,
        'auth_execution_completed'::text
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- C) Internal helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_deletion_auth_preservation_hold_active(
  p_request_id uuid,
  p_attempt_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_deletion_storage_preservation_holds AS hold_row
    WHERE hold_row.deletion_request_id = p_request_id
      AND hold_row.execution_attempt_id = p_attempt_id
      AND hold_row.released_at IS NULL
  );
$$;

ALTER FUNCTION public.account_deletion_auth_preservation_hold_active(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_auth_preservation_hold_active(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_auth_preservation_hold_active(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_auth_preservation_hold_active(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_auth_preservation_hold_active(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.account_deletion_profile_completion_evidence_valid(
  p_request_id uuid,
  p_attempt_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM public.profiles AS profile_row
      WHERE profile_row.id = p_target_user_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.account_deletion_execution_attempts AS attempt_row
      WHERE attempt_row.id = p_attempt_id
        AND attempt_row.deletion_request_id = p_request_id
        AND attempt_row.target_user_id = p_target_user_id
        AND attempt_row.stage = ANY (
          ARRAY[
            'profile_completed'::text,
            'auth_pending'::text,
            'auth'::text,
            'finalize'::text
          ]
        )
        AND coalesce(attempt_row.profile_rows_affected, '{}'::jsonb)
          @> '{"profile_shell_deleted": 1}'::jsonb
    )
    AND EXISTS (
      SELECT 1
      FROM public.account_deletion_storage_execution_audit AS audit_row
      WHERE audit_row.deletion_request_id = p_request_id
        AND audit_row.execution_attempt_id = p_attempt_id
        AND audit_row.event_type = 'profile_shell_deleted'::text
    );
$$;

ALTER FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.account_deletion_profile_completion_evidence_valid(uuid, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- D) prepare_account_deletion_auth_stage
-- Lock order: request FOR UPDATE → advisory(target) → attempt FOR UPDATE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_account_deletion_auth_stage(
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
  checked_at timestamptz := pg_catalog.now();
  row_count integer;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  SELECT request_row.id, request_row.status, request_row.user_id,
         request_row.target_user_id_snapshot
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR req.status <> 'deletion_in_progress'::text THEN
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

  SELECT attempt_row.id, attempt_row.deletion_request_id,
         attempt_row.target_user_id, attempt_row.status, attempt_row.stage,
         attempt_row.storage_manifest_status
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.stage IN (
    'auth'::text,
    'finalize'::text,
    'completed'::text
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'irreversible_stage');
  END IF;

  IF public.account_deletion_auth_preservation_hold_active(p_request_id, p_attempt_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'preservation_hold_active');
  END IF;

  IF att.stage = 'auth_pending'::text THEN
    IF NOT public.account_deletion_profile_completion_evidence_valid(
      p_request_id,
      p_attempt_id,
      resolved_target
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'inconsistent_state');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_prepared',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'stage', 'auth_pending'::text,
      'checked_at', checked_at
    );
  END IF;

  IF att.stage <> 'profile_completed'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  IF att.storage_manifest_status IS DISTINCT FROM 'finalized'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'storage_manifest_not_finalized');
  END IF;

  IF NOT public.account_deletion_profile_completion_evidence_valid(
    p_request_id,
    p_attempt_id,
    resolved_target
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_completion_not_evidence_backed');
  END IF;

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'auth_pending'::text,
    updated_at = pg_catalog.now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'profile_completed'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'auth_stage_entered'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    'auth_pending'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'prepared',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'stage', 'auth_pending'::text,
    'checked_at', checked_at
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
END;
$$;

ALTER FUNCTION public.prepare_account_deletion_auth_stage(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prepare_account_deletion_auth_stage(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_account_deletion_auth_stage(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.prepare_account_deletion_auth_stage(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion_auth_stage(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- E) claim_account_deletion_auth_execution
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_account_deletion_auth_execution(
  p_request_id uuid,
  p_attempt_id uuid,
  p_lease_seconds integer DEFAULT 900
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
  new_claim_token uuid;
  new_commit_token uuid;
  lease_until timestamptz;
  commit_until timestamptz;
  reclaimed boolean := false;
  row_count integer;
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_lease');
  END IF;

  SELECT request_row.id, request_row.status, request_row.user_id,
         request_row.target_user_id_snapshot
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR req.status <> 'deletion_in_progress'::text THEN
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

  SELECT attempt_row.id, attempt_row.deletion_request_id,
         attempt_row.target_user_id, attempt_row.status, attempt_row.stage,
         attempt_row.auth_delete_started_at,
         attempt_row.auth_delete_claim_token,
         attempt_row.auth_delete_claim_expires_at,
         attempt_row.auth_delete_commit_token,
         attempt_row.auth_delete_commit_expires_at,
         attempt_row.auth_deleted_at
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF public.account_deletion_auth_preservation_hold_active(p_request_id, p_attempt_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'preservation_hold_active');
  END IF;

  IF att.stage IN ('finalize'::text, 'completed'::text) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'irreversible_stage');
  END IF;

  IF att.stage = 'auth'::text
     AND att.auth_delete_commit_token IS NOT NULL
     AND att.auth_delete_commit_expires_at IS NOT NULL
     AND att.auth_delete_commit_expires_at > pg_catalog.now()
     AND att.auth_deleted_at IS NULL THEN
    IF att.auth_delete_claim_expires_at IS NOT NULL
       AND att.auth_delete_claim_expires_at > pg_catalog.now() THEN
      RETURN jsonb_build_object(
        'ok', true,
        'code', 'already_claimed',
        'request_id', p_request_id,
        'attempt_id', p_attempt_id,
        'target_user_id', resolved_target,
        'stage', 'auth'::text,
        'claim_token', att.auth_delete_claim_token,
        'delete_commit_token', att.auth_delete_commit_token,
        'claim_lease_expires_at', att.auth_delete_claim_expires_at,
        'delete_commit_expires_at', att.auth_delete_commit_expires_at
      );
    END IF;
  END IF;

  IF att.stage = 'auth'::text
     AND att.auth_delete_claim_expires_at IS NOT NULL
     AND att.auth_delete_claim_expires_at <= pg_catalog.now()
     AND att.auth_deleted_at IS NULL
     AND (
       att.auth_delete_commit_expires_at IS NULL
       OR att.auth_delete_commit_expires_at <= pg_catalog.now()
     ) THEN
    UPDATE public.account_deletion_execution_attempts AS expired_row
    SET
      stage = 'auth_pending'::text,
      auth_delete_claim_token = NULL,
      auth_delete_claim_expires_at = NULL,
      auth_delete_commit_token = NULL,
      auth_delete_commit_expires_at = NULL,
      updated_at = pg_catalog.now()
    WHERE expired_row.id = p_attempt_id;
    reclaimed := true;
    att.stage := 'auth_pending'::text;
    PERFORM public.account_deletion_storage_execution_audit_append(
      'auth_execution_claim_reclaimed'::text,
      p_request_id,
      p_attempt_id,
      NULL,
      NULL,
      NULL,
      NULL,
      'claim_lease_expired'
    );
  END IF;

  IF att.stage <> 'auth_pending'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  IF NOT public.account_deletion_profile_completion_evidence_valid(
    p_request_id,
    p_attempt_id,
    resolved_target
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'profile_completion_not_evidence_backed');
  END IF;

  new_claim_token := gen_random_uuid();
  new_commit_token := gen_random_uuid();
  lease_until := pg_catalog.now() + make_interval(secs => p_lease_seconds);
  commit_until := pg_catalog.now() + make_interval(secs => p_lease_seconds);

  UPDATE public.account_deletion_execution_attempts AS claim_row
  SET
    stage = 'auth'::text,
    auth_delete_started_at = coalesce(claim_row.auth_delete_started_at, pg_catalog.now()),
    auth_delete_claim_token = new_claim_token,
    auth_delete_claim_expires_at = lease_until,
    auth_delete_commit_token = new_commit_token,
    auth_delete_commit_expires_at = commit_until,
    updated_at = pg_catalog.now()
  WHERE claim_row.id = p_attempt_id
    AND claim_row.deletion_request_id = p_request_id
    AND claim_row.status = 'active'::text
    AND claim_row.stage = 'auth_pending'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'claim_conflict');
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'auth_execution_claimed'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    CASE WHEN reclaimed THEN 'reclaimed' ELSE 'claimed' END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'claimed',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'stage', 'auth'::text,
    'claim_token', new_claim_token,
    'delete_commit_token', new_commit_token,
    'claim_lease_expires_at', lease_until,
    'delete_commit_expires_at', commit_until,
    'reclaimed', reclaimed
  );
END;
$$;

ALTER FUNCTION public.claim_account_deletion_auth_execution(uuid, uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_account_deletion_auth_execution(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_account_deletion_auth_execution(uuid, uuid, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.claim_account_deletion_auth_execution(uuid, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_account_deletion_auth_execution(uuid, uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- F) complete_account_deletion_auth_execution
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_account_deletion_auth_execution(
  p_request_id uuid,
  p_attempt_id uuid,
  p_delete_commit_token uuid,
  p_outcome text
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
  rows_affected jsonb;
  row_count integer;
  checked_at timestamptz := pg_catalog.now();
BEGIN
  IF p_request_id IS NULL OR p_attempt_id IS NULL OR p_delete_commit_token IS NULL OR p_outcome IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_arguments');
  END IF;

  IF p_outcome NOT IN ('deleted'::text, 'already_absent'::text) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_outcome');
  END IF;

  SELECT request_row.id, request_row.status, request_row.user_id,
         request_row.target_user_id_snapshot
  INTO req
  FROM public.account_deletion_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR req.status <> 'deletion_in_progress'::text THEN
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

  SELECT attempt_row.id, attempt_row.deletion_request_id,
         attempt_row.target_user_id, attempt_row.status, attempt_row.stage,
         attempt_row.auth_delete_commit_token,
         attempt_row.auth_delete_commit_expires_at,
         attempt_row.auth_deleted_at,
         attempt_row.auth_delete_completion_outcome,
         attempt_row.auth_rows_affected
  INTO att
  FROM public.account_deletion_execution_attempts AS attempt_row
  WHERE attempt_row.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
     OR att.deletion_request_id IS DISTINCT FROM p_request_id
     OR att.target_user_id IS DISTINCT FROM resolved_target
     OR att.status <> 'active'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'attempt_mismatch');
  END IF;

  IF att.stage = 'finalize'::text THEN
    IF att.auth_deleted_at IS NULL
       OR att.auth_delete_completion_outcome IS DISTINCT FROM p_outcome
       OR NOT coalesce(att.auth_rows_affected, '{}'::jsonb)
         @> '{"auth_execution_completed": 1}'::jsonb THEN
      RETURN jsonb_build_object('ok', false, 'code', 'inconsistent_state');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_completed',
      'request_id', p_request_id,
      'attempt_id', p_attempt_id,
      'target_user_id', resolved_target,
      'stage', 'finalize'::text,
      'outcome', att.auth_delete_completion_outcome,
      'checked_at', checked_at
    );
  END IF;

  IF att.stage <> 'auth'::text THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stage');
  END IF;

  IF att.auth_delete_commit_token IS NULL
     OR att.auth_delete_commit_token IS DISTINCT FROM p_delete_commit_token THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delete_commit_token_mismatch');
  END IF;

  IF att.auth_delete_commit_expires_at IS NULL
     OR att.auth_delete_commit_expires_at <= pg_catalog.now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'delete_commit_expired');
  END IF;

  rows_affected :=
    coalesce(att.auth_rows_affected, '{}'::jsonb)
    || jsonb_build_object('auth_execution_completed', 1);

  UPDATE public.account_deletion_execution_attempts AS attempt_row
  SET
    stage = 'finalize'::text,
    auth_deleted_at = coalesce(attempt_row.auth_deleted_at, pg_catalog.now()),
    auth_delete_completion_outcome = p_outcome,
    auth_rows_affected = rows_affected,
    auth_delete_claim_token = NULL,
    auth_delete_claim_expires_at = NULL,
    auth_delete_commit_token = NULL,
    auth_delete_commit_expires_at = NULL,
    updated_at = pg_catalog.now()
  WHERE attempt_row.id = p_attempt_id
    AND attempt_row.deletion_request_id = p_request_id
    AND attempt_row.status = 'active'::text
    AND attempt_row.stage = 'auth'::text;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  IF row_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
  END IF;

  PERFORM public.account_deletion_storage_execution_audit_append(
    'auth_execution_completed'::text,
    p_request_id,
    p_attempt_id,
    NULL,
    NULL,
    NULL,
    NULL,
    p_outcome
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'completed',
    'request_id', p_request_id,
    'attempt_id', p_attempt_id,
    'target_user_id', resolved_target,
    'stage', 'finalize'::text,
    'outcome', p_outcome,
    'auth_rows_affected', rows_affected,
    'checked_at', checked_at
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invariant_failed');
END;
$$;

ALTER FUNCTION public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- G) Auth execution readiness
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_account_deletion_auth_execution_ready()
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
  prepare_oid oid;
  claim_oid oid;
  complete_oid oid;
  fn_def text;
  audit_check text;
BEGIN
  prepare_oid := to_regprocedure('public.prepare_account_deletion_auth_stage(uuid, uuid)');
  claim_oid := to_regprocedure(
    'public.claim_account_deletion_auth_execution(uuid, uuid, integer)'
  );
  complete_oid := to_regprocedure(
    'public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text)'
  );

  check_ok := prepare_oid IS NOT NULL AND claim_oid IS NOT NULL AND complete_oid IS NOT NULL;
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'auth_execution_rpc_present',
    'ready', check_ok,
    'detail', 'prepare/claim/complete auth execution RPCs installed'
  ));
  all_ready := all_ready AND check_ok;

  check_ok := EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attr
    WHERE attr.attrelid = 'public.account_deletion_execution_attempts'::regclass
      AND attr.attname = 'auth_delete_claim_token'
      AND NOT attr.attisdropped
  )
  AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attr
    WHERE attr.attrelid = 'public.account_deletion_execution_attempts'::regclass
      AND attr.attname = 'auth_delete_commit_token'
      AND NOT attr.attisdropped
  );
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'auth_execution_attempt_claim_columns',
    'ready', check_ok,
    'detail', 'attempt-level auth claim/commit columns present'
  ));
  all_ready := all_ready AND check_ok;

  IF prepare_oid IS NOT NULL THEN
    fn_def := pg_catalog.pg_get_functiondef(prepare_oid);
    check_ok := fn_def ILIKE '%SECURITY DEFINER%'
      AND fn_def ILIKE '%FOR UPDATE%'
      AND fn_def ILIKE '%profile_completion_evidence_valid%'
      AND fn_def NOT ILIKE '%auth.users%';
    prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
      'id', 'auth_prepare_rpc_hardening',
      'ready', check_ok,
      'detail', 'prepare is SD with locks and profile completion gate; no auth.users'
    ));
    all_ready := all_ready AND check_ok;
  END IF;

  IF complete_oid IS NOT NULL THEN
    fn_def := pg_catalog.pg_get_functiondef(complete_oid);
    check_ok := fn_def ILIKE '%delete_commit_token%'
      AND fn_def ILIKE '%finalize%'
      AND fn_def NOT ILIKE '%auth.users%'
      AND fn_def NOT ILIKE '%completed%attempt%status%deleted%';
    prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
      'id', 'auth_complete_rpc_hardening',
      'ready', check_ok,
      'detail', 'complete transitions to finalize only; no auth.users or request deleted'
    ));
    all_ready := all_ready AND check_ok;

    check_ok := pg_catalog.has_function_privilege(
      'service_role',
      'public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text)',
      'EXECUTE'
    );
    prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
      'id', 'auth_execution_grants_service_role_only',
      'ready', check_ok,
      'detail', 'auth execution RPCs executable only by service_role'
    ));
    all_ready := all_ready AND check_ok;
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(con.oid)
  INTO audit_check
  FROM pg_catalog.pg_constraint AS con
  WHERE con.conname = 'account_deletion_storage_execution_audit_event_type_check'
    AND con.conrelid = 'public.account_deletion_storage_execution_audit'::regclass;

  check_ok := audit_check ~ '''auth_execution_completed''::text';
  prerequisites := prerequisites || jsonb_build_array(jsonb_build_object(
    'id', 'auth_execution_audit_vocabulary',
    'ready', check_ok,
    'detail', 'audit CHECK includes auth_execution_completed'
  ));
  all_ready := all_ready AND check_ok;

  RETURN jsonb_build_object(
    'ready', all_ready,
    'checked_at', to_jsonb(pg_catalog.now()),
    'prerequisites', prerequisites
  );
END;
$$;

ALTER FUNCTION public.verify_account_deletion_auth_execution_ready() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verify_account_deletion_auth_execution_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_account_deletion_auth_execution_ready() FROM authenticated;
REVOKE ALL ON FUNCTION public.verify_account_deletion_auth_execution_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_auth_execution_ready() TO service_role;

-- ---------------------------------------------------------------------------
-- H) Schema execution readiness composition
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.verify_account_deletion_schema_execution_ready()
  RENAME TO verify_account_deletion_schema_execution_ready_before_3b4d;

CREATE OR REPLACE FUNCTION public.verify_account_deletion_schema_execution_ready()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prior jsonb;
  auth_ready jsonb;
  prerequisites jsonb;
  all_ready boolean;
  profile_rpc_count integer;
  auth_rpc_count integer;
BEGIN
  prior := public.verify_account_deletion_schema_execution_ready_before_3b4d();
  auth_ready := public.verify_account_deletion_auth_execution_ready();
  prerequisites :=
    coalesce(prior->'prerequisites', '[]'::jsonb)
    || coalesce(auth_ready->'prerequisites', '[]'::jsonb);

  SELECT count(*)::integer
  INTO profile_rpc_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'profile_completion_rpc_present';

  SELECT count(*)::integer
  INTO auth_rpc_count
  FROM jsonb_array_elements(prerequisites) AS elem
  WHERE elem->>'id' = 'auth_execution_rpc_present';

  all_ready :=
    coalesce((prior->>'ready')::boolean, false)
    AND coalesce((auth_ready->>'ready')::boolean, false)
    AND profile_rpc_count = 1
    AND auth_rpc_count = 1;

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

COMMENT ON FUNCTION public.prepare_account_deletion_auth_stage(uuid, uuid) IS
  '3B.4D.1 profile_completed → auth_pending after profile completion evidence gate. '
  'Lock order: request FOR UPDATE, advisory(target), attempt FOR UPDATE. No auth.users access.';

COMMENT ON FUNCTION public.claim_account_deletion_auth_execution(uuid, uuid, integer) IS
  '3B.4D.1 auth_pending → auth with lease-bound claim+commit tokens. '
  'Expired lease reopens auth_pending for deterministic reclaim. No caller target input.';

COMMENT ON FUNCTION public.complete_account_deletion_auth_execution(uuid, uuid, uuid, text) IS
  '3B.4D.1 auth → finalize on verified-absence outcomes deleted/already_absent. '
  'Sets auth_deleted_at once; request stays deletion_in_progress; no auth.users mutation.';

COMMIT;
